import { PrivateKey, Client } from "@hiero-ledger/sdk";
import { MemorySaver } from "@langchain/langgraph";
import { ChatOllama } from "@langchain/ollama";
import { ChatOpenAI } from "@langchain/openai";
import { createAgent } from "langchain";

import { AgentMode } from "@hashgraph/hedera-agent-kit";
import { HederaLangchainToolkit, ResponseParserService } from "@hashgraph/hedera-agent-kit-langchain";

import { hederaT3nPlugin } from "./dist/plugin.js";
import { invokeAgentTool } from "./tests/e2e/helpers/tool-invocation.js";

const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";
const DEFAULT_OPENROUTER_MODEL = "openai/gpt-4o-mini";
const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const OLLAMA_REQUEST_TIMEOUT_MS = 60_000;

function createTimedFetch(timeoutMs) {
  return async (input, init) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  };
}

function getAgentSetup() {
  if (!process.env.HEDERA_ACCOUNT_ID || !process.env.HEDERA_PRIVATE_KEY) {
    throw new Error("Set HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY.");
  }

  const client = Client.forTestnet().setOperator(
    process.env.HEDERA_ACCOUNT_ID,
    PrivateKey.fromStringECDSA(process.env.HEDERA_PRIVATE_KEY)
  );

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
  const llm = process.env.GROQ_API_KEY
    ? new ChatOpenAI({
        model: process.env.GROQ_MODEL ?? DEFAULT_GROQ_MODEL,
        apiKey: process.env.GROQ_API_KEY,
        configuration: { baseURL: "https://api.groq.com/openai/v1" },
        temperature: 0,
      })
    : process.env.OPENROUTER_API_KEY
      ? new ChatOpenAI({
          model: process.env.OPENROUTER_MODEL ?? DEFAULT_OPENROUTER_MODEL,
          apiKey: process.env.OPENROUTER_API_KEY,
          configuration: { baseURL: process.env.OPENROUTER_BASE_URL ?? DEFAULT_OPENROUTER_BASE_URL },
          temperature: 0,
        })
      : new ChatOllama({
          model: process.env.OLLAMA_MODEL ?? "gemma4:latest",
          baseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
          fetch: createTimedFetch(OLLAMA_REQUEST_TIMEOUT_MS),
          temperature: 0,
          keepAlive: 0,
          think: false,
        });

  const systemPrompt =
    "You are a helpful assistant with access to Hedera and T3N identity tools. " +
    "When the user asks for a private-data-processing or profile-field-availability check, you MUST call the PRIVATE_DATA_PROCESSING tool with `userDid` and `fields`. " +
    "When the user asks whether the agent is ready, authenticated, or registered, you MUST call the AUTH_AGENT_CONTEXT tool. " +
    "Do not invent or call hidden internal tools.";

  const agent = createAgent({
    model: llm,
    tools,
    systemPrompt,
    checkpointer: new MemorySaver(),
  });

  return { agent, responseParser, cleanup: () => llm.client?.abort?.() };
}

async function main() {
  const { agent, responseParser, cleanup } = getAgentSetup();
  const sampleUserDid =
    process.env.T3N_EXAMPLE_USER_DID ?? "did:t3n:1234567890abcdef1234567890abcdef12345678";

  console.log("Sending: auth agent context...");
  const authResult = await invokeAgentTool({
    agent,
    cleanup,
    responseParser,
    threadId: "example-auth-agent-context",
    userPrompt:
      "Inspect my auth orchestration readiness. Call AUTH_AGENT_CONTEXT exactly once with no arguments and no prose.",
    followUpPrompt:
      "Now emit exactly one AUTH_AGENT_CONTEXT tool call with {} as arguments and no prose.",
    expectedToolNames: ["AUTH_AGENT_CONTEXT", "auth_agent_context"],
    expectedToolLabel: "AUTH_AGENT_CONTEXT",
  });
  console.log("AUTH_AGENT_CONTEXT result:", authResult.toolCall.parsedData?.raw);

  console.log("Sending: private data processing...");
  const privateDataResult = await invokeAgentTool({
    agent,
    cleanup,
    responseParser,
    threadId: "example-private-data-processing",
    userPrompt: `Run private data processing for ${sampleUserDid}. Call PRIVATE_DATA_PROCESSING exactly once with {"userDid":"${sampleUserDid}","fields":["first_name","email_address"]} and no prose.`,
    followUpPrompt: `Now emit exactly one PRIVATE_DATA_PROCESSING tool call with {"userDid":"${sampleUserDid}","fields":["first_name","email_address"]} and no prose.`,
    expectedToolNames: ["PRIVATE_DATA_PROCESSING", "private_data_processing"],
    expectedToolLabel: "PRIVATE_DATA_PROCESSING",
  });
  console.log("PRIVATE_DATA_PROCESSING result:", privateDataResult.toolCall.parsedData?.raw);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
