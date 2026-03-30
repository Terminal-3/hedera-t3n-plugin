import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdkMocks = vi.hoisted(() => {
  const handshakeMock = vi.fn();
  const authenticateMock = vi.fn();
  const isAuthenticatedMock = vi.fn();
  const createEthAuthInputMock = vi.fn((address: string) => ({ address }));
  const fallbackAuthenticateMock = vi.fn();
  const resolveT3nBaseUrlMock = vi.fn();
  const setEnvironmentMock = vi.fn();

  class MockT3nClient {
    handshake = handshakeMock;
    authenticate = authenticateMock;
    isAuthenticated = isAuthenticatedMock;
  }

  return {
    handshakeMock,
    authenticateMock,
    isAuthenticatedMock,
    createEthAuthInputMock,
    fallbackAuthenticateMock,
    resolveT3nBaseUrlMock,
    setEnvironmentMock,
    MockT3nClient,
  };
});

vi.mock("@terminal3/t3n-sdk", () => ({
  T3nClient: sdkMocks.MockT3nClient,
  SessionStatus: {
    Authenticated: "Authenticated",
  },
  createEthAuthInput: sdkMocks.createEthAuthInputMock,
  createRandomHandler: vi.fn(() => "random-handler"),
  eth_get_address: vi.fn(() => "0x1234567890abcdef1234567890abcdef12345678"),
  loadWasmComponent: vi.fn(async () => "wasm-component"),
  metamask_sign: vi.fn(() => "eth-sign-handler"),
  setEnvironment: sdkMocks.setEnvironmentMock,
}));

vi.mock("../../src/utils/agent-identity-config.js", () => ({
  readAgentIdentityConfig: vi.fn(async () => ({
    ok: true,
    path: "/tmp/test-identity.json",
    data: { mocked: true },
  })),
  resolveAgentIdentityConfigPath: vi.fn(() => ({
    ok: true,
    path: "/tmp/test-identity.json",
  })),
  validateAgentIdentityConfig: vi.fn(() => ({ ok: true })),
}));

vi.mock("../../src/utils/env.js", () => ({
  isTestEnvironment: vi.fn(() => true),
  shouldUseLiveLocalT3nBackend: vi.fn(() => false),
}));

vi.mock("../../src/utils/t3n-ml-kem.js", () => ({
  createConfiguredMlKemPublicKeyHandler: vi.fn(() => "ml-kem-handler"),
}));

vi.mock("../../src/utils/t3n.js", () => ({
  authenticateT3nClientWithEthDidSuffix: sdkMocks.fallbackAuthenticateMock,
  resolveT3nBaseUrl: sdkMocks.resolveT3nBaseUrlMock,
}));

vi.mock("../../src/utils/validation.js", () => ({
  validateStoredCredentials: vi.fn(() => ({
    did_t3n: "did:t3n:a:stored",
    private_key: "0xabc123",
    network_tier: "testnet",
  })),
}));

import {
  createOrReuseT3nSessionFromIdentity,
  resetT3nSessionStateForTests,
} from "../../src/utils/t3n-session.js";

describe("t3n-session authentication", () => {
  beforeEach(() => {
    sdkMocks.resolveT3nBaseUrlMock.mockResolvedValue("http://127.0.0.1:3000");
    sdkMocks.handshakeMock.mockResolvedValue(undefined);
    sdkMocks.isAuthenticatedMock.mockReturnValue(true);
    sdkMocks.authenticateMock.mockReset();
    sdkMocks.fallbackAuthenticateMock.mockReset();
    sdkMocks.createEthAuthInputMock.mockClear();
    sdkMocks.setEnvironmentMock.mockClear();
    resetT3nSessionStateForTests();
  });

  afterEach(() => {
    vi.clearAllMocks();
    resetT3nSessionStateForTests();
  });

  it("uses SDK authenticate when it succeeds", async () => {
    sdkMocks.authenticateMock.mockResolvedValue({
      toString: () => "did:t3n:a:from-sdk",
    });

    const result = await createOrReuseT3nSessionFromIdentity({
      env: { HEDERA_T3N_LIVE_SESSION: "1" } as NodeJS.ProcessEnv,
    });

    expect(result.did).toBe("did:t3n:a:from-sdk");
    expect(sdkMocks.createEthAuthInputMock).toHaveBeenCalledWith(
      "0x1234567890abcdef1234567890abcdef12345678"
    );
    expect(sdkMocks.fallbackAuthenticateMock).not.toHaveBeenCalled();
  });

  it("falls back to explicit auth flow when SDK authenticate fails", async () => {
    sdkMocks.authenticateMock.mockRejectedValue(new Error("sdk auth failed"));
    sdkMocks.fallbackAuthenticateMock.mockResolvedValue("did:t3n:a:from-fallback");

    const result = await createOrReuseT3nSessionFromIdentity({
      env: { HEDERA_T3N_LIVE_SESSION: "1" } as NodeJS.ProcessEnv,
    });

    expect(result.did).toBe("did:t3n:a:from-fallback");
    expect(sdkMocks.fallbackAuthenticateMock).toHaveBeenCalledTimes(1);
  });
});
