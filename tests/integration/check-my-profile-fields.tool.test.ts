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

import { checkMyProfileFieldsTool } from "../../src/tools/check-my-profile-fields.js";
import { getContractVersion } from "../../src/utils/contract-version.js";
import { getValidatedT3nSessionState } from "../../src/utils/t3n-session.js";
import {
  addTrackedUserDid,
  resetTrackedUserDidsForTests,
} from "../../src/utils/user-did-store.js";

const context: Context = {} as Context;
const mockClient =
  null as unknown as Parameters<
    ReturnType<typeof checkMyProfileFieldsTool>["execute"]
  >[0];
const getValidatedT3nSessionStateMock = vi.mocked(getValidatedT3nSessionState);
const getContractVersionMock = vi.mocked(getContractVersion);

const buildTool = () => checkMyProfileFieldsTool(context);

describe("CHECK_MY_PROFILE_FIELDS tool", () => {
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

  it("requires a session before checking the stored user DID", async () => {
    const tool = buildTool();
    const result = await tool.execute(mockClient, context, {
      fields: ["first_name"],
    });

    expect(result.raw).toMatchObject({
      success: false,
      error: "NO_T3N_AUTH_SESSION",
      unsupportedFields: [],
    });
    expect(result.humanMessage).toBe(
      "Create and validate a T3N auth session before checking stored user profile fields."
    );
  });

  it("requires a stored DID before checking profile fields", async () => {
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
      fields: ["first_name"],
    });

    expect(result.raw).toMatchObject({
      success: false,
      error: "NO_STORED_USER_DID",
      unsupportedFields: [],
    });
    expect(result.humanMessage).toBe(
      "Store a user DID with ADD_USER_DID before checking profile fields."
    );
  });

  it("checks requested fields against the stored DID", async () => {
    addTrackedUserDid("did:t3n:a:user-1", "Stored user");
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
      did: "did:t3n:a:user-1",
      fieldExistence: {
        first_name: true,
        email_address: true,
      },
      unsupportedFields: [],
      missingFields: [],
    });
    expect(result.humanMessage).toBe(
      "All requested supported fields exist for the stored user DID."
    );
  });

  it("reports missing mapped fields and unsupported fields", async () => {
    addTrackedUserDid("did:t3n:a:user-1", "Stored user");
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
      fields: ["first_name", "email_address", "favorite_color"],
    });

    expect(result.raw).toMatchObject({
      success: true,
      did: "did:t3n:a:user-1",
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
    expect(result.humanMessage).toBe(
      "Stored user profile field existence check completed."
    );
  });

  it("returns profile not found when no profile fields are available", async () => {
    addTrackedUserDid("did:t3n:a:user-1", "Stored user");
    const execute = vi.fn().mockResolvedValue(JSON.stringify({ response: [] }));
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
      fields: ["first_name"],
    });

    expect(result.raw).toMatchObject({
      success: false,
      error: "PROFILE_NOT_FOUND",
      did: "did:t3n:a:user-1",
      unsupportedFields: [],
    });
    expect(result.humanMessage).toBe(
      "No profile fields were returned for the stored user DID."
    );
  });

  it("turns profile-missing runtime errors into guided profile setup instructions", async () => {
    addTrackedUserDid("did:t3n:a:user-1", "Stored user");
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
      fields: ["first_name"],
    });

    expect(result.raw).toMatchObject({
      success: false,
      error: "PROFILE_NOT_FOUND",
      did: "did:t3n:a:user-1",
      profileUrl: "https://staging.trinity.terminal3.io/profile",
      onboardingUrl: "https://staging.trinity.terminal3.io/onboarding",
    });
    expect(
      (result.raw as { instructions?: { type?: string } }).instructions?.type
    ).toBe("steps");
    expect(result.humanMessage).toContain(
      "The profile for user DID `did:t3n:a:user-1` does not exist yet or is incomplete."
    );
    expect(result.humanMessage).toContain(
      "https://staging.trinity.terminal3.io/profile"
    );
  });

  it("turns authorization runtime errors into guided agent-permission instructions", async () => {
    addTrackedUserDid("did:t3n:a:user-1", "Stored user");
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
      fields: ["first_name"],
    });

    expect(result.raw).toMatchObject({
      success: false,
      error: "AUTHORIZATION_REQUIRED",
      did: "did:t3n:a:user-1",
      agentDid: "did:t3n:a:agent-1",
      agentsUrl: "https://staging.trinity.terminal3.io/agents",
    });
    expect(
      (result.raw as { instructions?: { type?: string; permission?: string } })
        .instructions?.type
    ).toBe("authorization");
    expect(result.humanMessage).toContain("did:t3n:a:user-1");
    expect(result.humanMessage).toContain("Profile Verification");
    expect(result.humanMessage).toContain(
      "https://staging.trinity.terminal3.io/agents"
    );
  });

  it("returns no supported fields when nothing maps to T3N fields", async () => {
    const tool = buildTool();
    const result = await tool.execute(mockClient, context, {
      fields: ["favorite_color"],
    });

    expect(result.raw).toMatchObject({
      success: false,
      error: "NO_SUPPORTED_FIELDS",
      unsupportedFields: [
        {
          field: "favorite_color",
          reason: "T3N does not support this field yet",
        },
      ],
    });
    expect(result.humanMessage).toBe("No supported profile fields were provided.");
  });

  it("rejects invalid parameters", async () => {
    const tool = buildTool();
    const result = await tool.execute(mockClient, context, {
      fields: ["first_name"],
      targetDid: "did:t3n:a:user-1",
    });

    expect(result.raw).toEqual({
      success: false,
      error: "INVALID_PARAMETERS",
    });
    expect(result.humanMessage).toBe(
      "Invalid parameters. Provide a `fields` array of strings only."
    );
  });
});
