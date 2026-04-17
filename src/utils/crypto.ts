/**
 * Purpose: Cryptographic utilities for secp256k1 keypair generation
 * Scope:   Keypair generation, key validation, DID fragment extraction
 * Inputs:  Private/public keys (hex strings), DID strings
 * Outputs: Keypair objects, validation booleans, DID fragments
 */

import { randomBytes } from "crypto";

import * as secp256k1 from "@noble/secp256k1";

export {
  deriveDidFragment,
  validatePrivateKey,
  validatePublicKey,
} from "./identity-utils.js";

export interface Keypair {
  privateKey: string; // 0x-prefixed hex
  publicKey: string; // 0x-prefixed hex (compressed)
}

/**
 * Generate a secp256k1 keypair using secure random bytes.
 */
export function generateSecp256k1Keypair(): Keypair {
  const privateKeyBytes = randomBytes(32);
  const publicKeyBytes = secp256k1.getPublicKey(privateKeyBytes, true);

  return {
    privateKey: `0x${Buffer.from(privateKeyBytes).toString("hex")}`,
    publicKey: `0x${Buffer.from(publicKeyBytes).toString("hex")}`,
  };
}
