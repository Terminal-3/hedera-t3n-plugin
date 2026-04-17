/**
 * Purpose: Derive a secp256k1 JWK directly from a compressed public key.
 * Scope:   Used by agent-card generation to publish `verificationMethod.publicKeyJwk`.
 * Inputs:  0x-prefixed compressed secp256k1 public key (33 bytes / 66 hex chars).
 * Outputs: JWK with `kty: "EC"`, `crv: "secp256k1"`, `x`, `y`, `alg: "ES256K"`, `use: "sig"`.
 */

import { SigningKey, getBytes, hexlify } from "ethers";

import type { PublicKeyJwk } from "./validation.js";

export function jwkFromSecp256k1PublicKey(publicKey: string): PublicKeyJwk {
  const hex = publicKey.startsWith("0x") ? publicKey : `0x${publicKey}`;
  const compressed = getBytes(hex);
  if (compressed.length !== 33) {
    throw new Error(
      `secp256k1 public key must be 33-byte compressed, got ${compressed.length}`
    );
  }

  const uncompressedHex = SigningKey.computePublicKey(hexlify(compressed), false);
  const uncompressed = getBytes(uncompressedHex);
  if (uncompressed.length !== 65 || uncompressed[0] !== 0x04) {
    throw new Error("unexpected uncompressed secp256k1 public key shape");
  }

  return {
    kty: "EC",
    crv: "secp256k1",
    x: base64UrlEncode(uncompressed.slice(1, 33)),
    y: base64UrlEncode(uncompressed.slice(33, 65)),
    alg: "ES256K",
    use: "sig",
  };
}

function base64UrlEncode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}
