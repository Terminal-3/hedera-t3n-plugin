import { readFile, writeFile } from "fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/utils/t3n.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/utils/t3n.js")>();
  return {
    ...actual,
    registerDidT3n: vi.fn(),
  };
});

vi.mock("../../src/utils/hedera.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/utils/hedera.js")>();
  return {
    ...actual,
    assertHederaRegistrationReady: vi.fn(),
    registerHederaAgentIdentity: vi.fn(),
  };
});

import {
  registerAgentErc8004,
  validatePublicAgentCardUrl,
} from "../../src/registerAgentErc8004.js";
import {
  assertHederaRegistrationReady,
  registerHederaAgentIdentity,
} from "../../src/utils/hedera.js";
import { registerDidT3n } from "../../src/utils/t3n.js";
import { cleanupTempFile, createTempFilePath } from "../helpers/temp-files.js";

const registerDidT3nMock = vi.mocked(registerDidT3n);
const assertHederaRegistrationReadyMock = vi.mocked(assertHederaRegistrationReady);
const registerHederaAgentIdentityMock = vi.mocked(registerHederaAgentIdentity);
const TEST_PRIVATE_KEY = `0x${"1".repeat(64)}`;
const TEST_DID = "did:t3n:a:abc123def4567890";
const TEST_OWNER = `0x${"2".repeat(40)}`;
const TEST_IDENTITY_REGISTRY_ADDRESS = "0x1111111111111111111111111111111111111111";

async function writeIdentityConfig(
  path: string,
  networkTier: "local" | "testnet" | "mainnet" = "testnet",
  includeHederaRegistration = false,
  options: {
    agentCardGatewayUrl?: string;
    agentCardPath?: string;
  } = {}
): Promise<void> {
  await writeFile(
    path,
    JSON.stringify(
      {
        version: 1,
        created_at: "2026-03-06T00:00:00.000Z",
        did_key: "did:key:z6Mkk11111111111111111111111111111111111111111111",
        did_t3n: TEST_DID,
        hedera_wallet: TEST_OWNER,
        network_tier: networkTier,
        private_key: TEST_PRIVATE_KEY,
        ...(options.agentCardGatewayUrl
          ? { agent_card_gateway_url: options.agentCardGatewayUrl }
          : {}),
        ...(options.agentCardPath
          ? { agent_card_path: options.agentCardPath }
          : {}),
        ...(includeHederaRegistration
          ? {
              hedera_registration: {
                tx_hash: "0x" + "d".repeat(64),
                agent_id: "12",
                owner: TEST_OWNER,
                token_uri: "https://agent.example/.well-known/agent_card.json",
                chain_id: 296,
                identity_registry_address: TEST_IDENTITY_REGISTRY_ADDRESS,
                network: "testnet",
              },
            }
          : {}),
      },
      null,
      2
    ),
    "utf8"
  );
}

function mockAgentCardFetch(agentUri: string): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
        name: "Test Agent",
        description: "Agent card",
        endpoints: [
          {
            name: "primary",
            endpoint: agentUri,
            version: "v1",
          },
        ],
      }),
    })
  );
}

