import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StoredHederaRegistrationMetadata } from "../../src/utils/storage.js";

const TEST_REGISTRY = "0x1111111111111111111111111111111111111111";
const OTHER_REGISTRY = "0x2222222222222222222222222222222222222222";
const TEST_AGENT_URI = "https://agent.example/.well-known/agent_card.json";
const TEST_OLD_AGENT_URI = "https://agent.example/.well-known/old-agent-card.json";
const OPERATOR_ADDRESS = "0x3333333333333333333333333333333333333333";

const registerMock = vi.fn();
const setAgentUriMock = vi.fn();
const ownerOfMock = vi.fn();
const tokenURIMock = vi.fn();
const getCodeMock = vi.fn();
const getBalanceMock = vi.fn();
const getTransactionReceiptMock = vi.fn();
const parseLogMock = vi.fn();

vi.mock("ethers", () => {
  class MockJsonRpcProvider {
    constructor(_url: string, _network: unknown, _options: unknown) {}

    getCode = getCodeMock;
    getBalance = getBalanceMock;
    getTransactionReceipt = getTransactionReceiptMock;
  }

  class MockWallet {
    address = OPERATOR_ADDRESS;

    constructor(_privateKey: string, _provider?: unknown) {}
  }

  class MockContract {
    constructor(_address: string, _abi: readonly string[], _runner: unknown) {}

    register = registerMock;
    setAgentUri = setAgentUriMock;
    ownerOf = ownerOfMock;
    tokenURI = tokenURIMock;
  }

  class MockInterface {
    parseLog(log: unknown): unknown {
      return parseLogMock(log);
    }
  }

  return {
    Contract: MockContract,
    Interface: MockInterface,
    JsonRpcProvider: MockJsonRpcProvider,
    Wallet: MockWallet,
    formatEther: () => "1.0",
    getAddress: (value: string) => value,
    isAddress: (value: string) => /^0x[0-9a-fA-F]{40}$/.test(value),
  };
});

import {
  registerHederaAgentIdentity,
  verifyHederaAgentRegistrationByTxHash,
} from "../../src/utils/hedera.js";

function createTxResponse(hash: string, logs: readonly unknown[] = []): {
  hash: string;
  wait(): Promise<{ logs: readonly unknown[] }>;
} {
  return {
    hash,
    wait: async () => ({ logs }),
  };
}

function createExistingRegistration(
  overrides: Partial<StoredHederaRegistrationMetadata> = {}
): StoredHederaRegistrationMetadata {
  return {
    tx_hash: "0x" + "a".repeat(64),
    agent_id: "7",
    owner: OPERATOR_ADDRESS,
    token_uri: TEST_AGENT_URI,
    chain_id: 296,
    identity_registry_address: TEST_REGISTRY,
    network: "testnet",
    ...overrides,
  };
}

