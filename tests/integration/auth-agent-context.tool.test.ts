import type { Context } from "hedera-agent-kit";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/utils/agent-identity-config.js", () => ({
  resolveAgentIdentityConfigPath: vi.fn(),
  readAgentIdentityConfig: vi.fn(),
  validateAgentIdentityConfig: vi.fn(),
}));
vi.mock("../../src/utils/t3n-session.js", () => ({
  createOrReuseT3nSessionFromIdentity: vi.fn(),
  getValidatedT3nSessionState: vi.fn(),
}));
vi.mock("../../src/utils/agent-registration.js", () => ({
  readCurrentAgentRegistration: vi.fn(),
}));

import { authAgentContextTool } from "../../src/tools/auth-agent-context.js";
import type { AuthAgentContextResult } from "../../src/utils/auth-agent-context.js";
import {
  readAgentIdentityConfig,
  resolveAgentIdentityConfigPath,
  validateAgentIdentityConfig,
} from "../../src/utils/agent-identity-config.js";
import { readCurrentAgentRegistration } from "../../src/utils/agent-registration.js";
import {
  createOrReuseT3nSessionFromIdentity,
  getValidatedT3nSessionState,
} from "../../src/utils/t3n-session.js";
import type { ToolResult } from "../../src/utils/tool-result.js";

const context: Context = {} as Context;
const mockClient =
  null as unknown as Parameters<ReturnType<typeof authAgentContextTool>["execute"]>[0];

const resolveAgentIdentityConfigPathMock = vi.mocked(resolveAgentIdentityConfigPath);
const readAgentIdentityConfigMock = vi.mocked(readAgentIdentityConfig);
const validateAgentIdentityConfigMock = vi.mocked(validateAgentIdentityConfig);
const createOrReuseT3nSessionFromIdentityMock = vi.mocked(createOrReuseT3nSessionFromIdentity);
const getValidatedT3nSessionStateMock = vi.mocked(getValidatedT3nSessionState);
const readCurrentAgentRegistrationMock = vi.mocked(readCurrentAgentRegistration);

const buildTool = () => authAgentContextTool(context);

type AuthAgentContextToolRaw = ToolResult["raw"] & AuthAgentContextResult & { success: true };

async function executeTool(params: unknown): Promise<ToolResult> {
  return await buildTool().execute(mockClient, context, params) as ToolResult;
}

function getRaw(result: ToolResult): AuthAgentContextToolRaw {
  return result.raw as AuthAgentContextToolRaw;
}

describe("AUTH_AGENT_CONTEXT tool", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns not-ready context when identity config path is missing", async () => {
    resolveAgentIdentityConfigPathMock.mockReturnValue({
      ok: false,
      error: "AGENT_IDENTITY_CONFIG_PATH not set",
      humanMessage: "missing",
    });

    const result = await executeTool({});
    const raw = getRaw(result);

    expect(raw).toMatchObject({
      success: true,
      ready: false,
      identity: {
        available: false,
        valid: false,
        error: "IDENTITY_CONFIG_MISSING",
      },
    });
    expect(raw.nextSteps).toContain(
      "If no identity exists yet, run `pnpm create-identity` first."
    );
    expect(result.humanMessage).toBe(
      "Auth agent context is not ready yet. Review nextSteps and retry."
    );
  });

  it("returns ready context when session is valid and registration is verified", async () => {
    resolveAgentIdentityConfigPathMock.mockReturnValue({
      ok: true,
      path: "/tmp/agent_identity.json",
    });
    readAgentIdentityConfigMock.mockResolvedValue({
      ok: true,
      path: "/tmp/agent_identity.json",
      data: { ok: true },
    });
    validateAgentIdentityConfigMock.mockReturnValue({
      ok: true,
      path: "/tmp/agent_identity.json",
    });
    createOrReuseT3nSessionFromIdentityMock.mockResolvedValue({
      did: "did:t3n:9999999999999999999999999999999999999999",
      reused: true,
      networkTier: "testnet",
      baseUrl: "https://cn-api.sg.staging.t3n.terminal3.io",
    });
    getValidatedT3nSessionStateMock.mockReturnValue({
      isValid: true,
      client: { execute: vi.fn() } as never,
      did: "did:t3n:9999999999999999999999999999999999999999",
      networkTier: "testnet",
      baseUrl: "https://cn-api.sg.staging.t3n.terminal3.io",
      identityPath: "/tmp/agent_identity.json",
    });
    readCurrentAgentRegistrationMock.mockResolvedValue({
      did: "did:t3n:9999999999999999999999999999999999999999",
      hederaWallet: "0x" + "1".repeat(40),
      network: "testnet",
      fullyRegistered: true,
      t3n: {
        status: "registered",
        reason: "record_found",
        verified: true,
        record: null,
      },
      hedera: {
        status: "registered",
        reason: "record_found",
        verified: true,
        record: null,
      },
    });

    const result = await executeTool({});
    const raw = getRaw(result);

    expect(raw).toMatchObject({
      success: true,
      ready: true,
      identity: {
        available: true,
        valid: true,
        path: "/tmp/agent_identity.json",
      },
      session: {
        available: true,
        authenticated: true,
        did: "did:t3n:9999999999999999999999999999999999999999",
        reused: true,
        network: "testnet",
      },
      registration: {
        status: "full",
        network: "testnet",
        error: null,
      },
    });
    expect(result.humanMessage).toBe(
      "Auth agent context is ready and registration is verified."
    );
  });

  it("returns actionable partial readiness when session creation fails", async () => {
    resolveAgentIdentityConfigPathMock.mockReturnValue({
      ok: true,
      path: "/tmp/agent_identity.json",
    });
    readAgentIdentityConfigMock.mockResolvedValue({
      ok: true,
      path: "/tmp/agent_identity.json",
      data: { ok: true },
    });
    validateAgentIdentityConfigMock.mockReturnValue({
      ok: true,
      path: "/tmp/agent_identity.json",
    });
    createOrReuseT3nSessionFromIdentityMock.mockRejectedValue(new Error("HTTP 503: timeout"));

    const result = await executeTool({});
    const raw = getRaw(result);

    expect(raw).toMatchObject({
      success: true,
      ready: false,
      identity: {
        available: true,
        valid: true,
      },
      session: {
        available: false,
        authenticated: false,
        error: "T3N_AUTH_SESSION_FAILED",
      },
    });
    expect(raw.nextSteps[0]).toContain(
      "Check T3N connectivity"
    );
  });
});
