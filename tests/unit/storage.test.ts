/**
 * Purpose: Unit tests for storage utility functions
 * Scope:   Tests credential storage, file existence checks, metadata handling,
 *          filename sanitization, and edge cases
 * Inputs:  Test credentials, output directories
 * Outputs: Test assertions for storage operations
 *
 * These tests verify that credentials are stored correctly with proper metadata,
 * that file existence checks work reliably, and that filename sanitization handles
 * edge cases (special characters, empty fragments, etc.).
 */

import { existsSync } from "fs";
import { readFile, rm } from "fs/promises";
import { resolve } from "path";

import { afterEach, describe, expect, it } from "vitest";

import { credentialsExist, storeCredentials } from "../../src/utils/storage";

const OUTPUT_DIR = resolve("test-output");

afterEach(async () => {
  if (existsSync(OUTPUT_DIR)) {
    await rm(OUTPUT_DIR, { recursive: true, force: true });
  }
});

describe("storage utils", () => {
  it("stores credentials with metadata", async () => {
    const path = await storeCredentials(
      {
        did_key: "did:key:zabc",
        did_t3n: "did:t3n:a:abc123",
        hedera_wallet: "0x" + "1".repeat(40),
        network_tier: "local",
        private_key: "0x" + "2".repeat(64),
      },
      { outputDir: OUTPUT_DIR }
    );

    const file = await readFile(path, "utf8");
    const parsed = JSON.parse(file);

    expect(parsed.version).toBe(1);
    expect(parsed.did_t3n).toBe("did:t3n:a:abc123");
    expect(parsed.created_at).toBeTruthy();
  });

  it("checks credential existence", async () => {
    const didFragment = "abc123";
    await storeCredentials(
      {
        did_key: "did:key:zabc",
        did_t3n: `did:t3n:a:${didFragment}`,
        hedera_wallet: "0x" + "1".repeat(40),
        network_tier: "local",
        private_key: "0x" + "2".repeat(64),
      },
      { outputDir: OUTPUT_DIR }
    );

    expect(credentialsExist(didFragment, OUTPUT_DIR)).toBe(true);
    expect(credentialsExist("missing", OUTPUT_DIR)).toBe(false);
  });

  it("sanitizes fragment with special characters", async () => {
    const didFragment = "abc@123#test";
    const sanitizedFragment = "abc123test";
    await storeCredentials(
      {
        did_key: "did:key:zabc",
        did_t3n: `did:t3n:a:${didFragment}`,
        hedera_wallet: "0x" + "1".repeat(40),
        network_tier: "local",
        private_key: "0x" + "2".repeat(64),
      },
      { outputDir: OUTPUT_DIR }
    );

    // credentialsExist should find the file using the sanitized fragment
    expect(credentialsExist(sanitizedFragment, OUTPUT_DIR)).toBe(true);
    // Original fragment with special chars should also work (credentialsExist sanitizes too)
    expect(credentialsExist(didFragment, OUTPUT_DIR)).toBe(true);
  });

  it("sanitizes fragment preserving valid characters", async () => {
    const didFragment = "abc_123-test";
    await storeCredentials(
      {
        did_key: "did:key:zabc",
        did_t3n: `did:t3n:a:${didFragment}`,
        hedera_wallet: "0x" + "1".repeat(40),
        network_tier: "local",
        private_key: "0x" + "2".repeat(64),
      },
      { outputDir: OUTPUT_DIR }
    );

    // Underscore and hyphen should be preserved
    expect(credentialsExist(didFragment, OUTPUT_DIR)).toBe(true);
  });

  it("falls back to 'identity' when fragment becomes empty after sanitization", async () => {
    const didFragment = "@#$%";
    await storeCredentials(
      {
        did_key: "did:key:zabc",
        did_t3n: `did:t3n:a:${didFragment}`,
        hedera_wallet: "0x" + "1".repeat(40),
        network_tier: "local",
        private_key: "0x" + "2".repeat(64),
      },
      { outputDir: OUTPUT_DIR }
    );

    // Should fallback to "identity" when all chars are removed
    expect(credentialsExist("identity", OUTPUT_DIR)).toBe(true);
  });
});
