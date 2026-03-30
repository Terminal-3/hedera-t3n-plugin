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
    did_key: "did:key:zabc",
    did_t3n: "did:t3n:a:abc-123",
    hedera_wallet: "0x" + "1".repeat(40),
  };

  it("derives a filesystem-safe local filename from did_t3n", () => {
    expect(getAgentCardFilename(identity)).toBe("did_t3n_a_abc-123.json");
  });

  it("preserves the did_t3n value for the Pinata upload filename", () => {
    expect(getAgentCardUploadFilename(identity)).toBe("did:t3n:a:abc-123.json");
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
    expect(agentCardPath.endsWith("did_t3n_a_abc-123.json")).toBe(true);

    const stored = JSON.parse(await readFile(agentCardPath, "utf8")) as {
      endpoints: Array<{ endpoint: string }>;
    };
    expect(stored.endpoints[0]?.endpoint).toBe(agentCard.endpoints[0]?.endpoint);
  });
});
