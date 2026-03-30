import type { Context } from "hedera-agent-kit";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/utils/t3n-session.js", () => ({
  getValidatedT3nSessionState: vi.fn(),
}));

import { validateT3nAuthSessionTool } from "../../src/tools/validate-t3n-auth-session.js";
import { getValidatedT3nSessionState } from "../../src/utils/t3n-session.js";

const context: Context = {} as Context;
const mockClient =
  null as unknown as Parameters<ReturnType<typeof validateT3nAuthSessionTool>["execute"]>[0];
const getValidatedT3nSessionStateMock = vi.mocked(getValidatedT3nSessionState);

const buildTool = () => validateT3nAuthSessionTool(context);

describe("VALIDATE_T3N_AUTH_SESSION tool", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns success metadata when the session is valid", async () => {
    getValidatedT3nSessionStateMock.mockReturnValue({
      isValid: true,
      client: {} as never,
      did: "did:t3n:a:test-session",
      networkTier: "testnet",
      baseUrl: "https://cn-api.sg.staging.t3n.terminal3.io",
      identityPath: "/tmp/agent_identity.json",
    });

    const tool = buildTool();
    const result = await tool.execute(mockClient, context, {});

    expect(result.raw).toEqual({
      success: true,
      isValid: true,
      did: "did:t3n:a:test-session",
      network: "testnet",
    });
    expect(result.humanMessage).toBe("T3N authentication session is valid.");
  });

  it("returns a no-session error when no session exists", async () => {
    getValidatedT3nSessionStateMock.mockReturnValue({
      isValid: false,
      reason: "no_session",
    });

    const tool = buildTool();
    const result = await tool.execute(mockClient, context, {});

    expect(result.raw).toEqual({
      success: false,
      error: "NO_T3N_AUTH_SESSION",
      isValid: false,
    });
    expect(result.humanMessage).toBe(
      "No authenticated T3N session found. Call `CREATE_T3N_AUTH_SESSION` first."
    );
  });

  it("returns an invalid-session error when the DID is missing", async () => {
    getValidatedT3nSessionStateMock.mockReturnValue({
      isValid: false,
      reason: "no_did",
    });

    const tool = buildTool();
    const result = await tool.execute(mockClient, context, {});

    expect(result.raw).toEqual({
      success: false,
      error: "T3N_AUTH_SESSION_INVALID",
      isValid: false,
    });
    expect(result.humanMessage).toBe(
      "The current T3N session is missing an authenticated DID. Recreate the session with `CREATE_T3N_AUTH_SESSION` and retry."
    );
  });

  it("rejects extra parameters", async () => {
    const tool = buildTool();
    const result = await tool.execute(mockClient, context, {
      includeDid: true,
    });

    expect(result.raw).toEqual({
      success: false,
      error: "INVALID_PARAMETERS",
    });
    expect(result.humanMessage).toBe(
      "Invalid parameters. This tool does not accept any parameters."
    );
    expect(getValidatedT3nSessionStateMock).not.toHaveBeenCalled();
  });
});
