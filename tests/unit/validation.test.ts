/**
 * Purpose: Unit tests for validation schemas and regex patterns
 * Scope:   Tests DID_KEY_REGEX, DID_T3N_REGEX, HEDERA_WALLET_REGEX, PRIVATE_KEY_REGEX,
 *          and storedCredentialsSchema validation
 * Inputs:  Test DID strings, wallet addresses, private keys, and credential objects
 * Outputs: Test assertions for validation behavior including edge cases
 *
 * These tests verify that regex patterns correctly accept valid formats and reject
 * invalid ones, including edge cases like ambiguous characters in base58btc and
 * various DID format variations.
 */

import { describe, expect, it } from "vitest";

import {
  DID_KEY_REGEX,
  DID_T3N_REGEX,
  validateStoredCredentials,
} from "../../src/utils/validation";

describe("validation utils", () => {
  describe("DID_KEY_REGEX", () => {
    it("accepts valid base58btc did:key fragments", () => {
      // Known valid vector from crypto.test.ts (real-world example)
      expect(
        DID_KEY_REGEX.test("did:key:zQ3shZtr1sUnrETvXPDa4gYSNE3gpJhdTkVmpYoWBuAiBsJ4G")
      ).toBe(true);

      // Simple valid examples using base58btc alphabet
      expect(DID_KEY_REGEX.test("did:key:zabc")).toBe(true);
      expect(DID_KEY_REGEX.test("did:key:zTest")).toBe(true);
      expect(DID_KEY_REGEX.test("did:key:z123")).toBe(true);
      expect(DID_KEY_REGEX.test("did:key:zABCDEF")).toBe(true);
    });

    it("rejects did:key fragments containing invalid base58btc characters", () => {
      // Base58btc alphabet excludes 0, O, I, l to avoid visual ambiguity
      // These characters can be confused with each other, so they're excluded from the spec
      expect(DID_KEY_REGEX.test("did:key:z0abc")).toBe(false); // contains 0
      expect(DID_KEY_REGEX.test("did:key:zOabc")).toBe(false); // contains O
      expect(DID_KEY_REGEX.test("did:key:zIabc")).toBe(false); // contains I
      expect(DID_KEY_REGEX.test("did:key:zlabc")).toBe(false); // contains l

      // Multiple invalid characters should also be rejected
      expect(DID_KEY_REGEX.test("did:key:z0OlI")).toBe(false);
    });

    it("rejects invalid did:key formats", () => {
      expect(DID_KEY_REGEX.test("did:key:")).toBe(false); // empty fragment
      expect(DID_KEY_REGEX.test("did:key:z")).toBe(false); // empty fragment after z
      expect(DID_KEY_REGEX.test("did:key:abc")).toBe(false); // missing z prefix
      expect(DID_KEY_REGEX.test("did:key:z@#$")).toBe(false); // special characters
      expect(DID_KEY_REGEX.test("not-a-did")).toBe(false); // not a did:key
    });
  });

  describe("DID_T3N_REGEX", () => {
    it("accepts valid T3N agent DID formats", () => {
      expect(DID_T3N_REGEX.test("did:t3n:a:abc123")).toBe(true);
      expect(DID_T3N_REGEX.test("did:t3:a:abc123")).toBe(true);
      // UUID-style format with hyphens
      expect(DID_T3N_REGEX.test("did:t3n:a:12345678-abcd-1234-abcd-123456789abc")).toBe(true);
      // Minimal valid suffix
      expect(DID_T3N_REGEX.test("did:t3n:a:a")).toBe(true);
      // Case-insensitive hex matching (consistent with HEDERA_WALLET_REGEX and PRIVATE_KEY_REGEX)
      expect(DID_T3N_REGEX.test("did:t3n:a:ABC123")).toBe(true);
      expect(DID_T3N_REGEX.test("did:t3n:a:AbC123")).toBe(true);
    });

    it("rejects invalid T3N agent DID formats", () => {
      expect(DID_T3N_REGEX.test("did:t3n:a:")).toBe(false); // empty suffix
      expect(DID_T3N_REGEX.test("did:t3n:a:xyz")).toBe(false); // invalid hex chars
      expect(DID_T3N_REGEX.test("did:t3n:a:abc@123")).toBe(false); // special chars
      expect(DID_T3N_REGEX.test("did:t3:abc123")).toBe(false); // missing a: prefix
      expect(DID_T3N_REGEX.test("did:t3n:abc123")).toBe(false); // missing a: prefix
    });
  });

  describe("validateStoredCredentials", () => {
    it("validates a complete StoredCredentials object", () => {
      const valid = {
        version: 1,
        created_at: new Date().toISOString(),
        did_key: "did:key:zQ3shZtr1sUnrETvXPDa4gYSNE3gpJhdTkVmpYoWBuAiBsJ4G",
        did_t3n: "did:t3n:a:abc123",
        hedera_wallet: "0x" + "1".repeat(40),
        network_tier: "local" as const,
        private_key: "0x" + "2".repeat(64),
      };

      expect(() => validateStoredCredentials(valid)).not.toThrow();
      const result = validateStoredCredentials(valid);
      expect(result.did_key).toBe(valid.did_key);
    });

    it("rejects did_key with invalid base58btc characters", () => {
      const invalid = {
        version: 1,
        created_at: new Date().toISOString(),
        did_key: "did:key:z0abc", // contains invalid character 0
        did_t3n: "did:t3n:a:abc123",
        hedera_wallet: "0x" + "1".repeat(40),
        network_tier: "local" as const,
        private_key: "0x" + "2".repeat(64),
      };

      expect(() => validateStoredCredentials(invalid)).toThrow();
    });
  });
});
