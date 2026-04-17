import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveAgentIdentityConfigPath = vi.fn();
const readAgentIdentityConfig = vi.fn();
const validateAgentIdentityConfig = vi.fn();
const readCurrentAgentRegistration = vi.fn();
const createOrReuseT3nSessionFromIdentity = vi.fn();
const getValidatedT3nSessionState = vi.fn();

vi.mock("../../src/utils/agent-identity-config.js", () => ({
  resolveAgentIdentityConfigPath,
  readAgentIdentityConfig,
  validateAgentIdentityConfig,
}));

vi.mock("../../src/utils/agent-registration.js", () => ({
  readCurrentAgentRegistration,
}));

vi.mock("../../src/utils/t3n-session.js", () => ({
  createOrReuseT3nSessionFromIdentity,
  getValidatedT3nSessionState,
}));

describe("buildAuthAgentContext", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("reports missing identity configuration", async () => {
    resolveAgentIdentityConfigPath.mockReturnValue({ ok: false });

    const { buildAuthAgentContext } = await import("../../src/utils/auth-agent-context.js");
    const result = await buildAuthAgentContext();

    expect(result.ready).toBe(false);
    expect(result.identity.error).toBe("IDENTITY_CONFIG_MISSING");
    expect(result.session.authenticated).toBe(false);
    expect(result.nextSteps.length).toBeGreaterThan(0);
  });

  it("returns ready context and partial registration when session succeeds", async () => {
    resolveAgentIdentityConfigPath.mockReturnValue({ ok: true, path: "/tmp/agent_identity.json" });
    readAgentIdentityConfig.mockResolvedValue({ ok: true, data: { did_t3n: "did:t3n:abc" } });
    validateAgentIdentityConfig.mockReturnValue({ ok: true });
    createOrReuseT3nSessionFromIdentity.mockResolvedValue({
      did: "did:t3n:agent",
      reused: true,
      networkTier: "testnet",
      baseUrl: "https://example.t3n.test",
    });
    getValidatedT3nSessionState.mockReturnValue({ isValid: true });
    readCurrentAgentRegistration.mockResolvedValue({
      fullyRegistered: false,
      network: "testnet",
      t3n: { status: "registered" },
      hedera: { status: "not_registered" },
    });

    const { buildAuthAgentContext } = await import("../../src/utils/auth-agent-context.js");
    const result = await buildAuthAgentContext();

    expect(result.identity).toMatchObject({
      available: true,
      valid: true,
      path: "/tmp/agent_identity.json",
      error: null,
    });
    expect(result.session).toMatchObject({
      available: true,
      authenticated: true,
      did: "did:t3n:agent",
      reused: true,
      network: "testnet",
      baseUrl: "https://example.t3n.test",
    });
    expect(result.ready).toBe(true);
    expect(result.registration.status).toBe("partial");
    expect(result.nextSteps).toContain(
      "Complete or verify the Hedera ERC-8004 registration if on-chain registration matters for this workflow."
    );
  });
});
