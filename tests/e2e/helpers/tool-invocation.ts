/**
 * Purpose: Test helper for invoking agent tools via LLM-driven tool calling
 * Scope:   Invokes agent with prompts, parses tool calls, handles retries with follow-up prompts
 * Inputs:  Agent instance, response parser, thread ID, user prompts
 * Outputs: Tool call data and agent response
 */

import type { ResponseParserService } from "hedera-agent-kit";

import type { AgentSetup } from "./agent-setup.js";

const AGENT_INVOKE_TIMEOUT_MS = 90_000;

type AgentResponse = Awaited<ReturnType<AgentSetup["agent"]["invoke"]>>;

type AgentMessage = {
  type?: string;
  role?: string;
  content?: string | unknown[];
  tool_calls?: unknown[];
  name?: string;
};

type ToolCall = {
  toolName?: string;
  parsedData?: {
    raw?: unknown;
    humanMessage?: string;
  };
};

type AgentState = {
  values?: {
    messages?: AgentMessage[];
  };
};

type InvokeToolDiagnostics = {
  parsedToolNames: string[];
  parsedToolData: ToolCall[];
};

type InvokeToolOptions = {
  agent: AgentSetup["agent"];
  cleanup?: () => void;
  responseParser: ResponseParserService;
  threadId: string;
  userPrompt: string;
  expectedToolNames: string[];
  expectedToolLabel: string;
  followUpPrompt?: string;
  recursionLimit?: number;
  timeoutMs?: number;
  requireExactlyOneMatchingToolCall?: boolean;
  disallowUnexpectedToolCalls?: boolean;
  allowedToolNames?: string[];
};

const TOOL_CALL_HINT = "Use a model that supports tool calling (e.g. ollama pull gemma4:latest).";
const DEBUG_HEADER = "--- Debug: response.messages summary ---";
const DEBUG_FOOTER = "--- End debug ---";

function readToolCallSuccess(toolCall?: ToolCall): boolean | undefined {
  const raw = toolCall?.parsedData?.raw;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }

  const success = (raw as { success?: unknown }).success;
  return typeof success === "boolean" ? success : undefined;
}

function selectPreferredToolCall(
  parsedToolData: ToolCall[],
  matchesExpectedTool: (candidate?: ToolCall) => boolean
): ToolCall | undefined {
  const matchingToolCalls = parsedToolData.filter((candidate) => matchesExpectedTool(candidate));
  if (matchingToolCalls.length === 0) {
    return undefined;
  }

  const successfulToolCalls = matchingToolCalls.filter(
    (candidate) => readToolCallSuccess(candidate) === true
  );

  if (successfulToolCalls.length > 0) {
    return successfulToolCalls.at(-1);
  }

  return matchingToolCalls.at(-1);
}

function collectToolNames(parsedToolData: ToolCall[]): string[] {
  return parsedToolData
    .map((candidate) => candidate.toolName?.trim())
    .filter((name): name is string => Boolean(name));
}

function isGraphRecursionLimitError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return message.includes("GRAPH_RECURSION_LIMIT") || message.includes("Recursion limit of");
}

async function invokeWithStateFallback(
  agent: AgentSetup["agent"],
  cleanup: (() => void) | undefined,
  threadId: string,
  userPrompt: string,
  recursionLimit: number,
  timeoutMs: number
): Promise<AgentResponse> {
  try {
    return await agent.invoke(
      { messages: [{ role: "user", content: userPrompt }] },
      {
        configurable: { thread_id: threadId },
        recursionLimit,
        timeout: timeoutMs,
      }
    );
  } catch (error) {
    if (!isGraphRecursionLimitError(error)) {
      // Abort only when invocation fails, instead of after every successful invoke.
      // Per-call aborts can leave delayed rejections that surface as Vitest unhandled errors.
      cleanup?.();
      throw error;
    }

    const statefulAgent = agent as AgentSetup["agent"] & {
      getState?: (config: {
        configurable: { thread_id: string };
      }) => Promise<AgentState>;
    };

    if (typeof statefulAgent.getState !== "function") {
      cleanup?.();
      throw error;
    }

    const state = (await statefulAgent.getState({
      configurable: { thread_id: threadId },
    })) as AgentState;
    const recoveredMessages = Array.isArray(state.values?.messages)
      ? state.values.messages
      : [];

    if (recoveredMessages.length === 0) {
      cleanup?.();
      throw error;
    }

    return {
      messages: recoveredMessages,
    } as AgentResponse;
  }
}

