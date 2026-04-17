/**
 * Purpose: Unit tests for cryptographic utility functions
 * Scope:   Tests keypair generation and key validation
 * Inputs:  Test keys and keypairs
 * Outputs: Test assertions for crypto operations
 */

import { describe, expect, it } from "vitest";

import { generateSecp256k1Keypair, validatePrivateKey } from "../../src/utils/crypto";
import { jwkFromSecp256k1PublicKey } from "../../src/utils/jwk.js";

describe("crypto utils", () => {
  it("generates a valid secp256k1 keypair", () => {
    const keypair = generateSecp256k1Keypair();
    expect(keypair.privateKey).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(keypair.publicKey).toMatch(/^0x[0-9a-fA-F]{66}$/);
  });

  it("validates private key format", () => {
    expect(validatePrivateKey("0x" + "a".repeat(64))).toBe(true);
    expect(validatePrivateKey("0x1234")).toBe(false);
  });

  it("derives secp256k1 JWK from a known compressed public key", () => {
    const publicKey = "0x02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71";
    const jwk = jwkFromSecp256k1PublicKey(publicKey);
    expect(jwk.kty).toBe("EC");
    expect(jwk.crv).toBe("secp256k1");
    expect(jwk.alg).toBe("ES256K");
    expect(jwk.use).toBe("sig");
    expect(typeof jwk.x).toBe("string");
    expect(typeof jwk.y).toBe("string");
    // x coordinate is the 32 bytes immediately after the 0x02 sign byte
    expect(Buffer.from(jwk.x, "base64url").toString("hex")).toBe(
      "b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71"
    );
  });

  it("rejects non-33-byte public keys", () => {
    expect(() => jwkFromSecp256k1PublicKey("0x1234")).toThrow();
  });
});
