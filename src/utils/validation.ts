/**
 * Purpose: Validation schemas and functions for agent identity configuration files
 * Scope:   Zod schemas for StoredCredentials validation, regex patterns for DID
 *          and wallet format validation, type-safe validation functions
 * Inputs:  Unknown data objects to validate against schemas
 * Outputs: Validated StoredCredentials objects or ZodError exceptions
 *
 * This module provides the validation layer for identity configuration files.
 * All regex patterns follow W3C DID specifications and Ethereum address standards.
 */

import { z } from "zod";

import type {
  StoredCredentials,
  StoredHederaRegistrationMetadata,
  StoredT3nRegistrationMetadata,
} from "./storage.js";

/**
 * Regex pattern for validating did:key format (W3C DID standard).
 *
 * Matches the base58btc alphabet used in did:key identifiers:
 * - Characters: 123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz
 * - Deliberately excludes 0, O, I, and l to avoid visual ambiguity
 * - The 'z' prefix indicates base58btc encoding in multicodec format
 *
 * This pattern ensures compatibility with W3C DID Core specification and
 * prevents common errors from ambiguous character usage.
 */
export const DID_KEY_REGEX = /^did:key:z[1-9A-HJ-NP-Za-km-z]+$/;
/**
 * Regex pattern for validating T3N agent DID format.
 *
 * Matches the currently observed agent DID formats:
 * - Canonical format: did:t3n:a:{suffix}
 * - Local CCF format: did:t3:a:{suffix}
 * - Suffix: hex characters and hyphens (e.g., UUID format: abc123-def-456)
 * - Case-insensitive hex matching for flexibility
 */
export const DID_T3N_REGEX = /^did:t3n?:a:[a-f0-9-]+$/i;

/**
 * Regex pattern for validating Hedera wallet addresses (Ethereum-compatible).
 *
 * Matches standard Ethereum address format: 0x followed by exactly 40 hex characters.
 * Case-insensitive to handle addresses in either case.
 */
export const HEDERA_WALLET_REGEX = /^0x[0-9a-f]{40}$/i;

/**
 * Regex pattern for validating private keys (secp256k1).
 *
 * Matches standard secp256k1 private key format: 0x followed by exactly 64 hex characters
 * (32 bytes). Case-insensitive for consistency with address validation.
 */
export const PRIVATE_KEY_REGEX = /^0x[0-9a-f]{64}$/i;

/**
 * Zod schema for validating StoredCredentials structure.
 *
 * Validates all fields of stored credential files including version, timestamps,
 * DID formats, wallet addresses, and private keys. Used by the HAS_AGENT_IDENTITY_CONFIG
 * tool and other credential loading functions to ensure data integrity.
 *
 * All string fields use regex validation to enforce format requirements.
 */
const storedT3nRegistrationMetadataSchema = z.object({
  tx_hash: z.string().min(1),
  agent_uri: z.string().min(1),
  runtime_agent_uri: z.string().min(1),
}) satisfies z.ZodType<StoredT3nRegistrationMetadata>;

const storedHederaRegistrationMetadataSchema = z.object({
  tx_hash: z.string().min(1),
  agent_id: z.string().min(1),
  owner: z.string().regex(HEDERA_WALLET_REGEX),
  token_uri: z.string().min(1),
  chain_id: z.number().int().positive(),
  identity_registry_address: z.string().regex(HEDERA_WALLET_REGEX),
  network: z.enum(["testnet", "mainnet"]),
}) satisfies z.ZodType<StoredHederaRegistrationMetadata>;

export const storedCredentialsSchema = z.object({
  version: z.number().int().positive(),
  created_at: z.string(),
  did_key: z.string().regex(DID_KEY_REGEX),
  did_t3n: z.string().regex(DID_T3N_REGEX),
  hedera_wallet: z.string().regex(HEDERA_WALLET_REGEX),
  network_tier: z.enum(["local", "testnet", "mainnet"]),
  private_key: z.string().regex(PRIVATE_KEY_REGEX),
  agent_card_path: z.string().min(1).optional(),
  agent_card_cid: z.string().min(1).optional(),
  agent_card_gateway_url: z.string().min(1).optional(),
  t3n_registration: storedT3nRegistrationMetadataSchema.optional(),
  hedera_registration: storedHederaRegistrationMetadataSchema.optional(),
  erc8004_last_verified_at: z.string().min(1).optional(),
}) satisfies z.ZodType<StoredCredentials>;

/**
 * Validates a parsed JSON object against the StoredCredentials schema.
 *
 * Performs full validation of all credential fields including format checks
 * for DIDs, wallet addresses, and private keys. Returns the validated object
 * with correct TypeScript types, or throws a ZodError with detailed validation
 * failure information.
 *
 * @param data - Unknown data object to validate (typically from JSON.parse)
 * @returns Validated StoredCredentials object with correct types
 * @throws ZodError if validation fails (includes field-level error details)
 */
export function validateStoredCredentials(data: unknown): StoredCredentials {
  return storedCredentialsSchema.parse(data);
}
