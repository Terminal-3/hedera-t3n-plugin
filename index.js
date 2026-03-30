// index.js – Example: agent with Hedera T3N plugin (default: Ollama).
// Full Ollama + retry logic: see hedera-t3n-plugin tests/e2e/e2e-ollama-tool.e2e.ts
import { Client, PrivateKey } from "@hashgraph/sdk";
import {
  HederaLangchainToolkit,
  AgentMode,
  ResponseParserService,
} from "hedera-agent-kit";
import { hederaT3nPlugin } from "@terminal3/hedera-t3n-plugin";
import { createAgent } from "langchain";
import { MemorySaver } from "@langchain/langgraph";
import { ChatOllama } from "@langchain/ollama";
// import { ChatOpenAI } from '@langchain/openai';
// import { ChatGroq } from '@langchain/groq'; // May return tool_use_failed; use Ollama if you hit that.
import dotenv from "dotenv";

dotenv.config();

const AGENT_INVOKE_TIMEOUT_MS = 90_000;
const OLLAMA_REQUEST_TIMEOUT_MS = 60_000;
const TOOL_CALL_HINT =
  "Use a model that supports tool calling (e.g. ollama pull qwen2.5).";
const DEBUG_HEADER = "--- Debug: response.messages summary ---";
const DEBUG_FOOTER = "--- End debug ---";

function createTimedFetch(timeoutMs) {
  return async (input, init) => {
    const controller = new AbortController();
    const upstreamSignal = init?.signal;
    let streamActive = false;
    let timeout;

    const forwardAbort = () => {
      controller.abort(upstreamSignal?.reason);
    };
    const resetTimeout = () => {
      if (timeout) {
        clearTimeout(timeout);
      }
      timeout = setTimeout(() => {
        controller.abort(new Error(`Ollama request timed out after ${timeoutMs}ms.`));
      }, timeoutMs);
    };
    const clearRequestTimeout = () => {
      if (timeout) {
        clearTimeout(timeout);
        timeout = undefined;
      }
    };
    const finalizeRequest = () => {
      clearRequestTimeout();
      upstreamSignal?.removeEventListener("abort", forwardAbort);
    };

    upstreamSignal?.addEventListener("abort", forwardAbort);
    resetTimeout();

    try {
      const response = await fetch(input, {
        ...init,
        signal: controller.signal,
      });
      clearRequestTimeout();

      if (!response.body) {
        finalizeRequest();
        return response;
      }

      const reader = response.body.getReader();
      streamActive = true;
      resetTimeout();

      const stream = new ReadableStream({
        async pull(streamController) {
          try {
            const chunk = await reader.read();
            if (chunk.done) {
              finalizeRequest();
              streamController.close();
              return;
            }

            resetTimeout();
            streamController.enqueue(chunk.value);
          } catch (error) {
            finalizeRequest();
            if (controller.signal.aborted && !upstreamSignal?.aborted) {
              streamController.error(
                new Error(`Ollama request timed out after ${timeoutMs}ms.`),
              );
              return;
            }
            streamController.error(error);
          }
        },
        async cancel(reason) {
          finalizeRequest();
          controller.abort(reason);
          await reader.cancel(reason);
        },
      });

      return new Response(stream, {
        headers: response.headers,
        status: response.status,
        statusText: response.statusText,
      });
    } catch (error) {
      if (controller.signal.aborted && !upstreamSignal?.aborted) {
        throw new Error(`Ollama request timed out after ${timeoutMs}ms.`);
      }
      throw error;
    } finally {
      if (!streamActive) {
        finalizeRequest();
      }
    }
  };
}

function readToolCallSuccess(toolCall) {
  const raw = toolCall?.parsedData?.raw;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }

  const success = raw.success;
  return typeof success === "boolean" ? success : undefined;
}

function selectPreferredToolCall(parsedToolData, expectedToolNames) {
  const matchingToolCalls = parsedToolData.filter((candidate) =>
    candidate?.toolName && expectedToolNames.includes(candidate.toolName),
  );
  if (matchingToolCalls.length === 0) {
    return undefined;
  }

  const successfulToolCalls = matchingToolCalls.filter(
    (candidate) => readToolCallSuccess(candidate) === true,
  );
  if (successfulToolCalls.length > 0) {
    return successfulToolCalls.at(-1);
  }

  return matchingToolCalls.at(-1);
}

