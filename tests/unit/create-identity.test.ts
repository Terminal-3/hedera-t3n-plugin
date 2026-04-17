import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/utils/crypto.js", () => ({
  generateSecp256k1Keypair: vi.fn(),
}));

vi.mock("../../src/utils/hedera.js", () => ({
  deriveHederaAddress: vi.fn(),
}));

vi.mock("../../src/utils/agentCard.js", () => ({
  loadOrCreateAgentCard: vi.fn(),
}));

vi.mock("../../src/utils/storage.js", () => ({
  storeCredentials: vi.fn(),
}));

vi.mock("../../src/utils/t3n.js", () => ({
  deriveDeterministicT3nDid: vi.fn(),
  registerDidT3n: vi.fn(),
  resolveT3nBaseUrl: vi.fn(),
  resolveT3nRuntimeApiUrl: vi.fn(),
  getT3nEnvironmentLabel: vi.fn((tier: "local" | "testnet" | "mainnet") => {
    if (tier === "local") return "local/mock";
    if (tier === "mainnet") return "production";
    return "staging";
  }),
}));

import { createIdentity } from "../../src/createIdentity.js";
import { loadOrCreateAgentCard } from "../../src/utils/agentCard.js";
import { generateSecp256k1Keypair } from "../../src/utils/crypto.js";
import { deriveHederaAddress } from "../../src/utils/hedera.js";
import { storeCredentials } from "../../src/utils/storage.js";
import {
  deriveDeterministicT3nDid,
  registerDidT3n,
  resolveT3nBaseUrl,
  resolveT3nRuntimeApiUrl,
} from "../../src/utils/t3n.js";

const TEST_PRIVATE_KEY = `0x${"1".repeat(64)}`;
const TEST_PUBLIC_KEY = `0x${"2".repeat(66)}`;
const TEST_WALLET = `0x${"3".repeat(40)}`;
const TEST_AUTH_DID = `did:t3n:${"4".repeat(40)}`;
const TEST_LOCAL_DID = `did:t3n:${"5".repeat(40)}`;

const generateSecp256k1KeypairMock = vi.mocked(generateSecp256k1Keypair);
const deriveHederaAddressMock = vi.mocked(deriveHederaAddress);
const storeCredentialsMock = vi.mocked(storeCredentials);
const loadOrCreateAgentCardMock = vi.mocked(loadOrCreateAgentCard);
const deriveDeterministicT3nDidMock = vi.mocked(deriveDeterministicT3nDid);
const registerDidT3nMock = vi.mocked(registerDidT3n);
const resolveT3nBaseUrlMock = vi.mocked(resolveT3nBaseUrl);
const resolveT3nRuntimeApiUrlMock = vi.mocked(resolveT3nRuntimeApiUrl);

describe("createIdentity DID sourcing", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    generateSecp256k1KeypairMock.mockReturnValue({
      privateKey: TEST_PRIVATE_KEY,
      publicKey: TEST_PUBLIC_KEY,
    });
    deriveHederaAddressMock.mockReturnValue(TEST_WALLET);
    resolveT3nBaseUrlMock.mockResolvedValue("https://cn-api.sg.staging.t3n.terminal3.io");
    resolveT3nRuntimeApiUrlMock.mockResolvedValue("https://node.sg.staging.t3n.terminal3.io/api/rpc");
    storeCredentialsMock.mockResolvedValue("/tmp/agent_identity.json");
    loadOrCreateAgentCardMock.mockResolvedValue({
      agentCardPath: "/tmp/agent_card.json",
      created: true,
      updated: false,
      identityPath: "/tmp/agent_identity.json",
    });
  });

  it("uses T3N authentication DID for non-local identity creation", async () => {
    registerDidT3nMock.mockResolvedValue({
      did: TEST_AUTH_DID,
      address: TEST_WALLET,
    });
    deriveDeterministicT3nDidMock.mockReturnValue(TEST_LOCAL_DID);

    const result = await createIdentity({
      networkTier: "testnet",
      outputPath: "/tmp/agent_identity.json",
    });

    expect(registerDidT3nMock).toHaveBeenCalledTimes(1);
    expect(registerDidT3nMock).toHaveBeenCalledWith(
      TEST_PRIVATE_KEY,
      "testnet",
      expect.objectContaining({
        registerAgentUri: false,
        verifyRegistration: false,
        env: process.env,
      })
    );
    expect(deriveDeterministicT3nDidMock).not.toHaveBeenCalled();
    expect(storeCredentialsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        did_t3n: TEST_AUTH_DID,
      }),
      { outputPath: "/tmp/agent_identity.json" }
    );
    expect(result.did_t3n).toBe(TEST_AUTH_DID);
  });

  it("keeps deterministic local DID derivation for local tier", async () => {
    deriveDeterministicT3nDidMock.mockReturnValue(TEST_LOCAL_DID);

    const result = await createIdentity({
      networkTier: "local",
      outputPath: "/tmp/local_identity.json",
    });

    expect(registerDidT3nMock).not.toHaveBeenCalled();
    expect(deriveDeterministicT3nDidMock).toHaveBeenCalledWith(TEST_WALLET);
    expect(storeCredentialsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        did_t3n: TEST_LOCAL_DID,
        network_tier: "local",
      }),
      { outputPath: "/tmp/local_identity.json" }
    );
    expect(result.did_t3n).toBe(TEST_LOCAL_DID);
  });

  it("fails non-local creation when T3N DID authentication fails", async () => {
    registerDidT3nMock.mockRejectedValue(new Error("auth handshake failed"));

    await expect(
      createIdentity({
        networkTier: "mainnet",
      })
    ).rejects.toThrow(
      "Failed to create identity: could not authenticate did:t3n from T3N production with the generated identity key. auth handshake failed"
    );
    expect(deriveDeterministicT3nDidMock).not.toHaveBeenCalled();
  });
});
