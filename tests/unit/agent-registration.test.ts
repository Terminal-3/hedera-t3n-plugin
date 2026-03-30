import { writeFile } from "fs/promises";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/utils/t3n.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/utils/t3n.js")>();
  return {
    ...actual,
    fetchAgentViaCcfAction: vi.fn(),
  };
});

vi.mock("../../src/utils/hedera.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/utils/hedera.js")>();
  return {
    ...actual,
    readHederaAgentRegistrationByAgentId: vi.fn(),
    verifyHederaAgentRegistrationByTxHash: vi.fn(),
  };
});

import { readCurrentAgentRegistration } from "../../src/utils/agent-registration.js";
import {
  readHederaAgentRegistrationByAgentId,
  verifyHederaAgentRegistrationByTxHash,
} from "../../src/utils/hedera.js";
import { fetchAgentViaCcfAction } from "../../src/utils/t3n.js";
import { captureEnv, restoreEnv } from "../helpers/env.js";
import { cleanupTempFile, createTempFilePath } from "../helpers/temp-files.js";

const fetchAgentViaCcfActionMock = vi.mocked(fetchAgentViaCcfAction);
const readHederaAgentRegistrationByAgentIdMock = vi.mocked(
  readHederaAgentRegistrationByAgentId
);
const verifyHederaAgentRegistrationByTxHashMock = vi.mocked(
  verifyHederaAgentRegistrationByTxHash
);
const envSnapshot = captureEnv([
  "AGENT_IDENTITY_CONFIG_PATH",
  "HEDERA_NETWORK",
]);

const TEST_DID = "did:t3n:a:abc123def4567890";
const TEST_IDENTITY_WALLET = `0x${"1".repeat(40)}`;
const TEST_HEDERA_OWNER = `0x${"3".repeat(40)}`;
const TEST_PRIVATE_KEY = `0x${"2".repeat(64)}`;
const TEST_TOKEN_URI = "https://agent.example/.well-known/agent_card.json";