describe("registerAgentErc8004", () => {
  let identityPath: string | undefined;
  let localAgentCardPath: string | undefined;

  afterEach(async () => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    await cleanupTempFile(identityPath);
    await cleanupTempFile(localAgentCardPath);
    identityPath = undefined;
    localAgentCardPath = undefined;
  });

  it("registers the same URI in T3N and Hedera for non-local network", async () => {
    identityPath = createTempFilePath("register-agent-erc8004-non-local");
    await writeIdentityConfig(identityPath);

    const agentUri = "https://agent.example/.well-known/agent_card.json";
    mockAgentCardFetch(agentUri);
    assertHederaRegistrationReadyMock.mockResolvedValue({
      chainId: 296,
      identityRegistryAddress: TEST_IDENTITY_REGISTRY_ADDRESS,
      operatorAccountId: "0.0.12345",
      operatorAddress: "0x" + "3".repeat(40),
      balanceHbar: "100.0",
    });

    registerDidT3nMock.mockResolvedValue({
      did: TEST_DID,
      address: "0x" + "1".repeat(40),
      txHash: "0x" + "a".repeat(64),
      agentUri,
      agentRecord: {
        agent_uri: agentUri,
        registered_at: 1,
        updated_at: 1,
        owner: TEST_OWNER,
      },
    });
    registerHederaAgentIdentityMock.mockResolvedValue({
      agentId: "7",
      owner: TEST_OWNER,
      tokenUri: agentUri,
      txHash: "0x" + "b".repeat(64),
      chainId: 296,
      identityRegistryAddress: TEST_IDENTITY_REGISTRY_ADDRESS,
      operatorAccountId: "0.0.12345",
      operatorAddress: "0x" + "3".repeat(40),
      explorerTxUrl:
        "https://hashscan.io/testnet/transaction/0x" + "b".repeat(64),
      verified: true,
      created: true,
      updated: false,
      balanceHbar: "100.0",
    });

    const result = await registerAgentErc8004({
      networkTier: "testnet",
      identityConfigPath: identityPath,
      agentUri,
    });

    expect(registerDidT3nMock).toHaveBeenCalledTimes(1);
    expect(assertHederaRegistrationReadyMock).toHaveBeenCalledTimes(1);
    expect(assertHederaRegistrationReadyMock).toHaveBeenCalledWith("testnet", {
      env: process.env,
    });
    expect(registerDidT3nMock).toHaveBeenCalledWith(
      TEST_PRIVATE_KEY,
      "testnet",
      expect.objectContaining({
        agentUri,
        env: process.env,
        verifyRegistration: true,
      })
    );

    expect(registerHederaAgentIdentityMock).toHaveBeenCalledTimes(1);
    expect(registerHederaAgentIdentityMock).toHaveBeenCalledWith("testnet", agentUri, {
      env: process.env,
    });

    expect(result.did).toBe(TEST_DID);
    expect(result.verified).toBe(true);
    expect(result.t3n.txHash).toBe("0x" + "a".repeat(64));
    expect(result.t3n.runtimeAgentUri).toBe(agentUri);
    expect(result.hedera.txHash).toBe("0x" + "b".repeat(64));
    expect(result.hedera.agentId).toBe("7");

    const persisted = JSON.parse(await readFile(identityPath, "utf8")) as Record<string, unknown>;
    expect(persisted.t3n_registration).toEqual({
      tx_hash: "0x" + "a".repeat(64),
      agent_uri: agentUri,
      runtime_agent_uri: agentUri,
    });
    expect(persisted.hedera_registration).toEqual({
      tx_hash: "0x" + "b".repeat(64),
      agent_id: "7",
      owner: TEST_OWNER,
      token_uri: agentUri,
      chain_id: 296,
      identity_registry_address: TEST_IDENTITY_REGISTRY_ADDRESS,
      network: "testnet",
    });
    expect(typeof persisted.erc8004_last_verified_at).toBe("string");
  });

  it("supports caller-provided validation timeouts for slow gateways", async () => {
    const agentUri = "https://agent.example/.well-known/agent_card.json";
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 504,
          headers: new Headers(),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
            name: "Test Agent",
            description: "Agent card",
            endpoints: [
              {
                name: "primary",
                endpoint: agentUri,
                version: "v1",
              },
            ],
          }),
        })
    );

    await expect(
      validatePublicAgentCardUrl(agentUri, {
        timeoutMs: 50,
        attemptTimeoutMs: 10,
        retryIntervalMs: 1,
      })
    ).resolves.toBeUndefined();
  });

  it("fails when CCF readback record is unavailable", async () => {
    identityPath = createTempFilePath("register-agent-erc8004-missing-ccf-readback");
    await writeIdentityConfig(identityPath);

    const agentUri = "https://agent.example/.well-known/agent_card.json";
    mockAgentCardFetch(agentUri);
    assertHederaRegistrationReadyMock.mockResolvedValue({
      chainId: 296,
      identityRegistryAddress: TEST_IDENTITY_REGISTRY_ADDRESS,
      operatorAccountId: "0.0.12345",
      operatorAddress: "0x" + "3".repeat(40),
      balanceHbar: "100.0",
    });
    registerDidT3nMock.mockResolvedValue({
      did: TEST_DID,
      address: "0x" + "1".repeat(40),
      txHash: "0x" + "a".repeat(64),
      agentUri,
      agentRecord: null,
    });
    registerHederaAgentIdentityMock.mockResolvedValue({
      agentId: "7",
      owner: TEST_OWNER,
      tokenUri: agentUri,
      txHash: "0x" + "b".repeat(64),
      chainId: 296,
      identityRegistryAddress: TEST_IDENTITY_REGISTRY_ADDRESS,
      operatorAccountId: "0.0.12345",
      operatorAddress: "0x" + "3".repeat(40),
      explorerTxUrl:
        "https://hashscan.io/testnet/transaction/0x" + "b".repeat(64),
      verified: true,
      created: false,
      updated: true,
      balanceHbar: "100.0",
    });

    await expect(
      registerAgentErc8004({
        networkTier: "testnet",
        identityConfigPath: identityPath,
        agentUri,
      })
    ).rejects.toThrow("CCF readback record was not returned");
  });

  it("fails when CCF readback record does not match requested URI", async () => {
    identityPath = createTempFilePath("register-agent-erc8004-non-local-mismatch");
    await writeIdentityConfig(identityPath);

    const agentUri = "https://agent.example/.well-known/agent_card.json";
    mockAgentCardFetch(agentUri);
    assertHederaRegistrationReadyMock.mockResolvedValue({
      chainId: 295,
      identityRegistryAddress: TEST_IDENTITY_REGISTRY_ADDRESS,
      operatorAccountId: "0.0.12345",
      operatorAddress: "0x" + "3".repeat(40),
      balanceHbar: "100.0",
    });

    registerDidT3nMock.mockResolvedValue({
      did: TEST_DID,
      address: "0x" + "1".repeat(40),
      txHash: "0x" + "b".repeat(64),
      agentUri,
      agentRecord: {
        agent_uri: "https://different.example/.well-known/agent_card.json",
        registered_at: 1,
        updated_at: 1,
        owner: TEST_OWNER,
      },
    });

    await expect(
      registerAgentErc8004({
        networkTier: "mainnet",
        identityConfigPath: identityPath,
        agentUri,
      })
    ).rejects.toThrow("CCF readback record mismatch");
  });

  it("passes stored Hedera registration metadata to the Hedera helper", async () => {
    identityPath = createTempFilePath("register-agent-erc8004-existing-hedera");
    await writeIdentityConfig(identityPath, "testnet", true);

    const agentUri = "https://agent.example/.well-known/agent_card.json";
    mockAgentCardFetch(agentUri);
    assertHederaRegistrationReadyMock.mockResolvedValue({
      chainId: 296,
      identityRegistryAddress: TEST_IDENTITY_REGISTRY_ADDRESS,
      operatorAccountId: "0.0.12345",
      operatorAddress: "0x" + "3".repeat(40),
      balanceHbar: "100.0",
    });
    registerDidT3nMock.mockResolvedValue({
      did: TEST_DID,
      address: "0x" + "1".repeat(40),
      txHash: "0x" + "a".repeat(64),
      agentUri,
      agentRecord: {
        agent_uri: agentUri,
        registered_at: 1,
        updated_at: 1,
        owner: TEST_OWNER,
      },
    });
    registerHederaAgentIdentityMock.mockResolvedValue({
      agentId: "12",
      owner: TEST_OWNER,
      tokenUri: agentUri,
      txHash: "0x" + "d".repeat(64),
      chainId: 296,
      identityRegistryAddress: TEST_IDENTITY_REGISTRY_ADDRESS,
      operatorAccountId: "0.0.12345",
      operatorAddress: "0x" + "3".repeat(40),
      explorerTxUrl:
        "https://hashscan.io/testnet/transaction/0x" + "d".repeat(64),
      verified: true,
      created: false,
      updated: false,
      balanceHbar: "100.0",
    });

    await registerAgentErc8004({
      networkTier: "testnet",
      identityConfigPath: identityPath,
      agentUri,
    });

    expect(registerHederaAgentIdentityMock).toHaveBeenCalledWith("testnet", agentUri, {
      env: process.env,
      operatorAccountId: undefined,
      operatorPrivateKey: undefined,
      existingRegistration: {
        tx_hash: "0x" + "d".repeat(64),
        agent_id: "12",
        owner: TEST_OWNER,
        token_uri: agentUri,
        chain_id: 296,
        identity_registry_address: TEST_IDENTITY_REGISTRY_ADDRESS,
        network: "testnet",
      },
    });
  });

  it("rejects local registration mode", async () => {
    identityPath = createTempFilePath("register-agent-erc8004-local");
    await writeIdentityConfig(identityPath, "local");

    await expect(
      registerAgentErc8004({
        identityConfigPath: identityPath,
        agentUri: "https://agent.example/.well-known/agent_card.json",
      })
    ).rejects.toThrow("does not support HEDERA_NETWORK=local");
  });

  it("fails before registration when the public agent card cannot be validated", async () => {
    identityPath = createTempFilePath("register-agent-erc8004-invalid-card");
    await writeIdentityConfig(identityPath);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      registerAgentErc8004({
        identityConfigPath: identityPath,
        agentUri: "https://agent.example/.well-known/agent_card.json",
      })
    ).rejects.toThrow("Failed to validate public agent card");

    expect(registerDidT3nMock).not.toHaveBeenCalled();
    expect(registerHederaAgentIdentityMock).not.toHaveBeenCalled();
  });

  it("does not use local fallback when the public card URL returns 403", async () => {
    identityPath = createTempFilePath("register-agent-erc8004-forbidden-card");
    localAgentCardPath = createTempFilePath("register-agent-erc8004-local-card");
    const agentUri = "https://agent.example/.well-known/agent_card.json";

    await writeFile(
      localAgentCardPath,
      JSON.stringify(
        {
          type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
          name: "Test Agent",
          description: "Agent card",
          endpoints: [
            {
              name: "primary",
              endpoint: agentUri,
              version: "v1",
            },
          ],
        },
        null,
        2
      ),
      "utf8"
    );
    await writeIdentityConfig(identityPath, "testnet", false, {
      agentCardGatewayUrl: agentUri,
      agentCardPath: localAgentCardPath,
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      headers: { get: () => null },
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      registerAgentErc8004({
        identityConfigPath: identityPath,
        agentUri,
      })
    ).rejects.toThrow("must be publicly reachable without authentication");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(registerDidT3nMock).not.toHaveBeenCalled();
    expect(registerHederaAgentIdentityMock).not.toHaveBeenCalled();
  });

  it("allows local fallback for transient gateway failures", async () => {
    identityPath = createTempFilePath("register-agent-erc8004-transient-fallback");
    localAgentCardPath = createTempFilePath("register-agent-erc8004-local-card-transient");
    const agentUri = "https://agent.example/.well-known/agent_card.json";

    await writeFile(
      localAgentCardPath,
      JSON.stringify(
        {
          type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
          name: "Test Agent",
          description: "Agent card",
          endpoints: [
            {
              name: "primary",
              endpoint: agentUri,
              version: "v1",
            },
          ],
        },
        null,
        2
      ),
      "utf8"
    );
    await writeIdentityConfig(identityPath, "testnet", false, {
      agentCardGatewayUrl: agentUri,
      agentCardPath: localAgentCardPath,
    });

    const dateNowSpy = vi.spyOn(Date, "now");
    let now = 0;
    dateNowSpy.mockImplementation(() => {
      const current = now;
      now += 10_000;
      return current;
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        headers: { get: () => "60" },
      })
    );
    assertHederaRegistrationReadyMock.mockResolvedValue({
      chainId: 296,
      identityRegistryAddress: TEST_IDENTITY_REGISTRY_ADDRESS,
      operatorAccountId: "0.0.12345",
      operatorAddress: "0x" + "3".repeat(40),
      balanceHbar: "100.0",
    });
    registerDidT3nMock.mockResolvedValue({
      did: TEST_DID,
      address: "0x" + "1".repeat(40),
      txHash: "0x" + "a".repeat(64),
      agentUri,
      agentRecord: {
        agent_uri: agentUri,
        registered_at: 1,
        updated_at: 1,
        owner: TEST_OWNER,
      },
    });
    registerHederaAgentIdentityMock.mockResolvedValue({
      agentId: "7",
      owner: TEST_OWNER,
      tokenUri: agentUri,
      txHash: "0x" + "b".repeat(64),
      chainId: 296,
      identityRegistryAddress: TEST_IDENTITY_REGISTRY_ADDRESS,
      operatorAccountId: "0.0.12345",
      operatorAddress: "0x" + "3".repeat(40),
      explorerTxUrl: "https://hashscan.io/testnet/transaction/0x" + "b".repeat(64),
      verified: true,
      created: true,
      updated: false,
      balanceHbar: "100.0",
    });

    try {
      const result = await registerAgentErc8004({
        identityConfigPath: identityPath,
        agentUri,
      });

      expect(result.verified).toBe(true);
      expect(registerDidT3nMock).toHaveBeenCalledTimes(1);
      expect(registerHederaAgentIdentityMock).toHaveBeenCalledTimes(1);
    } finally {
      dateNowSpy.mockRestore();
    }
  });

  it("surfaces Hedera failure after successful T3N registration", async () => {
    identityPath = createTempFilePath("register-agent-erc8004-hedera-failure");
    await writeIdentityConfig(identityPath);

    const agentUri = "https://agent.example/.well-known/agent_card.json";
    mockAgentCardFetch(agentUri);
    assertHederaRegistrationReadyMock.mockResolvedValue({
      chainId: 296,
      identityRegistryAddress: TEST_IDENTITY_REGISTRY_ADDRESS,
      operatorAccountId: "0.0.12345",
      operatorAddress: "0x" + "3".repeat(40),
      balanceHbar: "100.0",
    });

    registerDidT3nMock.mockResolvedValue({
      did: TEST_DID,
      address: "0x" + "1".repeat(40),
      txHash: "0x" + "c".repeat(64),
      agentUri,
      agentRecord: {
        agent_uri: agentUri,
        registered_at: 1,
        updated_at: 1,
        owner: TEST_OWNER,
      },
    });
    registerHederaAgentIdentityMock.mockRejectedValue(
      new Error("Insufficient HBAR for Hedera ERC-8004 registration.")
    );

    await expect(
      registerAgentErc8004({
        networkTier: "testnet",
        identityConfigPath: identityPath,
        agentUri,
      })
    ).rejects.toThrow("T3N registration succeeded, but Hedera ERC-8004 registration failed");
  });

  it("fails before T3N registration when Hedera preflight is not ready", async () => {
    identityPath = createTempFilePath("register-agent-erc8004-hedera-preflight");
    await writeIdentityConfig(identityPath);

    const agentUri = "https://agent.example/.well-known/agent_card.json";
    mockAgentCardFetch(agentUri);
    assertHederaRegistrationReadyMock.mockRejectedValue(
      new Error("HEDERA_PRIVATE_KEY is required for Hedera ERC-8004 registration.")
    );

    await expect(
      registerAgentErc8004({
        networkTier: "testnet",
        identityConfigPath: identityPath,
        agentUri,
      })
    ).rejects.toThrow("HEDERA_PRIVATE_KEY is required");

    expect(registerDidT3nMock).not.toHaveBeenCalled();
    expect(registerHederaAgentIdentityMock).not.toHaveBeenCalled();
  });
});