function isGraphRecursionLimitError(error) {
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return message.includes("GRAPH_RECURSION_LIMIT") || message.includes("Recursion limit of");
}

async function invokeWithStateFallback({
  agent,
  threadId,
  prompt,
  recursionLimit,
}) {
  try {
    return await agent.invoke(
      { messages: [{ role: "user", content: prompt }] },
      {
        configurable: { thread_id: threadId },
        recursionLimit,
        timeout: AGENT_INVOKE_TIMEOUT_MS,
      },
    );
  } catch (error) {
    if (!isGraphRecursionLimitError(error) || typeof agent.getState !== "function") {
      throw error;
    }

    const state = await agent.getState({
      configurable: { thread_id: threadId },
    });
    const recoveredMessages = Array.isArray(state?.values?.messages)
      ? state.values.messages
      : [];

    if (recoveredMessages.length === 0) {
      throw error;
    }

    return { messages: recoveredMessages };
  }
}

function formatAgentMessagesSummary(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return "No messages returned.";
  }

  const lines = [`Total messages: ${messages.length}`];
  messages.forEach((message, index) => {
    const type = message.type ?? message.role ?? "unknown";
    const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls.length : 0;
    let contentPreview = "";
    if (typeof message.content === "string") {
      contentPreview = message.content.slice(0, 200);
    } else if (Array.isArray(message.content)) {
      contentPreview = `(array, ${message.content.length} parts)`;
    } else {
      contentPreview = String(message.content ?? "").slice(0, 80);
    }

    lines.push(
      `  [${index}] type=${type}` +
        (message.name ? ` name=${message.name}` : "") +
        ` tool_calls=${toolCalls} content_preview=${JSON.stringify(
          contentPreview.replace(/\s+/g, " ").slice(0, 120),
        )}`,
    );
  });

  return lines.join("\n");
}

function formatToolFailureMessage(messages, parsedCount, toolLabel, expectedToolNames) {
  return [
    `LLM did not call ${toolLabel}.`,
    TOOL_CALL_HINT,
    `Expected tool names: ${expectedToolNames.join(", ")}`,
    DEBUG_HEADER,
    formatAgentMessagesSummary(messages),
    `parsedNewToolMessages length: ${parsedCount}`,
    DEBUG_FOOTER,
  ].join("\n");
}

function printGuidance(parsedData) {
  if (!parsedData || typeof parsedData !== "object") {
    return;
  }

  if (parsedData.profileUrl) {
    console.log("  profile_url:", parsedData.profileUrl);
  }
  if (parsedData.onboardingUrl) {
    console.log("  onboarding_url:", parsedData.onboardingUrl);
  }
  if (parsedData.agentsUrl) {
    console.log("  agents_url:", parsedData.agentsUrl);
  }

  const instructions = parsedData.instructions;
  if (!instructions || typeof instructions !== "object") {
    return;
  }

  console.log("  next_steps:");
  if (instructions.type === "steps") {
    if (instructions.step1) {
      console.log("   1.", instructions.step1);
    }
    if (instructions.step2) {
      console.log("   2.", instructions.step2);
    }
    if (instructions.step3) {
      console.log("   3.", instructions.step3);
    }
    return;
  }

  if (instructions.type === "authorization") {
    if (instructions.agentsUrl) {
      console.log("   1. Visit", instructions.agentsUrl);
    }
    console.log(
      "   2. Grant permission:",
      instructions.permission ?? "Profile Verification",
    );
    if (instructions.agentDid) {
      console.log("   3. Agent DID:", instructions.agentDid);
    }
  }
}