describe("registerHederaAgentIdentity", () => {
  beforeEach(() => {
    getCodeMock.mockResolvedValue("0x1234");
    getBalanceMock.mockResolvedValue(1n);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("reuses an existing registration when the on-chain URI already matches", async () => {
    ownerOfMock.mockResolvedValue(OPERATOR_ADDRESS);
    tokenURIMock.mockResolvedValue(TEST_AGENT_URI);

    const result = await registerHederaAgentIdentity("testnet", TEST_AGENT_URI, {
      env: {
        HEDERA_ACCOUNT_ID: "0.0.12345",
        HEDERA_PRIVATE_KEY: "0x" + "1".repeat(64),
        HEDERA_IDENTITY_REGISTRY_ADDRESS: TEST_REGISTRY,
      },
      existingRegistration: createExistingRegistration(),
    });

    expect(registerMock).not.toHaveBeenCalled();
    expect(setAgentUriMock).not.toHaveBeenCalled();
    expect(result.txHash).toBe("0x" + "a".repeat(64));
    expect(result.created).toBe(false);
    expect(result.updated).toBe(false);
  });

  it("updates an existing registration when the URI changed", async () => {
    ownerOfMock.mockResolvedValue(OPERATOR_ADDRESS);
    tokenURIMock.mockResolvedValueOnce(TEST_OLD_AGENT_URI).mockResolvedValueOnce(TEST_AGENT_URI);
    setAgentUriMock.mockResolvedValue(createTxResponse("0x" + "b".repeat(64)));

    const result = await registerHederaAgentIdentity("testnet", TEST_AGENT_URI, {
      env: {
        HEDERA_ACCOUNT_ID: "0.0.12345",
        HEDERA_PRIVATE_KEY: "0x" + "1".repeat(64),
        HEDERA_IDENTITY_REGISTRY_ADDRESS: TEST_REGISTRY,
      },
      existingRegistration: createExistingRegistration({
        token_uri: TEST_OLD_AGENT_URI,
      }),
    });

    expect(registerMock).not.toHaveBeenCalled();
    expect(setAgentUriMock).toHaveBeenCalledWith("7", TEST_AGENT_URI);
    expect(result.txHash).toBe("0x" + "b".repeat(64));
    expect(result.created).toBe(false);
    expect(result.updated).toBe(true);
  });

  it("fails closed when stored registration ownership no longer matches the operator", async () => {
    ownerOfMock.mockResolvedValue("0x4444444444444444444444444444444444444444");
    tokenURIMock.mockResolvedValue(TEST_AGENT_URI);

    await expect(
      registerHederaAgentIdentity("testnet", TEST_AGENT_URI, {
        env: {
          HEDERA_ACCOUNT_ID: "0.0.12345",
          HEDERA_PRIVATE_KEY: "0x" + "1".repeat(64),
          HEDERA_IDENTITY_REGISTRY_ADDRESS: TEST_REGISTRY,
        },
        existingRegistration: createExistingRegistration(),
      })
    ).rejects.toThrow("Refusing to reuse or update it");

    expect(registerMock).not.toHaveBeenCalled();
    expect(setAgentUriMock).not.toHaveBeenCalled();
  });

  it("registers a new token when no stored registration exists", async () => {
    parseLogMock.mockReturnValue({
      name: "Registered",
      args: { agentId: 9n },
    });
    registerMock.mockResolvedValue(
      createTxResponse("0x" + "c".repeat(64), [
        { topics: [], data: "0x", address: TEST_REGISTRY },
      ])
    );
    ownerOfMock.mockResolvedValue(OPERATOR_ADDRESS);
    tokenURIMock.mockResolvedValue(TEST_AGENT_URI);

    const result = await registerHederaAgentIdentity("testnet", TEST_AGENT_URI, {
      env: {
        HEDERA_ACCOUNT_ID: "0.0.12345",
        HEDERA_PRIVATE_KEY: "0x" + "1".repeat(64),
        HEDERA_IDENTITY_REGISTRY_ADDRESS: TEST_REGISTRY,
      },
    });

    expect(registerMock).toHaveBeenCalledWith(TEST_AGENT_URI);
    expect(result.agentId).toBe("9");
    expect(result.txHash).toBe("0x" + "c".repeat(64));
    expect(result.created).toBe(true);
    expect(result.updated).toBe(false);
  });

  it("verifies registration by tx hash using Registered event logs", async () => {
    getTransactionReceiptMock.mockResolvedValue({
      logs: [{ topics: [], data: "0xregistered", address: TEST_REGISTRY }],
    });
    parseLogMock.mockImplementation((log: unknown) => {
      const data = (log as { data?: unknown }).data;
      if (data === "0xregistered") {
        return { name: "Registered", args: { agentId: 9n } };
      }
      throw new Error("unknown log");
    });
    ownerOfMock.mockResolvedValue(OPERATOR_ADDRESS);
    tokenURIMock.mockResolvedValue(TEST_AGENT_URI);

    const result = await verifyHederaAgentRegistrationByTxHash(
      "testnet",
      "0x" + "d".repeat(64),
      {
        env: {
          HEDERA_IDENTITY_REGISTRY_ADDRESS: TEST_REGISTRY,
        },
        expectedOwner: OPERATOR_ADDRESS,
        expectedAgentUri: TEST_AGENT_URI,
      }
    );

    expect(result.agentId).toBe("9");
    expect(result.owner).toBe(OPERATOR_ADDRESS.toLowerCase());
    expect(result.tokenUri).toBe(TEST_AGENT_URI);
  });

  it("verifies registration by tx hash using UriUpdated event logs", async () => {
    getTransactionReceiptMock.mockResolvedValue({
      logs: [{ topics: [], data: "0xupdated", address: TEST_REGISTRY }],
    });
    parseLogMock.mockImplementation((log: unknown) => {
      const data = (log as { data?: unknown }).data;
      if (data === "0xupdated") {
        return { name: "UriUpdated", args: { agentId: 11n } };
      }
      throw new Error("unknown log");
    });
    ownerOfMock.mockResolvedValue(OPERATOR_ADDRESS);
    tokenURIMock.mockResolvedValue(TEST_AGENT_URI);

    const result = await verifyHederaAgentRegistrationByTxHash(
      "testnet",
      "0x" + "e".repeat(64),
      {
        env: {
          HEDERA_IDENTITY_REGISTRY_ADDRESS: TEST_REGISTRY,
        },
        expectedOwner: OPERATOR_ADDRESS,
        expectedAgentUri: TEST_AGENT_URI,
      }
    );

    expect(result.agentId).toBe("11");
    expect(result.owner).toBe(OPERATOR_ADDRESS.toLowerCase());
    expect(result.tokenUri).toBe(TEST_AGENT_URI);
  });

  it("ignores matching-signature logs from non-registry contracts", async () => {
    getTransactionReceiptMock.mockResolvedValue({
      logs: [
        { topics: [], data: "0xnonregistry", address: OTHER_REGISTRY },
        { topics: [], data: "0xregistered", address: TEST_REGISTRY },
      ],
    });
    parseLogMock.mockImplementation((log: unknown) => {
      const data = (log as { data?: unknown }).data;
      if (data === "0xnonregistry") {
        return { name: "Registered", args: { agentId: 999n } };
      }
      if (data === "0xregistered") {
        return { name: "Registered", args: { agentId: 9n } };
      }
      throw new Error("unknown log");
    });
    ownerOfMock.mockResolvedValue(OPERATOR_ADDRESS);
    tokenURIMock.mockResolvedValue(TEST_AGENT_URI);

    const result = await verifyHederaAgentRegistrationByTxHash(
      "testnet",
      "0x" + "f".repeat(64),
      {
        env: {
          HEDERA_IDENTITY_REGISTRY_ADDRESS: TEST_REGISTRY,
        },
        expectedOwner: OPERATOR_ADDRESS,
        expectedAgentUri: TEST_AGENT_URI,
      }
    );

    expect(result.agentId).toBe("9");
    expect(parseLogMock).toHaveBeenCalledTimes(1);
    expect(parseLogMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: "0xnonregistry" })
    );
  });
});
