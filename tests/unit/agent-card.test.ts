import { existsSync } from "fs";
import { mkdir, readFile, rm } from "fs/promises";
import { join, resolve } from "path";

import { afterEach, describe, expect, it } from "vitest";

import {
  getAgentCardFilename,
  getAgentCardPath,
  getAgentCardUploadFilename,
  loadOrCreateAgentCard,
} from "../../src/utils/agentCard.js";

const OUTPUT_DIR = resolve("test-output-agent-card");

afterEach(async () => {
  if (existsSync(OUTPUT_DIR)) {
    await rm(OUTPUT_DIR, { recursive: true, force: true });
  }
});

describe("agentCard utils", () => {
  const identity = {
    did_t3n: "did:t3n:649f4f8d0e0916b6f5e7d06ce100821557c8445f",
    hedera_wallet: "0x" + "1".repeat(40),
    public_key:
      "0x02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71",
  };

  it("derives a filesystem-safe local filename from did_t3n", () => {
    expect(getAgentCardFilename(identity)).toBe(
      "did_t3n_649f4f8d0e0916b6f5e7d06ce100821557c8445f.json"
    );
  });

  it("preserves the did_t3n value for the Pinata upload filename", () => {
    expect(getAgentCardUploadFilename(identity)).toBe("did:t3n:649f4f8d0e0916b6f5e7d06ce100821557c8445f.json");
  });

  it("creates the agent card using the derived local filename", async () => {
    const identityPath = join(OUTPUT_DIR, "identity.json");
    await mkdir(OUTPUT_DIR, { recursive: true });
    const { agentCardPath, agentCard, created } = await loadOrCreateAgentCard({
      identityPath,
      identity,
    });

    expect(created).toBe(true);
    expect(agentCardPath).toBe(getAgentCardPath(identityPath, identity));
    expect(agentCardPath.endsWith("did_t3n_649f4f8d0e0916b6f5e7d06ce100821557c8445f.json")).toBe(
      true
    );

    const stored = JSON.parse(await readFile(agentCardPath, "utf8")) as {
      endpoints: Array<{ name: string; endpoint: string }>;
      verificationMethod: Array<{
        id: string;
        type: string;
        controller: string;
        publicKeyJwk: { kty: string; crv: string; alg?: string; x: string; y?: string };
      }>;
      authentication: string[];
    };
    expect(stored.endpoints[0]?.endpoint).toBe(agentCard.endpoints[0]?.endpoint);
    expect(stored.endpoints.map((e) => e.name)).toEqual(["DID T3N", "Hedera Wallet"]);
    expect(stored.verificationMethod).toHaveLength(1);
    expect(stored.verificationMethod[0]?.type).toBe("JsonWebKey2020");
    expect(stored.verificationMethod[0]?.controller).toBe(identity.did_t3n);
    expect(stored.verificationMethod[0]?.publicKeyJwk.kty).toBe("EC");
    expect(stored.verificationMethod[0]?.publicKeyJwk.crv).toBe("secp256k1");
    expect(stored.verificationMethod[0]?.publicKeyJwk.alg).toBe("ES256K");
    expect(stored.authentication).toEqual([stored.verificationMethod[0]?.id]);
  });
});