export async function invokeAgentTool({
  agent,
  cleanup,
  responseParser,
  threadId,
  userPrompt,
  expectedToolNames,
  expectedToolLabel,
  followUpPrompt = `Call the ${expectedToolLabel} tool now. Do not reply with text only.`,
  recursionLimit = 15,
  timeoutMs = AGENT_INVOKE_TIMEOUT_MS,
  requireExactlyOneMatchingToolCall = false,
  disallowUnexpectedToolCalls = false,
  allowedToolNames,
}: InvokeToolOptions): Promise<{
  toolCall: ToolCall;
  response: AgentResponse;
  diagnostics: InvokeToolDiagnostics;
}> {
  const matchesExpectedTool = (candidate?: ToolCall): boolean =>
    Boolean(candidate?.toolName && expectedToolNames.includes(candidate.toolName));

  let response = await invokeWithStateFallback(
    agent,
    cleanup,
    threadId,
    userPrompt,
    recursionLimit,
    timeoutMs
  );

  const allParsedToolData = responseParser.parseNewToolMessages(response as AgentResponse) as ToolCall[];
  let toolCall = selectPreferredToolCall(allParsedToolData, matchesExpectedTool);

  if ((!toolCall || !matchesExpectedTool(toolCall)) && (response.messages?.length ?? 0) <= 2) {
    response = await invokeWithStateFallback(
      agent,
      cleanup,
      threadId,
      followUpPrompt,
      recursionLimit,
      timeoutMs
    );
    const followUpParsedToolData = responseParser.parseNewToolMessages(response as AgentResponse) as ToolCall[];
    allParsedToolData.push(...followUpParsedToolData);
    toolCall = selectPreferredToolCall(allParsedToolData, matchesExpectedTool);
  }

  const matchingToolCalls = allParsedToolData.filter((candidate) =>
    matchesExpectedTool(candidate)
  );

  if (requireExactlyOneMatchingToolCall && matchingToolCalls.length !== 1) {
    throw new Error(
      formatStrictToolFailureMessage({
        expectedToolLabel,
        reason:
          matchingToolCalls.length === 0
            ? "Expected exactly one matching tool call, but none were captured."
            : `Expected exactly one matching tool call, but captured ${matchingToolCalls.length}.`,
        parsedToolData: allParsedToolData,
      })
    );
  }

  if (disallowUnexpectedToolCalls) {
    const allowedSet = new Set([...(allowedToolNames ?? []), ...expectedToolNames]);
    const unexpected = collectToolNames(allParsedToolData).filter(
      (toolName) => !allowedSet.has(toolName)
    );
    if (unexpected.length > 0) {
      throw new Error(
        formatStrictToolFailureMessage({
          expectedToolLabel,
          reason: `Captured unexpected tool call(s): ${unexpected.join(", ")}.`,
          parsedToolData: allParsedToolData,
        })
      );
    }
  }

  if (!toolCall || !matchesExpectedTool(toolCall)) {
    throw new Error(
      formatToolFailureMessage(
        response.messages ?? [],
        allParsedToolData,
        expectedToolLabel
      )
    );
  }

  return {
    toolCall,
    response,
    diagnostics: {
      parsedToolNames: collectToolNames(allParsedToolData),
      parsedToolData: allParsedToolData,
    },
  };
}

function formatStrictToolFailureMessage(params: {
  expectedToolLabel: string;
  reason: string;
  parsedToolData: ToolCall[];
}): string {
  const parsedToolsDescription = formatParsedToolData(params.parsedToolData);

  return [
    `LLM tool invocation policy failed for ${params.expectedToolLabel}.`,
    params.reason,
    `Captured tool calls: ${parsedToolsDescription}`,
    TOOL_CALL_HINT,
  ].join("\n");
}

function formatParsedToolData(parsedToolData: ToolCall[]): string {
  if (parsedToolData.length === 0) {
    return "none";
  }

  return parsedToolData
    .map((toolCall, index) => {
      const toolName = toolCall.toolName?.trim() || "unknown";
      return `[${index}] ${toolName} raw=${JSON.stringify(toolCall.parsedData?.raw)}`;
    })
    .join("\n");
}

function formatAgentMessagesSummary(messages: AgentMessage[]): string {
  if (messages.length === 0) {
    return "No messages returned.";
  }

  const lines: string[] = [];
  lines.push(`Total messages: ${messages.length}`);

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
    const safePreview = contentPreview.replace(/\s+/g, " ").slice(0, 120);
    lines.push(
      `  [${index}] type=${type}` +
        (message.name ? ` name=${message.name}` : "") +
        ` tool_calls=${toolCalls} content_preview=${JSON.stringify(safePreview)}`
    );
  });

  return lines.join("\n");
}

function formatToolFailureMessage(
  messages: AgentMessage[],
  parsedToolData: ToolCall[],
  expectedToolLabel: string
): string {
  const debugSummary = formatAgentMessagesSummary(messages);
  return [
    `LLM did not call ${expectedToolLabel}.`,
    TOOL_CALL_HINT,
    DEBUG_HEADER,
    debugSummary,
    `parsedNewToolMessages length: ${parsedToolData.length}`,
    `parsedNewToolMessages summary:\n${formatParsedToolData(parsedToolData)}`,
    DEBUG_FOOTER,
  ].join("\n");
}
