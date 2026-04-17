import { describe, expect, it, vi } from "vitest";

import { invokeAgentTool } from "../e2e/helpers/tool-invocation.js";

type MockResponse = {
  id: string;
  messages: Array<{ role: string; content: string }>;
};

type ParsedToolCall = {
  toolName: string;
  parsedData: { raw: { success: boolean } };
};

type TestAgent = Parameters<typeof invokeAgentTool>[0]["agent"];
type TestResponseParser = Parameters<typeof invokeAgentTool>[0]["responseParser"];

function createTestAgent(invoke: (input: unknown, options: unknown) => Promise<MockResponse>): TestAgent {
  return { invoke } as unknown as TestAgent;
}

function createTestResponseParser(
  parseNewToolMessages: (response: MockResponse) => ParsedToolCall[]
): TestResponseParser {
  return { parseNewToolMessages } as unknown as TestResponseParser;
}

function createResponse(id: string, messageCount = 1): MockResponse {
  return {
    id,
    messages: Array.from({ length: messageCount }, () => ({
      role: "assistant",
      content: "ok",
    })),
  };
}

describe("invokeAgentTool strict invocation policy", () => {
  it("passes when exactly one matching tool call is captured", async () => {
    const invoke = vi.fn(() => Promise.resolve(createResponse("single")));
    const parseNewToolMessages = vi.fn((response: MockResponse) => {
      if (response.id === "single") {
        return [
          {
            toolName: "AUTH_AGENT_CONTEXT",
            parsedData: { raw: { success: true } },
          },
        ];
      }
      return [];
    });

    const result = await invokeAgentTool({
      agent: createTestAgent(invoke),
      responseParser: createTestResponseParser(parseNewToolMessages),
      threadId: "thread-single",
      userPrompt: "Inspect readiness",
      expectedToolNames: ["AUTH_AGENT_CONTEXT"],
      expectedToolLabel: "AUTH_AGENT_CONTEXT",
      requireExactlyOneMatchingToolCall: true,
      disallowUnexpectedToolCalls: true,
    });

    expect(result.toolCall.toolName).toBe("AUTH_AGENT_CONTEXT");
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("fails when more than one matching tool call is captured", async () => {
    const invoke = vi.fn(() => Promise.resolve(createResponse("multiple", 3)));
    const parseNewToolMessages = vi.fn(() => [
      {
        toolName: "AUTH_AGENT_CONTEXT",
        parsedData: { raw: { success: true } },
      },
      {
        toolName: "AUTH_AGENT_CONTEXT",
        parsedData: { raw: { success: true } },
      },
    ]);

    await expect(
      invokeAgentTool({
        agent: createTestAgent(invoke),
        responseParser: createTestResponseParser(parseNewToolMessages),
        threadId: "thread-multiple",
        userPrompt: "Inspect readiness",
        expectedToolNames: ["AUTH_AGENT_CONTEXT"],
        expectedToolLabel: "AUTH_AGENT_CONTEXT",
        requireExactlyOneMatchingToolCall: true,
      })
    ).rejects.toThrow("Expected exactly one matching tool call, but captured 2.");
  });

  it("fails when unexpected tool calls are captured in strict mode", async () => {
    const invoke = vi.fn(() => Promise.resolve(createResponse("unexpected", 3)));
    const parseNewToolMessages = vi.fn(() => [
      {
        toolName: "PRIVATE_DATA_PROCESSING",
        parsedData: { raw: { success: true } },
      },
      {
        toolName: "AUTH_AGENT_CONTEXT",
        parsedData: { raw: { success: true } },
      },
    ]);

    await expect(
      invokeAgentTool({
        agent: createTestAgent(invoke),
        responseParser: createTestResponseParser(parseNewToolMessages),
        threadId: "thread-unexpected",
        userPrompt: "Run private data processing",
        expectedToolNames: ["PRIVATE_DATA_PROCESSING"],
        expectedToolLabel: "PRIVATE_DATA_PROCESSING",
        requireExactlyOneMatchingToolCall: true,
        disallowUnexpectedToolCalls: true,
      })
    ).rejects.toThrow("Captured unexpected tool call(s): AUTH_AGENT_CONTEXT.");
  });

  it("supports follow-up prompt and enforces strictness across both attempts", async () => {
    const invoke = vi
      .fn()
      .mockImplementationOnce(() => Promise.resolve(createResponse("first")))
      .mockImplementationOnce(() => Promise.resolve(createResponse("second")));
    const parseNewToolMessages = vi.fn((response: MockResponse) => {
      if (response.id === "first") {
        return [];
      }
      return [
        {
          toolName: "PRIVATE_DATA_PROCESSING",
          parsedData: { raw: { success: true } },
        },
      ];
    });

    const result = await invokeAgentTool({
      agent: createTestAgent(invoke),
      responseParser: createTestResponseParser(parseNewToolMessages),
      threadId: "thread-follow-up",
      userPrompt: "run private data processing",
      followUpPrompt: "call private data tool",
      expectedToolNames: ["PRIVATE_DATA_PROCESSING"],
      expectedToolLabel: "PRIVATE_DATA_PROCESSING",
      requireExactlyOneMatchingToolCall: true,
      disallowUnexpectedToolCalls: true,
    });

    expect(result.toolCall.toolName).toBe("PRIVATE_DATA_PROCESSING");
    expect(invoke).toHaveBeenCalledTimes(2);
  });
});
