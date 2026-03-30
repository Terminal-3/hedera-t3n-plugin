/**
 * Purpose: Unit tests for cryptographic utility functions
 * Scope:   Tests keypair generation, did:key derivation, key validation
 * Inputs:  Test keys and keypairs
 * Outputs: Test assertions for crypto operations
 */

import { describe, expect, it } from "vitest";

import { deriveDidKey, generateSecp256k1Keypair, validatePrivateKey } from "../../src/utils/crypto";

describe("crypto utils", () => {
  it("generates a valid secp256k1 keypair", () => {
    const keypair = generateSecp256k1Keypair();
    expect(keypair.privateKey).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(keypair.publicKey).toMatch(/^0x[0-9a-fA-F]{66}$/);
  });

  it("derives did:key from known vector", () => {
    const publicKey = "0x02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71";
    const expectedDid = "did:key:zQ3shZtr1sUnrETvXPDa4gYSNE3gpJhdTkVmpYoWBuAiBsJ4G";
    expect(deriveDidKey(publicKey)).toBe(expectedDid);
    expect(deriveDidKey(publicKey.slice(2))).toBe(expectedDid);
  });

  it("validates private key format", () => {
    expect(validatePrivateKey("0x" + "a".repeat(64))).toBe(true);
    expect(validatePrivateKey("0x1234")).toBe(false);
  });
});
