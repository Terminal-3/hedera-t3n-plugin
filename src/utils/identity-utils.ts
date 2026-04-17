/**
 * Purpose: Centralized identity identifier logic for Hedera T3N plugin
 * Scope:   DIDs (did:t3n), Ethereum/Hedera addresses, and private/public key validation
 */

import { Wallet } from "ethers";

/**
 * Regex pattern for validating T3N agent DID format.
 */
export const DID_T3N_REGEX = /^did:t3n:[a-f0-9]{40}$/i;

/**
 * Regex pattern for validating Hedera wallet addresses (Ethereum-compatible).
 */
export const HEDERA_WALLET_REGEX = /^0x[0-9a-f]{40}$/i;

/**
 * Regex pattern for validating Ethereum addresses (0x followed by 40 hex chars).
 */
export const ETH_ADDRESS_REGEX = /^0x[0-9a-f]{40}$/i;

/**
 * Regex pattern for validating private keys (secp256k1).
 */
export const PRIVATE_KEY_REGEX = /^0x[0-9a-f]{64}$/i;

/**
 * Regex pattern for validating compressed secp256k1 public keys.
 */
export const PUBLIC_KEY_REGEX = /^0x[0-9a-f]{66}$/i;

/**
 * Normalizes Ethereum address hex (40 chars without 0x prefix).
 */
export function normalizeEthAddressHex(address: string): string {
  const normalized = address.trim().toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{40}$/.test(normalized)) {
    throw new Error(`Invalid Ethereum address for derivation: ${address}`);
  }
  return normalized;
}

export function deriveDidFragment(did: string): string {
  const parts = did.split(":");
  return parts[parts.length - 1];
}

export function deriveHederaAddress(privateKey: string): string {
  const wallet = new Wallet(privateKey);
  return wallet.address.toLowerCase();
}

export function validateHederaAddress(address: string): boolean {
  return HEDERA_WALLET_REGEX.test(address);
}

export function extractEthHexFromDid(did: string): string | null {
  const normalizedDid = did.trim().toLowerCase();
  const patterns = [
    /^did:t3n:([0-9a-f]{40})$/,
    /^did:t3n:a:([0-9a-f]{40})$/,
    /^did:t3:a:([0-9a-f]{40})$/,
    /^did:t3:([0-9a-f]{40})$/,
    /^did:t3:did:t3n:([0-9a-f]{40})$/,
    /^a:([0-9a-f]{40})$/,
  ] as const;

  for (const pattern of patterns) {
    const match = normalizedDid.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

export function normalizeT3nDid(did: string): string {
  const suffix = extractEthHexFromDid(did);
  if (!suffix) {
    return did.trim();
  }
  return `did:t3n:${suffix}`;
}

export function deriveDeterministicT3nDid(address: string): string {
  const suffix = normalizeEthAddressHex(address);
  return `did:t3n:${suffix}`;
}

export function validatePrivateKey(privateKey: string): boolean {
  return PRIVATE_KEY_REGEX.test(privateKey);
}

export function validatePublicKey(publicKey: string): boolean {
  const hex = publicKey.startsWith("0x") ? publicKey.slice(2) : publicKey;
  return /^[0-9a-fA-F]{66}$/.test(hex);
}
