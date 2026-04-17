import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdkMocks = vi.hoisted(() => {
  const handshakeMock = vi.fn();
  const authenticateMock = vi.fn();
  const isAuthenticatedMock = vi.fn();
  const createEthAuthInputMock = vi.fn((address: string) => ({ address }));
  const resolveT3nBaseUrlMock = vi.fn();
  const setEnvironmentMock = vi.fn();
  const createAuthenticatedT3nClientMock = vi.fn();

  class MockT3nClient {
    handshake = handshakeMock;
    authenticate = authenticateMock;
    isAuthenticated = isAuthenticatedMock;
    getDid = vi.fn(() => ({ toString: () => "did:t3n:mock" }));
  }

  return {
    handshakeMock,
    authenticateMock,
    isAuthenticatedMock,
    createEthAuthInputMock,
    resolveT3nBaseUrlMock,
    setEnvironmentMock,
    createAuthenticatedT3nClientMock,
    MockT3nClient,
  };
});

vi.mock("@terminal3/t3n-sdk", () => ({
  T3nClient: sdkMocks.MockT3nClient,
  SessionStatus: {
    Authenticated: "Authenticated",
  },
  eth_get_address: vi.fn(() => "0x1234567890abcdef1234567890abcdef12345678"),
  createEthAuthInput: sdkMocks.createEthAuthInputMock,
  setEnvironment: sdkMocks.setEnvironmentMock,
}));

vi.mock("../../src/utils/agent-identity-config.js", () => ({
  loadIdentityOrThrow: vi.fn(() =>
    Promise.resolve({
      path: "/tmp/test-identity.json",
      data: { mocked: true },
      credentials: {
        did_t3n: "did:t3n:d6ee025dd9e8ddcb7dfcc18cbdff413101ceaa9f",
        private_key:
          "0x59c6995e998f97a5a004497e5daef7f8f4a47b09f03c87f13f6f6d0d7138f5f4",
        network_tier: "testnet",
      },
    })
  ),
}));

vi.mock("../../src/utils/env.js", () => ({
  isTestEnvironment: vi.fn(() => true),
  shouldUseLiveLocalT3nBackend: vi.fn(() => false),
}));

vi.mock("../../src/utils/t3n-endpoint.js", () => ({
  isLocalhostUrl: vi.fn((url: string) =>
    url.includes("localhost") || url.includes("127.0.0.1")
  ),
}));

vi.mock("../../src/utils/t3n-ml-kem.js", () => ({
  createConfiguredMlKemPublicKeyHandler: vi.fn(() => "ml-kem-handler"),
}));

vi.mock("../../src/utils/t3n.js", () => ({
  authenticateT3nClientWithEthDidSuffix: vi.fn(),
  inferT3nEnvFromUrl: vi.fn(() => "local"),
  normalizeT3nDid: (did: string) => did,
  resolveT3nBaseUrl: sdkMocks.resolveT3nBaseUrlMock,
  createAuthenticatedT3nClient: sdkMocks.createAuthenticatedT3nClientMock,
}));

import {
  createOrReuseT3nSessionFromIdentity,
  resetT3nSessionStateForTests,
} from "../../src/utils/t3n-session.js";

describe("t3n-session authentication", () => {
  let mockClient: InstanceType<typeof sdkMocks.MockT3nClient>;

  beforeEach(() => {
    mockClient = new sdkMocks.MockT3nClient();
    sdkMocks.resolveT3nBaseUrlMock.mockResolvedValue("http://127.0.0.1:3000");
    sdkMocks.isAuthenticatedMock.mockReturnValue(true);
    sdkMocks.createAuthenticatedT3nClientMock.mockResolvedValue({
      client: mockClient,
      did: "did:t3n:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    });
    resetT3nSessionStateForTests();
  });

  afterEach(() => {
    vi.clearAllMocks();
    resetT3nSessionStateForTests();
  });

  it("delegates live authentication through the shared T3N client factory", async () => {
    const result = await createOrReuseT3nSessionFromIdentity({
      env: { HEDERA_T3N_LIVE_SESSION: "1" } as NodeJS.ProcessEnv,
    });

    expect(result.did).toBe("did:t3n:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    expect(sdkMocks.createAuthenticatedT3nClientMock).toHaveBeenCalledTimes(1);
    expect(sdkMocks.createAuthenticatedT3nClientMock).toHaveBeenCalledWith(
      expect.objectContaining({
        privateKey:
          "0x59c6995e998f97a5a004497e5daef7f8f4a47b09f03c87f13f6f6d0d7138f5f4",
        baseUrl: "http://127.0.0.1:3000",
      })
    );
  });

  it("reuses existing valid session", async () => {
    await createOrReuseT3nSessionFromIdentity({
      env: { HEDERA_T3N_LIVE_SESSION: "1" } as NodeJS.ProcessEnv,
    });
    
    const result = await createOrReuseT3nSessionFromIdentity({
      env: { HEDERA_T3N_LIVE_SESSION: "1" } as NodeJS.ProcessEnv,
    });

    expect(result.reused).toBe(true);
    expect(sdkMocks.createAuthenticatedT3nClientMock).toHaveBeenCalledTimes(1);
  });
});
