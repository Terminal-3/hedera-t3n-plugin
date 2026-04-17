import { describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
  lastClientConfig: null as Record<string, unknown> | null,
}));

const sdkMocks = vi.hoisted(() => {
  const handshakeMock = vi.fn();
  const authenticateMock = vi.fn((_input: unknown) =>
    Promise.resolve({
      toString: () => "did:t3n:auth-result",
    })
  );
  const isAuthenticatedMock = vi.fn(() => true);
  const createEthAuthInputMock = vi.fn((address: string) => ({ address }));
  const loadWasmComponentMock = vi.fn(() => Promise.resolve("wasm-component"));
  const metamaskSignMock = vi.fn(() => "eth-sign-handler");
  const createRandomHandlerMock = vi.fn(() => "random-handler");
  const setEnvironmentMock = vi.fn();

  class MockT3nClient {
    constructor(config: Record<string, unknown>) {
      testState.lastClientConfig = config;
    }

    handshake = handshakeMock;
    authenticate = authenticateMock;
    isAuthenticated = isAuthenticatedMock;
    getDid = vi.fn(() => ({ toString: () => "did:t3n:from-get-did" }));
  }

  return {
    handshakeMock,
    authenticateMock,
    isAuthenticatedMock,
    createEthAuthInputMock,
    loadWasmComponentMock,
    metamaskSignMock,
    createRandomHandlerMock,
    setEnvironmentMock,
    MockT3nClient,
  };
});

const mlKemMocks = vi.hoisted(() => ({
  mlKemPublicKeyHandler: vi.fn(() => Promise.resolve(new Uint8Array([1, 2, 3]))),
  createConfiguredMlKemPublicKeyHandlerMock: vi.fn(),
}));
mlKemMocks.createConfiguredMlKemPublicKeyHandlerMock.mockReturnValue(
  mlKemMocks.mlKemPublicKeyHandler
);

vi.mock("@terminal3/t3n-sdk", () => ({
  T3nClient: sdkMocks.MockT3nClient,
  SessionStatus: {
    Authenticated: "Authenticated",
  },
  createEthAuthInput: sdkMocks.createEthAuthInputMock,
  loadWasmComponent: sdkMocks.loadWasmComponentMock,
  metamask_sign: sdkMocks.metamaskSignMock,
  createRandomHandler: sdkMocks.createRandomHandlerMock,
  setEnvironment: sdkMocks.setEnvironmentMock,
}));

vi.mock("../../src/utils/t3n-ml-kem.js", () => ({
  createConfiguredMlKemPublicKeyHandler: mlKemMocks.createConfiguredMlKemPublicKeyHandlerMock,
}));

vi.mock("../../src/utils/t3n-urls.js", () => ({
  inferT3nEnvFromUrl: vi.fn(() => "staging"),
}));

import { createAuthenticatedT3nClient } from "../../src/utils/t3n-client-factory.js";

describe("createAuthenticatedT3nClient", () => {
  it("configures and authenticates client with expected SDK handlers", async () => {
    const privateKey =
      "0x59c6995e998f97a5a004497e5daef7f8f4a47b09f03c87f13f6f6d0d7138f5f4";
    const address = "0x1234567890abcdef1234567890abcdef12345678";
    const baseUrl = "https://cn-api.sg.staging.t3n.terminal3.io";

    const result = await createAuthenticatedT3nClient({
      privateKey,
      address,
      baseUrl,
      fallbackT3nEnv: "production",
    });

    expect(result.did).toBe("did:t3n:from-get-did");
    expect(sdkMocks.setEnvironmentMock).toHaveBeenCalledWith("staging");
    expect(mlKemMocks.createConfiguredMlKemPublicKeyHandlerMock).toHaveBeenCalledWith(
      undefined,
      baseUrl
    );

    expect(sdkMocks.loadWasmComponentMock).toHaveBeenCalledTimes(1);
    expect(sdkMocks.metamaskSignMock).toHaveBeenCalledWith(address, undefined, privateKey);
    expect(sdkMocks.createRandomHandlerMock).toHaveBeenCalledTimes(1);

    expect(testState.lastClientConfig).toMatchObject({
      baseUrl,
      wasmComponent: "wasm-component",
      timeout: 30000,
    });
    expect(testState.lastClientConfig?.handlers).toEqual({
      EthSign: "eth-sign-handler",
      MlKemPublicKey: mlKemMocks.mlKemPublicKeyHandler,
      Random: "random-handler",
    });

    expect(sdkMocks.handshakeMock).toHaveBeenCalledTimes(1);
    expect(sdkMocks.createEthAuthInputMock).toHaveBeenCalledWith(address);
    expect(sdkMocks.authenticateMock).toHaveBeenCalledTimes(1);
  });
});
