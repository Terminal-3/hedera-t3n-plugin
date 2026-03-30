import type { Context } from "hedera-agent-kit";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/utils/t3n-session.js", () => ({
  createOrReuseT3nSessionFromIdentity: vi.fn(),
}));

import { createT3nAuthSessionTool } from "../../src/tools/create-t3n-auth-session.js";
import { createOrReuseT3nSessionFromIdentity } from "../../src/utils/t3n-session.js";

const context: Context = {} as Context;
const mockClient =
  null as unknown as Parameters<ReturnType<typeof createT3nAuthSessionTool>["execute"]>[0];
const createOrReuseT3nSessionFromIdentityMock = vi.mocked(
  createOrReuseT3nSessionFromIdentity
);

const buildTool = () => createT3nAuthSessionTool(context);

describe("CREATE_T3N_AUTH_SESSION tool", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns success metadata when a new session is created", async () => {
    createOrReuseT3nSessionFromIdentityMock.mockResolvedValue({
      did: "did:t3n:a:test-session",
      reused: false,
      networkTier: "testnet",
      baseUrl: "https://cn-api.sg.staging.t3n.terminal3.io",
    });

    const tool = buildTool();
    const result = await tool.execute(mockClient, context, {});

    expect(result.raw).toEqual({
      success: true,
      did: "did:t3n:a:test-session",
      reused: false,
      network: "testnet",
    });
    expect(result.humanMessage).toBe("T3N authentication session created successfully.");
  });

  it("returns success metadata when an existing session is reused", async () => {
    createOrReuseT3nSessionFromIdentityMock.mockResolvedValue({
      did: "did:t3n:a:test-session",
      reused: true,
      networkTier: "testnet",
      baseUrl: "https://cn-api.sg.staging.t3n.terminal3.io",
    });

    const tool = buildTool();
    const result = await tool.execute(mockClient, context, {});

    expect(result.raw).toEqual({
      success: true,
      did: "did:t3n:a:test-session",
      reused: true,
      network: "testnet",
    });
    expect(result.humanMessage).toBe("T3N authentication session already exists and is valid.");
  });

  it("retries transient T3N failures and succeeds on a later attempt", async () => {
    createOrReuseT3nSessionFromIdentityMock
      .mockRejectedValueOnce(new Error("HTTP 502: Bad Gateway"))
      .mockResolvedValueOnce({
        did: "did:t3n:a:test-session",
        reused: false,
        networkTier: "testnet",
        baseUrl: "https://cn-api.sg.staging.t3n.terminal3.io",
      });

    const tool = buildTool();
    const result = await tool.execute(mockClient, context, {});

    expect(result.raw).toEqual({
      success: true,
      did: "did:t3n:a:test-session",
      reused: false,
      network: "testnet",
    });
    expect(createOrReuseT3nSessionFromIdentityMock).toHaveBeenCalledTimes(2);
  });

  it("sanitizes missing identity configuration errors", async () => {
    createOrReuseT3nSessionFromIdentityMock.mockRejectedValue(
      new Error("Agent identity configuration path not set. Please run pnpm create-identity.")
    );

    const tool = buildTool();
    const result = await tool.execute(mockClient, context, {});

    expect(result.raw).toEqual({
      success: false,
      error: "IDENTITY_CONFIG_MISSING",
    });
    expect(result.humanMessage).toBe(
      "Agent identity configuration is not available. Run `pnpm create-identity` and set `AGENT_IDENTITY_CONFIG_PATH`, then retry."
    );
    expect(createOrReuseT3nSessionFromIdentityMock).toHaveBeenCalledTimes(1);
  });

  it("sanitizes invalid identity configuration errors", async () => {
    createOrReuseT3nSessionFromIdentityMock.mockRejectedValue(
      new Error("The file at /tmp/agent_identity.json contains invalid JSON.")
    );

    const tool = buildTool();
    const result = await tool.execute(mockClient, context, {});

    expect(result.raw).toEqual({
      success: false,
      error: "IDENTITY_CONFIG_INVALID",
    });
    expect(result.humanMessage).toBe(
      "Agent identity configuration is invalid. Regenerate or fix the local identity file before retrying."
    );
    expect(createOrReuseT3nSessionFromIdentityMock).toHaveBeenCalledTimes(1);
  });

  it("rejects extra parameters", async () => {
    const tool = buildTool();
    const result = await tool.execute(mockClient, context, {
      force: true,
    });

    expect(result.raw).toEqual({
      success: false,
      error: "INVALID_PARAMETERS",
    });
    expect(result.humanMessage).toBe(
      "Invalid parameters. This tool does not accept any parameters."
    );
    expect(createOrReuseT3nSessionFromIdentityMock).not.toHaveBeenCalled();
  });
});
