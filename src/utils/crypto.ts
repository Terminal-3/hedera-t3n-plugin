/**
 * Purpose: Cryptographic utilities for secp256k1 keypair generation and DID key derivation
 * Scope:   Keypair generation, did:key derivation, key validation, DID fragment extraction
 * Inputs:  Private/public keys (hex strings), DID strings
 * Outputs: Keypair objects, did:key strings, validation booleans, DID fragments
 */

import { randomBytes } from "crypto";

import * as secp256k1 from "@noble/secp256k1";
import bs58 from "bs58";

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

/**
 * Derive did:key from a compressed secp256k1 public key (0x-prefixed hex).
 * Multicodec prefix for secp256k1 public key is 0xe7 (varint encoded as e7 01).
 */
export function deriveDidKey(publicKey: string): string {
  const pubKeyHex = publicKey.startsWith("0x") ? publicKey.slice(2) : publicKey;
  if (pubKeyHex.length !== 66) {
    throw new Error("Public key must be compressed secp256k1 (33 bytes, 66 hex chars)");
  }

  const multicodecPrefix = Buffer.from([0xe7, 0x01]);
  const pubKeyBuffer = Buffer.from(pubKeyHex, "hex");
  const multicodecKey = Buffer.concat([multicodecPrefix, pubKeyBuffer]);

  const base58Key = bs58.encode(multicodecKey);
  return `did:key:z${base58Key}`;
}

export function validatePrivateKey(privateKey: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(privateKey);
}

export function validatePublicKey(publicKey: string): boolean {
  const hex = publicKey.startsWith("0x") ? publicKey.slice(2) : publicKey;
  return /^[0-9a-fA-F]{66}$/.test(hex);
}

export function deriveDidFragment(did: string): string {
  const parts = did.split(":");
  return parts[parts.length - 1];
}
