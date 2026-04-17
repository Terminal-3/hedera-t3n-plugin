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

import {
  DID_T3N_REGEX,
  ETH_ADDRESS_REGEX,
  HEDERA_WALLET_REGEX,
  PRIVATE_KEY_REGEX,
  PUBLIC_KEY_REGEX,
} from "./identity-utils.js";

export {
  DID_T3N_REGEX,
  ETH_ADDRESS_REGEX,
  HEDERA_WALLET_REGEX,
  PRIVATE_KEY_REGEX,
  PUBLIC_KEY_REGEX,
};

/**
 * Returns true when value is a non-empty string after trimming.
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * Returns true when value is a plain JSON-like object.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Reads a trimmed non-empty string field from a record.
 */
export function readNonEmptyString(
  record: Record<string, unknown>,
  key: string
): string | undefined {
  const value = record[key];
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized === "" ? undefined : normalized;
}

/**
 * Reads a positive integer field from a record.
 */
export function readPositiveInteger(
  record: Record<string, unknown>,
  key: string
): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : undefined;
}

/**
 * Zod schema for validating AgentCardEndpoint.
 */
export const agentCardEndpointSchema = z.object({
  name: z.string().min(1),
  endpoint: z.string().min(1),
  version: z.string().min(1),
});

export type AgentCardEndpoint = z.infer<typeof agentCardEndpointSchema>;

/**
 * JWK shape accepted in agent-card verificationMethod entries.
 * secp256k1 keys (EC, x + y) are the default; Ed25519 (OKP, x only) is accepted
 * as a secondary algorithm.
 */
export const publicKeyJwkSchema = z
  .object({
    kty: z.enum(["EC", "OKP"]),
    crv: z.enum(["secp256k1", "Ed25519"]),
    x: z.string().min(1),
    y: z.string().min(1).optional(),
    alg: z.enum(["ES256K", "EdDSA"]).optional(),
    use: z.literal("sig").optional(),
    kid: z.string().min(1).optional(),
  })
  .passthrough()
  .superRefine((jwk, ctx) => {
    if (jwk.kty === "EC" && jwk.crv === "secp256k1" && !jwk.y) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "secp256k1 JWK requires 'y' coordinate.",
      });
    }
    if (jwk.kty === "OKP" && jwk.crv !== "Ed25519") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "OKP JWK only supports crv=Ed25519 here.",
      });
    }
    if (jwk.kty === "EC" && jwk.crv !== "secp256k1") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "EC JWK only supports crv=secp256k1 here.",
      });
    }
  });

export type PublicKeyJwk = z.infer<typeof publicKeyJwkSchema>;

/**
 * Zod schema for a single verificationMethod entry (W3C DID-Document shape,
 * restricted to JsonWebKey2020).
 */
export const verificationMethodSchema = z
  .object({
    id: z.string().min(1),
    type: z.literal("JsonWebKey2020"),
    controller: z.string().min(1),
    publicKeyJwk: publicKeyJwkSchema,
  })
  .strict();

export type VerificationMethod = z.infer<typeof verificationMethodSchema>;

/**
 * Zod schema for validating AgentCardRecord.
 *
 * INVARIANT: `verificationMethod` is optional during the M0–M2 migration window
 * and becomes required in M3 (see PLAN §Compatibility / Migration). When
 * present, every entry must validate.
 */
export const agentCardRecordSchema = z.object({
  type: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  endpoints: z.array(agentCardEndpointSchema).min(1),
  x402Support: z.boolean(),
  active: z.boolean(),
  supportedTrust: z.array(z.string()),
  verificationMethod: z.array(verificationMethodSchema).min(1).optional(),
  authentication: z.array(z.string().min(1)).optional(),
  assertionMethod: z.array(z.string().min(1)).optional(),
}).passthrough();

export type AgentCardRecord = z.infer<typeof agentCardRecordSchema>;

/**
 * Selects the verificationMethod entry that should be used to verify inbound
 * request signatures for a given DID. Prefers entries referenced from
 * `authentication`; falls back to the first `verificationMethod` entry.
 * Returns null when no key is published.
 */
export function selectAuthenticationKey(
  card: AgentCardRecord
): VerificationMethod | null {
  const methods = card.verificationMethod;
  if (!methods || methods.length === 0) {
    return null;
  }
  const auth = card.authentication;
  if (auth && auth.length > 0) {
    for (const ref of auth) {
      const match = methods.find((m) => m.id === ref);
      if (match) {
        return match;
      }
    }
  }
  return methods[0] ?? null;
}

/**
 * Zod schema for validating AgentRegistryRecord.
 */
export const agentRegistryRecordSchema = z.object({
  agent_uri: z.string().min(1),
  registered_at: z.number().int(),
  updated_at: z.number().int(),
  owner: z.string().regex(ETH_ADDRESS_REGEX),
});

export type AgentRegistryRecord = z.infer<typeof agentRegistryRecordSchema>;

/**
 * Zod schema for validating StoredCredentials structure.
 *
 * Validates all fields of stored credential files including version, timestamps,
 * DID formats, wallet addresses, and private keys. Used by the public auth-context /
 * private-data-processing workflows and other credential loading functions to ensure data integrity.
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
  did_t3n: z.string().regex(DID_T3N_REGEX),
  hedera_wallet: z.string().regex(HEDERA_WALLET_REGEX),
  network_tier: z.enum(["local", "testnet", "mainnet"]),
  private_key: z.string().regex(PRIVATE_KEY_REGEX),
  public_key: z.string().regex(PUBLIC_KEY_REGEX),
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
