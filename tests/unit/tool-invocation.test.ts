import { describe, expect, it, vi } from "vitest";

import { invokeAgentTool } from "../e2e/helpers/tool-invocation.js";

type MockResponse = {
  id: string;
  messages: Array<{ role: string; content: string }>;
};

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
    const invoke = vi.fn(async () => createResponse("single"));
    const parseNewToolMessages = vi.fn((response: MockResponse) => {
      if (response.id === "single") {
        return [
          {
            toolName: "CREATE_T3N_AUTH_SESSION",
            parsedData: { raw: { success: true } },
          },
        ];
      }
      return [];
    });

    const result = await invokeAgentTool({
      agent: { invoke } as any,
      responseParser: { parseNewToolMessages } as any,
      threadId: "thread-single",
      userPrompt: "Create session",
      expectedToolNames: ["CREATE_T3N_AUTH_SESSION"],
      expectedToolLabel: "CREATE_T3N_AUTH_SESSION",
      requireExactlyOneMatchingToolCall: true,
      disallowUnexpectedToolCalls: true,
    });

    expect(result.toolCall.toolName).toBe("CREATE_T3N_AUTH_SESSION");
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("fails when more than one matching tool call is captured", async () => {
    const invoke = vi.fn(async () => createResponse("multiple", 3));
    const parseNewToolMessages = vi.fn(() => [
      {
        toolName: "CREATE_T3N_AUTH_SESSION",
        parsedData: { raw: { success: true } },
      },
      {
        toolName: "CREATE_T3N_AUTH_SESSION",
        parsedData: { raw: { success: true } },
      },
    ]);

    await expect(
      invokeAgentTool({
        agent: { invoke } as any,
        responseParser: { parseNewToolMessages } as any,
        threadId: "thread-multiple",
        userPrompt: "Create session",
        expectedToolNames: ["CREATE_T3N_AUTH_SESSION"],
        expectedToolLabel: "CREATE_T3N_AUTH_SESSION",
        requireExactlyOneMatchingToolCall: true,
      })
    ).rejects.toThrow("Expected exactly one matching tool call, but captured 2.");
  });

  it("fails when unexpected tool calls are captured in strict mode", async () => {
    const invoke = vi.fn(async () => createResponse("unexpected", 3));
    const parseNewToolMessages = vi.fn(() => [
      {
        toolName: "ADD_USER_DID",
        parsedData: { raw: { success: true } },
      },
      {
        toolName: "GET_USER_DID",
        parsedData: { raw: { success: true } },
      },
    ]);

    await expect(
      invokeAgentTool({
        agent: { invoke } as any,
        responseParser: { parseNewToolMessages } as any,
        threadId: "thread-unexpected",
        userPrompt: "Store did",
        expectedToolNames: ["ADD_USER_DID"],
        expectedToolLabel: "ADD_USER_DID",
        requireExactlyOneMatchingToolCall: true,
        disallowUnexpectedToolCalls: true,
      })
    ).rejects.toThrow("Captured unexpected tool call(s): GET_USER_DID.");
  });

  it("supports follow-up prompt and enforces strictness across both attempts", async () => {
    const invoke = vi
      .fn()
      .mockImplementationOnce(async () => createResponse("first"))
      .mockImplementationOnce(async () => createResponse("second"));
    const parseNewToolMessages = vi.fn((response: MockResponse) => {
      if (response.id === "first") {
        return [];
      }
      return [
        {
          toolName: "VALIDATE_T3N_AUTH_SESSION",
          parsedData: { raw: { success: true } },
        },
      ];
    });

    const result = await invokeAgentTool({
      agent: { invoke } as any,
      responseParser: { parseNewToolMessages } as any,
      threadId: "thread-follow-up",
      userPrompt: "validate session",
      followUpPrompt: "call validate tool",
      expectedToolNames: ["VALIDATE_T3N_AUTH_SESSION"],
      expectedToolLabel: "VALIDATE_T3N_AUTH_SESSION",
      requireExactlyOneMatchingToolCall: true,
      disallowUnexpectedToolCalls: true,
    });

    expect(result.toolCall.toolName).toBe("VALIDATE_T3N_AUTH_SESSION");
    expect(invoke).toHaveBeenCalledTimes(2);
  });
});
