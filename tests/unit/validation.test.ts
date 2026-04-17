/**
 * Purpose: Unit tests for validation schemas and regex patterns
 * Scope:   Tests DID_T3N_REGEX, HEDERA_WALLET_REGEX, PRIVATE_KEY_REGEX, PUBLIC_KEY_REGEX,
 *          and storedCredentialsSchema validation
 * Inputs:  Test DID strings, wallet addresses, keys, and credential objects
 * Outputs: Test assertions for validation behavior including edge cases
 */

import { describe, expect, it } from "vitest";

import {
  DID_T3N_REGEX,
  PUBLIC_KEY_REGEX,
  validateStoredCredentials,
} from "../../src/utils/validation";

const VALID_PUBLIC_KEY =
  "0x02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71";

describe("validation utils", () => {
  describe("DID_T3N_REGEX", () => {
    it("accepts valid T3N agent DID formats", () => {
      expect(DID_T3N_REGEX.test("did:t3n:1234567890abcdef1234567890abcdef12345678")).toBe(true);
      expect(DID_T3N_REGEX.test("did:t3n:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")).toBe(true);
      expect(DID_T3N_REGEX.test("did:t3n:ABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD")).toBe(true);
    });

    it("rejects invalid T3N agent DID formats", () => {
      expect(DID_T3N_REGEX.test("did:t3n:")).toBe(false);
      expect(DID_T3N_REGEX.test("did:t3n:xyz")).toBe(false);
      expect(DID_T3N_REGEX.test("did:t3:1234567890abcdef1234567890abcdef12345678")).toBe(false);
      expect(DID_T3N_REGEX.test("did:t3n:abc123")).toBe(false);
    });
  });

  describe("PUBLIC_KEY_REGEX", () => {
    it("accepts compressed secp256k1 public keys", () => {
      expect(PUBLIC_KEY_REGEX.test(VALID_PUBLIC_KEY)).toBe(true);
      expect(PUBLIC_KEY_REGEX.test("0x" + "a".repeat(66))).toBe(true);
    });

    it("rejects malformed public keys", () => {
      expect(PUBLIC_KEY_REGEX.test("02" + "b".repeat(64))).toBe(false); // missing 0x
      expect(PUBLIC_KEY_REGEX.test("0x" + "a".repeat(64))).toBe(false); // too short
      expect(PUBLIC_KEY_REGEX.test("0xZZ" + "a".repeat(64))).toBe(false);
    });
  });

  describe("validateStoredCredentials", () => {
    it("validates a complete StoredCredentials object", () => {
      const valid = {
        version: 1,
        created_at: new Date().toISOString(),
        did_t3n: "did:t3n:649f4f8d0e0916b6f5e7d06ce100821557c8445f",
        hedera_wallet: "0x" + "1".repeat(40),
        network_tier: "local" as const,
        private_key: "0x" + "2".repeat(64),
        public_key: VALID_PUBLIC_KEY,
      };

      expect(() => validateStoredCredentials(valid)).not.toThrow();
      const result = validateStoredCredentials(valid);
      expect(result.public_key).toBe(valid.public_key);
    });

    it("rejects credentials missing public_key", () => {
      const invalid = {
        version: 1,
        created_at: new Date().toISOString(),
        did_t3n: "did:t3n:649f4f8d0e0916b6f5e7d06ce100821557c8445f",
        hedera_wallet: "0x" + "1".repeat(40),
        network_tier: "local" as const,
        private_key: "0x" + "2".repeat(64),
      };

      expect(() => validateStoredCredentials(invalid)).toThrow();
    });
  });
});