async function invokeRequiredTool({
  agent,
  responseParser,
  threadId,
  prompt,
  followUp,
  toolLabel,
  expectedToolNames = [toolLabel, toolLabel.toLowerCase()],
  requireSuccess = true,
  recursionLimit = 15,
}) {
  let response = await invokeWithStateFallback({
    agent,
    threadId,
    prompt,
    recursionLimit,
  });
  let parsedToolData = responseParser.parseNewToolMessages(response);
  let toolCall = selectPreferredToolCall(parsedToolData, expectedToolNames);

  if ((!toolCall || !expectedToolNames.includes(toolCall.toolName)) && (response.messages?.length ?? 0) <= 2) {
    response = await invokeWithStateFallback({
      agent,
      threadId,
      prompt: followUp,
      recursionLimit,
    });
    parsedToolData = responseParser.parseNewToolMessages(response);
    toolCall = selectPreferredToolCall(parsedToolData, expectedToolNames);
  }

  if (!toolCall || !expectedToolNames.includes(toolCall.toolName)) {
    console.error(
      formatToolFailureMessage(
        response.messages ?? [],
        parsedToolData.length,
        toolLabel,
        expectedToolNames,
      ),
    );
    process.exit(1);
  }

  const parsedData = toolCall.parsedData?.raw;
  if (requireSuccess && !parsedData?.success) {
    console.error(`${toolLabel} did not report success.`, parsedData);
    process.exit(1);
  }

  return { response, toolCall, parsedData };
}