async function writeIdentityConfig(
  path: string,
  withHederaMetadata = true,
  withT3nMetadata = false
): Promise<void> {
  await writeFile(
    path,
    JSON.stringify(
      {
        version: 1,
        created_at: "2026-03-06T00:00:00.000Z",
        did_key: "did:key:z6Mkk11111111111111111111111111111111111111111111",
        did_t3n: TEST_DID,
        hedera_wallet: TEST_IDENTITY_WALLET,
        network_tier: "testnet",
        private_key: TEST_PRIVATE_KEY,
        ...(withHederaMetadata
          ? {
              hedera_registration: {
                tx_hash: "0x" + "a".repeat(64),
                agent_id: "7",
                owner: TEST_HEDERA_OWNER,
                token_uri: TEST_TOKEN_URI,
                chain_id: 296,
                identity_registry_address: "0x" + "3".repeat(40),
                network: "testnet",
              },
            }
          : {}),
        ...(withT3nMetadata
          ? {
                t3n_registration: {
                  tx_hash: "0x" + "b".repeat(64),
                  agent_uri: TEST_TOKEN_URI,
                  runtime_agent_uri: TEST_TOKEN_URI,
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

describe("readCurrentAgentRegistration", () => {
  let identityPath = "";

  beforeEach(() => {
    identityPath = createTempFilePath("agent-registration");
    process.env.AGENT_IDENTITY_CONFIG_PATH = identityPath;
    process.env.HEDERA_NETWORK = "testnet";
  });

  afterEach(async () => {
    restoreEnv(envSnapshot);
    vi.clearAllMocks();
    await cleanupTempFile(identityPath);
  });

  it("returns fully registered state when T3N and Hedera lookups succeed", async () => {
    await writeIdentityConfig(identityPath, true);

    fetchAgentViaCcfActionMock.mockResolvedValue({
      agent_uri: TEST_TOKEN_URI,
      registered_at: 10,
      updated_at: 12,
      owner: TEST_IDENTITY_WALLET,
    });
    readHederaAgentRegistrationByAgentIdMock.mockResolvedValue({
      agentId: "7",
      owner: TEST_HEDERA_OWNER,
      tokenUri: TEST_TOKEN_URI,
      chainId: 296,
      identityRegistryAddress: "0x" + "3".repeat(40),
    });

    const state = await readCurrentAgentRegistration();

    expect(state.did).toBe(TEST_DID);
    expect(state.network).toBe("testnet");
    expect(state.fullyRegistered).toBe(true);
    expect(state.t3n.status).toBe("registered");
    expect(state.hedera.status).toBe("registered");
    expect(state.hedera.agentId).toBe("7");
    expect(state.hedera.txHash).toBe("0x" + "a".repeat(64));
    expect(readHederaAgentRegistrationByAgentIdMock).toHaveBeenCalledWith(
      "testnet",
      "7",
      expect.objectContaining({
        expectedOwner: TEST_HEDERA_OWNER,
        expectedAgentUri: TEST_TOKEN_URI,
      })
    );
  });

  it("returns Hedera unknown when cached Hedera metadata is missing", async () => {
    await writeIdentityConfig(identityPath, false);

    fetchAgentViaCcfActionMock.mockResolvedValue(null);

    const state = await readCurrentAgentRegistration();

    expect(state.fullyRegistered).toBe(false);
    expect(state.t3n.status).toBe("not_registered");
    expect(state.hedera.status).toBe("unknown");
    expect(state.hedera.reason).toBe("metadata_missing");
    expect(readHederaAgentRegistrationByAgentIdMock).not.toHaveBeenCalled();
  });

  it("returns unknown T3N state when CCF readback lookup fails", async () => {
    await writeIdentityConfig(identityPath, true, true);

    fetchAgentViaCcfActionMock.mockRejectedValue(new Error("CCF lookup failed"));
    readHederaAgentRegistrationByAgentIdMock.mockResolvedValue({
      agentId: "7",
      owner: TEST_HEDERA_OWNER,
      tokenUri: TEST_TOKEN_URI,
      chainId: 296,
      identityRegistryAddress: "0x" + "3".repeat(40),
    });

    const state = await readCurrentAgentRegistration();

    expect(state.fullyRegistered).toBe(false);
    expect(state.t3n.status).toBe("unknown");
    expect(state.t3n.reason).toBe("lookup_failed");
    expect(state.t3n.verified).toBe(false);
    expect(state.t3n.record).toBeNull();
    expect(state.hedera.status).toBe("registered");
  });

  it("returns not_registered when Hedera metadata points to missing records", async () => {
    await writeIdentityConfig(identityPath, true, true);

    fetchAgentViaCcfActionMock.mockResolvedValue({
      agent_uri: TEST_TOKEN_URI,
      registered_at: 10,
      updated_at: 12,
      owner: TEST_IDENTITY_WALLET,
    });
    readHederaAgentRegistrationByAgentIdMock.mockRejectedValue(
      new Error("execution reverted: ERC721NonexistentToken")
    );
    verifyHederaAgentRegistrationByTxHashMock.mockRejectedValue(
      new Error("Hedera transaction receipt not found for tx hash")
    );

    const state = await readCurrentAgentRegistration();

    expect(state.hedera.status).toBe("not_registered");
    expect(state.hedera.reason).toBe("record_not_found");
    expect(state.hedera.verified).toBe(false);
    expect(state.hedera.record).toBeNull();
  });

  it("keeps Hedera status unknown for transport/provider failures", async () => {
    await writeIdentityConfig(identityPath, true, true);

    fetchAgentViaCcfActionMock.mockResolvedValue({
      agent_uri: TEST_TOKEN_URI,
      registered_at: 10,
      updated_at: 12,
      owner: TEST_IDENTITY_WALLET,
    });
    readHederaAgentRegistrationByAgentIdMock.mockRejectedValue(
      new Error("provider timeout")
    );
    verifyHederaAgentRegistrationByTxHashMock.mockRejectedValue(
      new Error("network error")
    );

    const state = await readCurrentAgentRegistration();

    expect(state.hedera.status).toBe("unknown");
    expect(state.hedera.reason).toBe("verification_failed");
    expect(state.hedera.verified).toBe(false);
    expect(state.hedera.record).toBeNull();
  });

  it("passes expectedAgentUri to tx-hash fallback verification", async () => {
    await writeIdentityConfig(identityPath, true, true);

    fetchAgentViaCcfActionMock.mockResolvedValue({
      agent_uri: TEST_TOKEN_URI,
      registered_at: 10,
      updated_at: 12,
      owner: TEST_IDENTITY_WALLET,
    });
    readHederaAgentRegistrationByAgentIdMock.mockRejectedValue(
      new Error("provider timeout")
    );
    verifyHederaAgentRegistrationByTxHashMock.mockResolvedValue({
      agentId: "7",
      owner: TEST_HEDERA_OWNER,
      tokenUri: TEST_TOKEN_URI,
      txHash: "0x" + "a".repeat(64),
      chainId: 296,
      identityRegistryAddress: "0x" + "3".repeat(40),
    });

    const state = await readCurrentAgentRegistration();

    expect(state.hedera.status).toBe("registered");
    expect(verifyHederaAgentRegistrationByTxHashMock).toHaveBeenCalledWith(
      "testnet",
      "0x" + "a".repeat(64),
      expect.objectContaining({
        expectedOwner: TEST_HEDERA_OWNER,
        expectedAgentUri: TEST_TOKEN_URI,
      })
    );
  });
});
