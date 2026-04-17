import { writeFile } from "fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import {
  loadAgentIdentityConfigObject,
  loadValidatedStoredCredentials,
  resolveRequiredAgentIdentityConfigPath,
} from "../../src/utils/agent-identity-config.js";
import { cleanupTempFile, createTempFilePath } from "../helpers/temp-files.js";

describe("agent-identity-config helpers", () => {
  let identityPath: string | undefined;

  afterEach(async () => {
    await cleanupTempFile(identityPath);
    identityPath = undefined;
  });

  it("prefers explicit path override", () => {
    expect(
      resolveRequiredAgentIdentityConfigPath({
        pathOverride: "./custom.json",
        env: { AGENT_IDENTITY_CONFIG_PATH: "./env.json" },
        missingPathMessage: "missing",
      })
    ).toContain("custom.json");
  });

  it("requires the loaded identity file to be a json object", async () => {
    identityPath = createTempFilePath("identity-array");
    await writeFile(identityPath, JSON.stringify(["not", "an", "object"]), "utf8");

    await expect(
      loadAgentIdentityConfigObject({
        resolvedPath: identityPath,
        emptyFileMessage: "empty",
      })
    ).rejects.toThrow("must be a JSON object");
  });

  it("loads validated stored credentials and can reject local network", async () => {
    identityPath = createTempFilePath("identity-local");
    await writeFile(
      identityPath,
      JSON.stringify(
        {
          version: 1,
          created_at: "2026-03-06T00:00:00.000Z",
          did_t3n: "did:t3n:bca583d0718b5567627cf92858310d690e7ae61b",
          hedera_wallet: "0x" + "2".repeat(40),
          network_tier: "local",
          private_key: "0x" + "1".repeat(64),
          public_key: "0x" + "b".repeat(66),
        },
        null,
        2
      ),
      "utf8"
    );

    await expect(
      loadValidatedStoredCredentials({
        resolvedPath: identityPath,
        emptyFileMessage: "empty",
        disallowLocalMessage: "local not allowed",
      })
    ).rejects.toThrow("local not allowed");
  });
});
