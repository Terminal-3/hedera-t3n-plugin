import { beforeEach, describe, expect, it, vi } from "vitest";

const getHederaNetwork = vi.fn();
const buildProfileExecuteRequest = vi.fn();
const checkMappedFieldsExistence = vi.fn();
const parseProfileKeysResult = vi.fn();
const isProfileAuthorizationErrorMessage = vi.fn();
const isProfileMissingErrorMessage = vi.fn();
const loadDashboardUrls = vi.fn();
const mapFieldNames = vi.fn();
const getValidatedT3nSessionState = vi.fn();
const messageFromError = vi.fn();
const buildAuthAgentContext = vi.fn();

vi.mock("../../src/utils/env.js", () => ({ getHederaNetwork }));
vi.mock("../../src/utils/profile-check.js", () => ({
  buildProfileExecuteRequest,
  checkMappedFieldsExistence,
  parseProfileKeysResult,
}));
vi.mock("../../src/utils/profile-guidance.js", () => ({
  isProfileAuthorizationErrorMessage,
  isProfileMissingErrorMessage,
  loadDashboardUrls,
}));
vi.mock("../../src/utils/profile-field-mapping.js", () => ({ mapFieldNames }));
vi.mock("../../src/utils/t3n-session.js", () => ({ getValidatedT3nSessionState }));
vi.mock("../../src/utils/tool-result.js", () => ({ messageFromError }));
vi.mock("../../src/utils/auth-agent-context.js", () => ({ buildAuthAgentContext }));

describe("buildPrivateDataProcessingResult", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    getHederaNetwork.mockReturnValue("testnet");
    loadDashboardUrls.mockResolvedValue({
      profileUrl: "https://profile.example",
      onboardingUrl: "https://onboarding.example",
    });
    isProfileAuthorizationErrorMessage.mockReturnValue(false);
    isProfileMissingErrorMessage.mockReturnValue(false);
    messageFromError.mockReturnValue("unexpected");
  });

  it("fails fast when auth agent context is not ready", async () => {
    buildAuthAgentContext.mockResolvedValue({ ready: false, nextSteps: ["Create identity first."] });
    mapFieldNames.mockReturnValue([
      { original: "first_name", supported: true, mapped: "$.first_name" },
      { original: "favorite_color", supported: false, mapped: null },
    ]);

    const { buildPrivateDataProcessingResult } = await import(
      "../../src/utils/private-data-processing.js"
    );
    const result = await buildPrivateDataProcessingResult({
      userDid: "did:t3n:user",
      fields: ["first_name", "favorite_color"],
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("AUTH_AGENT_CONTEXT_NOT_READY");
    expect(result.authReady).toBe(false);
    expect(result.authError).toBe("AUTH_AGENT_CONTEXT_NOT_READY");
    expect(result.unsupportedFields).toEqual([
      { field: "favorite_color", reason: "T3N does not support this field yet" },
    ]);
    expect(result.guidance.steps).toEqual(["Create identity first."]);
  });

  it("returns structured success when profile keys are available", async () => {
    buildAuthAgentContext.mockResolvedValue({ ready: true, nextSteps: [] });
    mapFieldNames.mockReturnValue([
      { original: "first_name", supported: true, mapped: "$.first_name" },
      { original: "email_address", supported: true, mapped: "$.email_address" },
      { original: "favorite_color", supported: false, mapped: null },
    ]);
    buildProfileExecuteRequest.mockResolvedValue({ action: "execute-request" });
    parseProfileKeysResult.mockReturnValue(["$.first_name"]);
    checkMappedFieldsExistence.mockReturnValue({
      fieldExistence: { first_name: true, email_address: false },
      missingFields: ["email_address"],
    });
    getValidatedT3nSessionState.mockReturnValue({
      isValid: true,
      networkTier: "testnet",
      baseUrl: "https://example.t3n.test",
      client: {
        execute: vi.fn().mockResolvedValue({ keys: ["$.first_name"] }),
      },
    });

    const { buildPrivateDataProcessingResult } = await import(
      "../../src/utils/private-data-processing.js"
    );
    const result = await buildPrivateDataProcessingResult({
      userDid: "did:t3n:user",
      fields: ["first_name", "email_address", "favorite_color"],
    });

    expect(result.success).toBe(true);
    expect(result.userDid).toBe("did:t3n:user");
    expect(result.fieldExistence).toEqual({ first_name: true, email_address: false });
    expect(result.missingFields).toEqual(["email_address"]);
    expect(result.unsupportedFields).toEqual([
      { field: "favorite_color", reason: "T3N does not support this field yet" },
    ]);
    expect(result.guidance.steps).toContain(
      "Ask the user to update the missing profile fields at https://profile.example."
    );
  });
});
