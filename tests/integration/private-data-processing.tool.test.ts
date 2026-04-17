import type { Context } from "@hashgraph/hedera-agent-kit";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/utils/auth-agent-context.js", () => ({
  buildAuthAgentContext: vi.fn(),
}));
vi.mock("../../src/utils/t3n-session.js", () => ({
  getValidatedT3nSessionState: vi.fn(),
}));
vi.mock("../../src/utils/contract-version.js", () => ({
  SCRIPT_NAMES: {
    USER: "tee:user/contracts",
  },
  getContractVersion: vi.fn().mockResolvedValue("resolved-dynamic-version"),
}));

import { privateDataProcessingTool } from "../../src/tools/private-data-processing.js";
import type { AuthAgentContextResult } from "../../src/utils/auth-agent-context.js";
import { buildAuthAgentContext } from "../../src/utils/auth-agent-context.js";
import type { PrivateDataProcessingResult } from "../../src/utils/private-data-processing.js";
import { getValidatedT3nSessionState } from "../../src/utils/t3n-session.js";
import type { ToolResult } from "../../src/utils/tool-result.js";

const context: Context = {} as Context;
const mockClient =
  null as unknown as Parameters<ReturnType<typeof privateDataProcessingTool>["execute"]>[0];

const buildAuthAgentContextMock = vi.mocked(buildAuthAgentContext);
const getValidatedT3nSessionStateMock = vi.mocked(getValidatedT3nSessionState);

const buildTool = () => privateDataProcessingTool(context);

type PrivateDataProcessingToolRaw = ToolResult["raw"] & PrivateDataProcessingResult;

function createAuthContext(overrides: Partial<AuthAgentContextResult>): AuthAgentContextResult {
  return {
    identity: {
      available: false,
      valid: false,
      error: null,
    },
    session: {
      available: false,
      authenticated: false,
      did: null,
      reused: null,
      network: null,
      baseUrl: null,
      error: null,
    },
    registration: {
      status: "not_checked",
      network: null,
      error: null,
    },
    ready: false,
    nextSteps: [],
    ...overrides,
  };
}

async function executeTool(params: unknown): Promise<ToolResult> {
  return await buildTool().execute(mockClient, context, params) as ToolResult;
}

function getRaw(result: ToolResult): PrivateDataProcessingToolRaw {
  return result.raw as PrivateDataProcessingToolRaw;
}

describe("PRIVATE_DATA_PROCESSING tool", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns readiness guidance when auth agent context is not ready", async () => {
    buildAuthAgentContextMock.mockResolvedValue(createAuthContext({
      identity: {
        available: false,
        valid: false,
        error: "IDENTITY_CONFIG_MISSING",
      },
      session: {
        available: false,
        authenticated: false,
        did: null,
        reused: null,
        network: null,
        baseUrl: null,
        error: "IDENTITY_CONFIG_MISSING",
      },
      ready: false,
      nextSteps: ["Create an identity first."],
    }));

    const result = await executeTool({
      userDid: "did:t3n:1111111111111111111111111111111111111111",
      fields: ["first_name"],
    });
    const raw = getRaw(result);

    expect(raw).toMatchObject({
      success: false,
      error: "AUTH_AGENT_CONTEXT_NOT_READY",
      userDid: "did:t3n:1111111111111111111111111111111111111111",
      fieldExistence: {},
      missingFields: [],
      unsupportedFields: [],
      guidance: {
        steps: ["Create an identity first."],
      },
    });
  });

  it("returns spec-aligned field availability data without profile values", async () => {
    buildAuthAgentContextMock.mockResolvedValue(createAuthContext({
      identity: {
        available: true,
        valid: true,
        error: null,
      },
      session: {
        available: true,
        authenticated: true,
        did: "did:t3n:9999999999999999999999999999999999999999",
        reused: false,
        network: "testnet",
        baseUrl: "https://cn-api.sg.staging.t3n.terminal3.io",
        error: null,
      },
      registration: {
        status: "partial",
        network: "testnet",
        error: null,
      },
      ready: true,
      nextSteps: [],
    }));
    const execute = vi
      .fn()
      .mockResolvedValue(JSON.stringify({ response: ["first_name", "email_address"] }));
    getValidatedT3nSessionStateMock.mockReturnValue({
      isValid: true,
      client: { execute } as never,
      did: "did:t3n:9999999999999999999999999999999999999999",
      networkTier: "testnet",
      baseUrl: "https://cn-api.sg.staging.t3n.terminal3.io",
      identityPath: "/tmp/agent_identity.json",
    });

    const result = await executeTool({
      userDid: "did:t3n:1111111111111111111111111111111111111111",
      fields: ["first_name", "email_address", "favorite_color"],
    });
    const raw = getRaw(result);

    expect(raw).toMatchObject({
      success: true,
      userDid: "did:t3n:1111111111111111111111111111111111111111",
      fieldExistence: {
        first_name: true,
        email_address: true,
      },
      missingFields: [],
      unsupportedFields: [
        {
          field: "favorite_color",
          reason: "T3N does not support this field yet",
        },
      ],
    });
    expect(result.humanMessage).toBe("Private data processing completed successfully.");
    expect(JSON.stringify(raw)).not.toContain("Alice");
  });

  it("returns normalized guidance when the target profile is missing", async () => {
    buildAuthAgentContextMock.mockResolvedValue(createAuthContext({
      identity: {
        available: true,
        valid: true,
        error: null,
      },
      session: {
        available: true,
        authenticated: true,
        did: "did:t3n:9999999999999999999999999999999999999999",
        reused: false,
        network: "testnet",
        baseUrl: "https://cn-api.sg.staging.t3n.terminal3.io",
        error: null,
      },
      registration: {
        status: "not_checked",
        network: null,
        error: null,
      },
      ready: true,
      nextSteps: [],
    }));
    const execute = vi
      .fn()
      .mockRejectedValue(new Error('WASM function error: User profile is required'));
    getValidatedT3nSessionStateMock.mockReturnValue({
      isValid: true,
      client: { execute } as never,
      did: "did:t3n:9999999999999999999999999999999999999999",
      networkTier: "testnet",
      baseUrl: "https://cn-api.sg.staging.t3n.terminal3.io",
      identityPath: "/tmp/agent_identity.json",
    });

    const result = await executeTool({
      userDid: "did:t3n:1111111111111111111111111111111111111111",
      fields: ["first_name"],
    });
    const raw = getRaw(result);

    expect(raw).toMatchObject({
      success: false,
      error: "PROFILE_NOT_FOUND",
      userDid: "did:t3n:1111111111111111111111111111111111111111",
      guidance: {
        profileUrl: "https://staging.trinity.terminal3.io/profile",
        onboardingUrl: "https://staging.trinity.terminal3.io/onboarding",
      },
    });
    expect(raw.guidance.steps).toHaveLength(3);
  });
});