async function main() {
  if (!process.env.OLLAMA_BASE_URL || !process.env.OLLAMA_MODEL) {
    console.error(
      "Set OLLAMA_BASE_URL and OLLAMA_MODEL in .env (e.g. OLLAMA_BASE_URL=http://localhost:11434, OLLAMA_MODEL=qwen2.5).",
    );
    process.exit(1);
  }
  if (!process.env.AGENT_IDENTITY_CONFIG_PATH) {
    console.error(
      "Run pnpm create-identity first, then set AGENT_IDENTITY_CONFIG_PATH in .env.",
    );
    process.exit(1);
  }
  const accountId = process.env.HEDERA_ACCOUNT_ID;
  const privateKeyStr = process.env.HEDERA_PRIVATE_KEY;
  if (!accountId || !privateKeyStr) {
    console.error("Set HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY in .env");
    process.exit(1);
  }
  const hederaNetwork = process.env.HEDERA_NETWORK ?? "testnet";

  const client = (
    hederaNetwork === "mainnet" ? Client.forMainnet() : Client.forTestnet()
  ).setOperator(accountId, PrivateKey.fromStringECDSA(privateKeyStr));
  const toolkit = new HederaLangchainToolkit({
    client,
    configuration: {
      tools: [],
      plugins: [hederaT3nPlugin],
      context: { mode: AgentMode.AUTONOMOUS },
    },
  });
  const tools = toolkit.getTools();
  const responseParser = new ResponseParserService(tools);
  const llm = new ChatOllama({
    model: process.env.OLLAMA_MODEL,
    baseUrl: process.env.OLLAMA_BASE_URL,
    fetch: createTimedFetch(OLLAMA_REQUEST_TIMEOUT_MS),
    headers: {
      Connection: "close",
    },
    temperature: 0,
    numPredict: 128,
    keepAlive: 0,
    think: false,
  });
  const agent = createAgent({
    model: llm,
    tools,
    systemPrompt:
      "You are a helpful assistant with access to Hedera and T3N identity tools. " +
      "When the user asks to check if their agent identity is ready or validate their identity configuration, you MUST call the HAS_AGENT_IDENTITY_CONFIG tool. " +
      "When the user asks to create or open an authenticated T3N session for the current agent identity, you MUST call the CREATE_T3N_AUTH_SESSION tool. " +
      "When the user asks to validate whether the current T3N session is still authenticated, you MUST call the VALIDATE_T3N_AUTH_SESSION tool. " +
      "When the user asks you to store a user DID for later checks, you MUST call the ADD_USER_DID tool with both `userDid` and `remark`. " +
      "When the user asks you to look up stored user DIDs, you MUST call the GET_USER_DID tool with optional `userDid` and/or `remark` filters. " +
      "When the user asks you to map profile field names to T3N profile selectors, you MUST call the PROFILE_FIELD_MAPPING tool with a `fields` array. " +
      "When the user asks whether specific profile fields exist for the currently stored user DID, you MUST call the CHECK_MY_PROFILE_FIELDS tool. " +
      "When the user asks whether specific profile fields exist for another user DID, you MUST call the CHECK_PROFILE_FIELD_EXISTENCE tool. " +
      "When the user asks whether their current agent is already registered on T3N or Hedera, you MUST call the CHECK_AGENT_REGISTRATION_STATUS tool. " +
      "When the user asks to fetch the current agent registration record, you MUST call the FETCH_AGENT_REGISTRATION_RECORD tool. " +
      "Always use the appropriate tool when asked; do not just describe what you would do.",
    checkpointer: new MemorySaver(),
    middleware: [],
  });

  console.log("Sending: check identity...");
  const identityResult = await invokeRequiredTool({
    agent,
    responseParser,
    threadId: "example-identity-check",
    prompt:
      "Check if my agent identity is ready. Call HAS_AGENT_IDENTITY_CONFIG exactly once with no arguments and no prose.",
    followUp:
      "Now emit exactly one HAS_AGENT_IDENTITY_CONFIG tool call with {} as arguments and no prose.",
    toolLabel: "HAS_AGENT_IDENTITY_CONFIG",
    expectedToolNames: ["HAS_AGENT_IDENTITY_CONFIG", "has_agent_identity_config"],
  });
  console.log(
    "Identity validation result:",
    identityResult.toolCall.parsedData?.humanMessage,
  );
  if (identityResult.parsedData.path) {
    console.log("  identity_path:", identityResult.parsedData.path);
  }

  console.log("Sending: create T3N auth session...");
  const sessionResult = await invokeRequiredTool({
    agent,
    responseParser,
    threadId: "example-create-session",
    prompt:
      "Create an authenticated T3N session for my current agent identity. Call CREATE_T3N_AUTH_SESSION exactly once with no arguments and no prose.",
    followUp:
      "Now emit exactly one CREATE_T3N_AUTH_SESSION tool call with {} as arguments and no prose.",
    toolLabel: "CREATE_T3N_AUTH_SESSION",
    expectedToolNames: ["CREATE_T3N_AUTH_SESSION", "create_t3n_auth_session"],
  });
  console.log(
    "Session creation result:",
    sessionResult.toolCall.parsedData?.humanMessage,
  );
  console.log("  session_did:", sessionResult.parsedData.did);
  console.log("  reused:", sessionResult.parsedData.reused);
  console.log("  network:", sessionResult.parsedData.network);

  console.log("Sending: validate T3N auth session...");
  const validateSessionResult = await invokeRequiredTool({
    agent,
    responseParser,
    threadId: "example-validate-session",
    prompt:
      "Validate whether my current T3N session is still authenticated. Call VALIDATE_T3N_AUTH_SESSION exactly once with no arguments and no prose.",
    followUp:
      "Now emit exactly one VALIDATE_T3N_AUTH_SESSION tool call with {} as arguments and no prose.",
    toolLabel: "VALIDATE_T3N_AUTH_SESSION",
    expectedToolNames: ["VALIDATE_T3N_AUTH_SESSION", "validate_t3n_auth_session"],
  });
  console.log(
    "Session validation result:",
    validateSessionResult.toolCall.parsedData?.humanMessage,
  );
  console.log("  is_valid:", validateSessionResult.parsedData.isValid);
  console.log("  session_did:", validateSessionResult.parsedData.did);
  console.log("  network:", validateSessionResult.parsedData.network);

  const sampleUserDid =
    process.env.T3N_EXAMPLE_USER_DID ?? "did:t3n:a:sample-user-123";
  const sampleUserDidRemark =
    process.env.T3N_EXAMPLE_USER_DID_REMARK ??
    "Sample user DID for later profile checks";
  console.log("Sending: store a user DID...");
  const addUserDidResult = await invokeRequiredTool({
    agent,
    responseParser,
    threadId: "example-add-user-did",
    prompt: `Store this user DID for later checks: ${sampleUserDid}. Call ADD_USER_DID exactly once with {"userDid":"${sampleUserDid}","remark":"${sampleUserDidRemark}"} and no prose.`,
    followUp: `Now emit exactly one ADD_USER_DID tool call with {"userDid":"${sampleUserDid}","remark":"${sampleUserDidRemark}"} and no prose.`,
    toolLabel: "ADD_USER_DID",
    expectedToolNames: ["ADD_USER_DID", "add_user_did"],
  });
  console.log(
    "Add user DID result:",
    addUserDidResult.toolCall.parsedData?.humanMessage,
  );
  console.log("  user_did:", addUserDidResult.parsedData.userDid);
  console.log("  remark:", addUserDidResult.parsedData.remark);

  console.log("Sending: retrieve stored user DID...");
  const getUserDidResult = await invokeRequiredTool({
    agent,
    responseParser,
    threadId: "example-get-user-did",
    prompt: `Retrieve the stored user DID I asked you to remember. Call GET_USER_DID exactly once with {"userDid":"${sampleUserDid}"} and no prose.`,
    followUp: `Now emit exactly one GET_USER_DID tool call with {"userDid":"${sampleUserDid}"} and no prose.`,
    toolLabel: "GET_USER_DID",
    expectedToolNames: ["GET_USER_DID", "get_user_did"],
  });
  console.log(
    "Get user DID result:",
    getUserDidResult.toolCall.parsedData?.humanMessage,
  );
  console.log("  user_dids:", getUserDidResult.parsedData.userDids);

  console.log("Sending: map profile fields...");
  const profileFieldMappingResult = await invokeRequiredTool({
    agent,
    responseParser,
    threadId: "example-profile-field-mapping",
    prompt:
      'Map these profile fields for T3N lookup: ["first_name","email_address","favorite_color"]. Call PROFILE_FIELD_MAPPING exactly once with {"fields":["first_name","email_address","favorite_color"]} and no prose.',
    followUp:
      'Now emit exactly one PROFILE_FIELD_MAPPING tool call with {"fields":["first_name","email_address","favorite_color"]} and no prose.',
    toolLabel: "PROFILE_FIELD_MAPPING",
    expectedToolNames: ["PROFILE_FIELD_MAPPING", "profile_field_mapping"],
  });
  console.log(
    "Profile field mapping result:",
    profileFieldMappingResult.toolCall.parsedData?.humanMessage,
  );
  console.log(
    "  mapped_fields:",
    profileFieldMappingResult.parsedData.mappedFields,
  );
  console.log(
    "  unsupported_fields:",
    profileFieldMappingResult.parsedData.unsupportedFields,
  );

  console.log("Sending: check stored user DID profile fields...");
  const checkMyProfileFieldsResult = await invokeRequiredTool({
    agent,
    responseParser,
    threadId: "example-check-my-profile-fields",
    prompt:
      'Check whether the stored user DID has these profile fields: ["first_name","email_address"]. Call CHECK_MY_PROFILE_FIELDS exactly once with {"fields":["first_name","email_address"]} and no prose.',
    followUp:
      'Now emit exactly one CHECK_MY_PROFILE_FIELDS tool call with {"fields":["first_name","email_address"]} and no prose.',
    toolLabel: "CHECK_MY_PROFILE_FIELDS",
    expectedToolNames: ["CHECK_MY_PROFILE_FIELDS", "check_my_profile_fields"],
    requireSuccess: false,
  });
  console.log(
    "Stored user profile field existence result:",
    checkMyProfileFieldsResult.toolCall.parsedData?.humanMessage,
  );
  console.log("  did:", checkMyProfileFieldsResult.parsedData.did);
  console.log("  success:", checkMyProfileFieldsResult.parsedData.success);
  if (checkMyProfileFieldsResult.parsedData.success) {
    console.log(
      "  field_existence:",
      checkMyProfileFieldsResult.parsedData.fieldExistence,
    );
    console.log(
      "  missing_fields:",
      checkMyProfileFieldsResult.parsedData.missingFields,
    );
    console.log(
      "  unsupported_fields:",
      checkMyProfileFieldsResult.parsedData.unsupportedFields,
    );
    if (checkMyProfileFieldsResult.parsedData.profileUrl) {
      console.log(
        "  profile_url:",
        checkMyProfileFieldsResult.parsedData.profileUrl,
      );
    }
  } else {
    console.log("  guidance_error:", checkMyProfileFieldsResult.parsedData.error);
    console.log(
      "  unsupported_fields:",
      checkMyProfileFieldsResult.parsedData.unsupportedFields,
    );
    printGuidance(checkMyProfileFieldsResult.parsedData);
  }

  console.log("Sending: check another user profile fields...");
  const checkProfileFieldExistenceResult = await invokeRequiredTool({
    agent,
    responseParser,
    threadId: "example-check-profile-field-existence",
    prompt:
      'Check whether the stored user DID has these profile fields: ["first_name","email_address"]. Call CHECK_PROFILE_FIELD_EXISTENCE exactly once with {"fields":["first_name","email_address"]} and no prose.',
    followUp:
      'Now emit exactly one CHECK_PROFILE_FIELD_EXISTENCE tool call with {"fields":["first_name","email_address"]} and no prose.',
    toolLabel: "CHECK_PROFILE_FIELD_EXISTENCE",
    expectedToolNames: ["CHECK_PROFILE_FIELD_EXISTENCE", "check_profile_field_existence"],
    requireSuccess: false,
  });
  console.log(
    "Profile field existence result:",
    checkProfileFieldExistenceResult.toolCall.parsedData?.humanMessage,
  );
  console.log(
    "  target_did:",
    checkProfileFieldExistenceResult.parsedData.targetDid,
  );
  console.log(
    "  success:",
    checkProfileFieldExistenceResult.parsedData.success,
  );
  if (checkProfileFieldExistenceResult.parsedData.success) {
    console.log(
      "  field_existence:",
      checkProfileFieldExistenceResult.parsedData.fieldExistence,
    );
    console.log(
      "  missing_fields:",
      checkProfileFieldExistenceResult.parsedData.missingFields,
    );
    console.log(
      "  unsupported_fields:",
      checkProfileFieldExistenceResult.parsedData.unsupportedFields,
    );
  } else {
    console.log(
      "  guidance_error:",
      checkProfileFieldExistenceResult.parsedData.error,
    );
    console.log(
      "  unsupported_fields:",
      checkProfileFieldExistenceResult.parsedData.unsupportedFields,
    );
    printGuidance(checkProfileFieldExistenceResult.parsedData);
  }

  console.log("Sending: check registration status...");
  const statusResult = await invokeRequiredTool({
    agent,
    responseParser,
    threadId: "example-check-registration-status",
    prompt:
      "Check whether my current agent is registered on T3N and Hedera. Call CHECK_AGENT_REGISTRATION_STATUS exactly once with no arguments and no prose.",
    followUp:
      "Now emit exactly one CHECK_AGENT_REGISTRATION_STATUS tool call with {} as arguments and no prose.",
    toolLabel: "CHECK_AGENT_REGISTRATION_STATUS",
    expectedToolNames: ["CHECK_AGENT_REGISTRATION_STATUS", "check_agent_registration_status"],
  });
  console.log(
    "Registration status result:",
    statusResult.toolCall.parsedData?.humanMessage,
  );
  console.log("  network:", statusResult.parsedData.network);
  console.log("  fully_registered:", statusResult.parsedData.fullyRegistered);
  console.log("  t3n_status:", statusResult.parsedData.t3nStatus);
  console.log("  hedera_status:", statusResult.parsedData.hederaStatus);

  console.log("Sending: fetch registration record...");
  const recordResult = await invokeRequiredTool({
    agent,
    responseParser,
    threadId: "example-fetch-registration-record",
    prompt:
      "Fetch my current agent registration record from T3N and Hedera. Call FETCH_AGENT_REGISTRATION_RECORD exactly once with no arguments and no prose.",
    followUp:
      "Now emit exactly one FETCH_AGENT_REGISTRATION_RECORD tool call with {} as arguments and no prose.",
    toolLabel: "FETCH_AGENT_REGISTRATION_RECORD",
    expectedToolNames: ["FETCH_AGENT_REGISTRATION_RECORD", "fetch_agent_registration_record"],
  });
  console.log(
    "Registration record result:",
    recordResult.toolCall.parsedData?.humanMessage,
  );
  console.log("  did:", recordResult.parsedData.did);
  console.log("  network:", recordResult.parsedData.network);
  console.log(
    "  t3n_agent_uri:",
    recordResult.parsedData.t3n?.record?.agentUri,
  );
  console.log(
    "  hedera_agent_id:",
    recordResult.parsedData.hedera?.record?.agentId,
  );
  console.log(
    "  hedera_token_uri:",
    recordResult.parsedData.hedera?.record?.tokenUri,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
