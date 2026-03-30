import type { Context } from "hedera-agent-kit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/utils/t3n-session.js", () => ({
  getValidatedT3nSessionState: vi.fn(),
}));
vi.mock("../../src/utils/contract-version.js", () => ({
  SCRIPT_NAMES: {
    USER: "tee:user/contracts",
  },
  getContractVersion: vi.fn().mockResolvedValue("resolved-dynamic-version"),
}));

import { checkProfileFieldExistenceTool } from "../../src/tools/check-profile-field-existence.js";
import { getContractVersion } from "../../src/utils/contract-version.js";
import { getValidatedT3nSessionState } from "../../src/utils/t3n-session.js";
import {
  addTrackedUserDid,
  resetTrackedUserDidsForTests,
} from "../../src/utils/user-did-store.js";

const context: Context = {} as Context;
const mockClient =
  null as unknown as Parameters<
    ReturnType<typeof checkProfileFieldExistenceTool>["execute"]
  >[0];
const getValidatedT3nSessionStateMock = vi.mocked(getValidatedT3nSessionState);
const getContractVersionMock = vi.mocked(getContractVersion);

const buildTool = () => checkProfileFieldExistenceTool(context);

describe("CHECK_PROFILE_FIELD_EXISTENCE tool", () => {
  beforeEach(() => {
    resetTrackedUserDidsForTests();
    getValidatedT3nSessionStateMock.mockReturnValue({
      isValid: false,
      reason: "no_session",
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    resetTrackedUserDidsForTests();
  });

  it("requires a session before checking profile fields", async () => {
    const tool = buildTool();
    const result = await tool.execute(mockClient, context, {
      targetDid: "did:t3n:a:user-1",
      fields: ["first_name"],
    });

    expect(result.raw).toMatchObject({
      success: false,
      error: "NO_T3N_AUTH_SESSION",
      unsupportedFields: [],
    });
    expect(result.humanMessage).toBe(
      "Create and validate a T3N auth session before checking profile fields."
    );
  });

  it("uses the single stored user DID when targetDid is omitted", async () => {
    addTrackedUserDid("did:t3n:a:user-1", "Stored lookup DID");
    const execute = vi
      .fn()
      .mockResolvedValue(JSON.stringify({ response: ["first_name", "email_address"] }));
    getValidatedT3nSessionStateMock.mockReturnValue({
      isValid: true,
      client: { execute } as never,
      did: "did:t3n:a:agent-1",
      networkTier: "testnet",
      baseUrl: "https://cn-api.sg.staging.t3n.terminal3.io",
      identityPath: "/tmp/agent_identity.json",
    });

    const tool = buildTool();
    const result = await tool.execute(mockClient, context, {
      fields: ["first_name", "email_address"],
    });

    expect(execute).toHaveBeenCalledWith({
      script_name: "tee:user/contracts",
      script_version: expect.any(String),
      function_name: "get-profile-fields-name-only",
      pii_did: "did:t3n:a:user-1",
    });
    expect(getContractVersionMock).toHaveBeenCalledWith(
      "https://cn-api.sg.staging.t3n.terminal3.io",
      "tee:user/contracts"
    );
    expect(result.raw).toMatchObject({
      success: true,
      targetDid: "did:t3n:a:user-1",
      fieldExistence: {
        first_name: true,
        email_address: true,
      },
      unsupportedFields: [],
      missingFields: [],
    });
    expect(result.humanMessage).toBe(
      "All requested supported fields exist for the target profile."
    );
  });

  it("returns available DIDs when multiple stored user DIDs exist", async () => {
    addTrackedUserDid("did:t3n:a:user-1", "Primary");
    addTrackedUserDid("did:t3n:a:user-2", "Secondary");

    const tool = buildTool();
    const result = await tool.execute(mockClient, context, {
      fields: ["first_name"],
    });

    expect(result.raw).toMatchObject({
      success: false,
      error: "MULTIPLE_USER_DIDS",
      unsupportedFields: [],
    });
    expect((result.raw as { availableDids?: unknown[] }).availableDids).toHaveLength(2);
    expect(result.humanMessage).toBe(
      "Multiple stored user DIDs are available. Provide `targetDid` to choose which profile to check."
    );
  });

  it("rejects checking the authenticated agent DID", async () => {
    getValidatedT3nSessionStateMock.mockReturnValue({
      isValid: true,
      client: { execute: vi.fn() } as never,
      did: "did:t3n:a:agent-1",
      networkTier: "testnet",
      baseUrl: "https://cn-api.sg.staging.t3n.terminal3.io",
      identityPath: "/tmp/agent_identity.json",
    });

    const tool = buildTool();
    const result = await tool.execute(mockClient, context, {
      targetDid: "did:t3n:a:agent-1",
      fields: ["first_name"],
    });

    expect(result.raw).toMatchObject({
      success: false,
      error: "CANNOT_CHECK_OWN_PROFILE",
      targetDid: "did:t3n:a:agent-1",
    });
    expect(result.humanMessage).toBe(
      "This tool is for checking another user's profile. Use CHECK_MY_PROFILE_FIELDS for your own DID instead."
    );
  });

  it("reports unsupported fields and missing mapped fields", async () => {
    const execute = vi.fn().mockResolvedValue(JSON.stringify({ response: ["first_name"] }));
    getValidatedT3nSessionStateMock.mockReturnValue({
      isValid: true,
      client: { execute } as never,
      did: "did:t3n:a:agent-1",
      networkTier: "testnet",
      baseUrl: "https://cn-api.sg.staging.t3n.terminal3.io",
      identityPath: "/tmp/agent_identity.json",
    });

    const tool = buildTool();
    const result = await tool.execute(mockClient, context, {
      targetDid: "did:t3n:a:user-1",
      fields: ["first_name", "email_address", "favorite_color"],
    });

    expect(result.raw).toMatchObject({
      success: true,
      targetDid: "did:t3n:a:user-1",
      fieldExistence: {
        first_name: true,
        email_address: false,
      },
      unsupportedFields: [
        {
          field: "favorite_color",
          reason: "T3N does not support this field yet",
        },
      ],
      missingFields: ["email_address"],
    });
    expect(result.humanMessage).toBe("Profile field existence check completed.");
  });

  it("turns target-profile-missing runtime errors into guided setup instructions", async () => {
    const execute = vi
      .fn()
      .mockRejectedValue(
        new Error(
          'HTTP 500: Internal error ("WASM error: Failed to execute WASM: Runtime(\\"WASM function error: User profile is required\\")")'
        )
      );
    getValidatedT3nSessionStateMock.mockReturnValue({
      isValid: true,
      client: { execute } as never,
      did: "did:t3n:a:agent-1",
      networkTier: "testnet",
      baseUrl: "https://cn-api.sg.staging.t3n.terminal3.io",
      identityPath: "/tmp/agent_identity.json",
    });

    const tool = buildTool();
    const result = await tool.execute(mockClient, context, {
      targetDid: "did:t3n:a:user-1",
      fields: ["first_name"],
    });

    expect(result.raw).toMatchObject({
      success: false,
      error: "PROFILE_NOT_FOUND",
      targetDid: "did:t3n:a:user-1",
      profileUrl: "https://staging.trinity.terminal3.io/profile",
      onboardingUrl: "https://staging.trinity.terminal3.io/onboarding",
    });
    expect(
      (result.raw as { instructions?: { type?: string } }).instructions?.type
    ).toBe("steps");
    expect(result.humanMessage).toContain(
      "The profile for user DID `did:t3n:a:user-1` does not exist yet or is incomplete."
    );
  });

  it("turns authorization runtime errors into guided agent-permission instructions", async () => {
    const execute = vi
      .fn()
      .mockRejectedValue(
        new Error(
          `HTTP 500: Internal error ("Authorization error: Unauthorized to access PII: "did:t3n:a:user-1"")`
        )
      );
    getValidatedT3nSessionStateMock.mockReturnValue({
      isValid: true,
      client: { execute } as never,
      did: "did:t3n:a:agent-1",
      networkTier: "testnet",
      baseUrl: "https://cn-api.sg.staging.t3n.terminal3.io",
      identityPath: "/tmp/agent_identity.json",
    });

    const tool = buildTool();
    const result = await tool.execute(mockClient, context, {
      targetDid: "did:t3n:a:user-1",
      fields: ["first_name"],
    });

    expect(result.raw).toMatchObject({
      success: false,
      error: "AUTHORIZATION_REQUIRED",
      targetDid: "did:t3n:a:user-1",
      agentDid: "did:t3n:a:agent-1",
      agentsUrl: "https://staging.trinity.terminal3.io/agents",
    });
    expect(
      (result.raw as { instructions?: { type?: string; permission?: string } })
        .instructions?.type
    ).toBe("authorization");
    expect(result.humanMessage).toContain("Profile Verification");
    expect(result.humanMessage).toContain(
      "https://staging.trinity.terminal3.io/agents"
    );
  });

  it("rejects invalid parameters", async () => {
    const tool = buildTool();
    const result = await tool.execute(mockClient, context, {
      targetDid: "did:t3n:a:user-1",
      fields: ["first_name"],
      note: "unexpected",
    });

    expect(result.raw).toEqual({
      success: false,
      error: "INVALID_PARAMETERS",
    });
    expect(result.humanMessage).toBe(
      "Invalid parameters. Provide a `fields` array and an optional `targetDid` string only."
    );
  });
});
