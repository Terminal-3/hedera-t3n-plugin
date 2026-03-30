/**
 * Purpose: Core identity creation workflow for Hedera T3N plugin
 * Scope:   Orchestrates complete identity creation: keypair generation, DID derivation,
 *          deterministic T3N DID derivation, and credential storage
 * Inputs:  CreateIdentityOptions (network tier, output paths)
 * Outputs: CreateIdentityResult with all derived identifiers and storage path
 *
 * This module provides the primary entry point for creating agent identities in the
 * Hedera T3N ecosystem. It handles the full lifecycle from cryptographic key generation
 * to network registration and secure credential storage.
 *
 * The workflow ensures that all identifiers (did:key, did:t3n:a:, Hedera wallet) are
 * cryptographically linked before storage. Public registration remains an explicit
 * follow-up step handled by the registration workflow.
 */

import { generateSecp256k1Keypair, deriveDidKey } from "./utils/crypto.js";
import { deriveHederaAddress } from "./utils/hedera.js";
import { loadOrCreateAgentCard } from "./utils/agentCard.js";
import {
  deriveDeterministicT3nDid,
  getT3nEnvironmentLabel,
  resolveT3nBaseUrl,
  resolveT3nRuntimeApiUrl,
} from "./utils/t3n.js";
import { storeCredentials, type StoreOptions } from "./utils/storage.js";

import type { Environment } from "./utils/environment.js";

/** Public alias for backward compatibility. */
export type NetworkTier = Environment;

export interface CreateIdentityOptions {
  networkTier?: NetworkTier;
  outputPath?: string; // Optional custom file path (takes precedence over outputDir)
  outputDir?: string; // Optional custom output directory
  verifyRegistration?: boolean; // Optional override for CCF readback verification
}

export interface CreateIdentityResult {
  did_key: string;
  did_t3n: string;
  hedera_wallet: string;
  credentials_path: string;
  agent_card_path: string;
  networkTier: NetworkTier;
  t3n_api_base_url?: string;
  t3n_runtime_api_url?: string;
  agent_uri?: string;
  registration_tx_hash?: string;
}

function isLocalhostUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    const normalized = url.trim().toLowerCase();
    return (
      normalized.includes("localhost") ||
      normalized.includes("127.0.0.1") ||
      normalized.includes("[::1]")
    );
  }
}

function getT3nEndpointMode(
  networkTier: NetworkTier,
  t3nApiBaseUrl: string | undefined
): string {
  if (!t3nApiBaseUrl) {
    return networkTier === "local"
      ? "local/mock (no network call)"
      : "endpoint unavailable";
  }

  if (isLocalhostUrl(t3nApiBaseUrl)) {
    return networkTier === "local"
      ? "local CCF"
      : "local CCF override (Hedera remains non-local)";
  }

  if (networkTier === "testnet") {
    return "public staging";
  }
  if (networkTier === "mainnet") {
    return "public production";
  }

  return "custom remote endpoint";
}

/**
 * Converts CreateIdentityOptions to StoreOptions format.
 *
 * Prioritizes explicit file paths over directory-based storage to allow callers
 * full control over output location when needed.
 */
function buildStoreOptions(options: CreateIdentityOptions): StoreOptions {
  if (options.outputPath) {
    return { outputPath: options.outputPath };
  }
  if (options.outputDir) {
    return { outputDir: options.outputDir };
  }
  return {};
}

/**
 * Creates a new agent identity with deterministic T3N DID derivation.
 *
 * This function orchestrates the complete identity creation workflow:
 * 1. Generates a cryptographically secure secp256k1 keypair
 * 2. Derives did:key identifier from the public key (W3C DID standard)
 * 3. Derives Hedera-compatible wallet address from the private key
 * 4. Derives the did:t3n:a: / did:t3:a: identifier for the selected environment
 * 5. Stores all credentials securely to disk with restrictive permissions
 *
 * All identifiers are cryptographically linked: the same private key generates
 * all derived values, ensuring consistency across the identity system.
 *
 * @param options - Configuration options for identity creation
 *   - networkTier: Network environment (default: "testnet")
 *   - outputPath: Explicit file path for credentials (takes precedence)
 *   - outputDir: Directory for auto-generated credential files
 * @returns Promise resolving to identity result with all identifiers and storage path
 * @throws Error if credential storage fails
 */
export async function createIdentity(
  options: CreateIdentityOptions = {}
): Promise<CreateIdentityResult> {
  const networkTier = options.networkTier ?? "testnet";

  const keypair = generateSecp256k1Keypair();
  const didKey = deriveDidKey(keypair.publicKey);
  const hederaWallet = deriveHederaAddress(keypair.privateKey);

  const t3nApiBaseUrl = await resolveT3nBaseUrl(networkTier);
  const runtimeApiUrl = await resolveT3nRuntimeApiUrl(networkTier);
  const didT3n = deriveDeterministicT3nDid(hederaWallet, {
    networkTier,
    baseUrl: t3nApiBaseUrl,
  });

  const storeOptions = buildStoreOptions(options);

  const credentialsPath = await storeCredentials(
    {
      did_key: didKey,
      did_t3n: didT3n,
      hedera_wallet: hederaWallet,
      network_tier: networkTier,
      private_key: keypair.privateKey,
    },
    storeOptions
  );
  const { agentCardPath } = await loadOrCreateAgentCard({
    identityPath: credentialsPath,
    identity: {
      did_key: didKey,
      did_t3n: didT3n,
      hedera_wallet: hederaWallet,
    },
  });

  return {
    did_key: didKey,
    did_t3n: didT3n,
    hedera_wallet: hederaWallet,
    credentials_path: credentialsPath,
    agent_card_path: agentCardPath,
    networkTier,
    t3n_api_base_url: t3nApiBaseUrl,
    t3n_runtime_api_url: runtimeApiUrl,
  };
}

/**
 * Formats a human-readable success message for CLI and tool output.
 *
 * Produces a structured message containing all identity details with context-aware
 * notes. In local mode, clearly indicates that registration was mocked. In network
 * mode, includes the next-step command for explicit agent URI registration.
 *
 * @param result - The identity creation result to format
 * @returns Formatted multi-line message string suitable for console output
 */
export function formatCreateIdentityMessage(result: CreateIdentityResult): string {
  const {
    networkTier,
    did_key,
    did_t3n,
    hedera_wallet,
    credentials_path,
    agent_card_path,
    t3n_api_base_url,
    t3n_runtime_api_url,
    agent_uri,
    registration_tx_hash,
  } = result;
  const isLocal = networkTier === "local";
  const t3nEnvLabel = getT3nEnvironmentLabel(networkTier);
  const t3nEndpointMode = getT3nEndpointMode(networkTier, t3n_api_base_url);

  return [
    "Agent identity created successfully!",
    `Hedera network tier: ${networkTier}`,
    `T3N tier: ${t3nEnvLabel}`,
    `T3N endpoint mode: ${t3nEndpointMode}`,
    `T3N API URL: ${t3n_api_base_url ?? "(mock/no network call)"}`,
    `T3N runtime API URL: ${t3n_runtime_api_url ?? "(not configured)"}`,
    `did:key: ${did_key}`,
    `T3N Identity (did:t3n:a:): ${did_t3n}${
      isLocal
        ? ` (${t3nEnvLabel})`
        : registration_tx_hash
          ? ` (registered on T3N ${t3nEnvLabel})`
          : ` (derived for T3N ${t3nEnvLabel}; agent registration remains explicit)`
    }`,
    `Hedera wallet: ${hedera_wallet}`,
    agent_uri ? `Agent URI: ${agent_uri}` : undefined,
    registration_tx_hash ? `Registration tx hash: ${registration_tx_hash}` : undefined,
    `Credentials stored at: ${credentials_path}`,
    `Public agent card stored at: ${agent_card_path}`,
    "Next: run `hedera-t3n-plugin ipfs-submit-agent-card-pinata --jwt <PINATA_JWT>` " +
      "to upload the public agent card JSON to IPFS (Pinata).",
    "Repo-local alternative: `pnpm ipfs-submit-agent-card-pinata --jwt <PINATA_JWT>`.",
    "Alternatively: `hedera-t3n-plugin ipfs-submit-agent-card-pinata --api-key <PINATA_API_KEY> --api-secret <PINATA_API_SECRET>`.",
    isLocal
      ? "ERC-8004 registration is unavailable for HEDERA_NETWORK=local. Re-run create-identity with --env testnet or --env mainnet before calling `hedera-t3n-plugin register-agent-erc8004`."
      : "Then run `hedera-t3n-plugin register-agent-erc8004` after upload to register the same public agent URI in both T3N and Hedera, or pass `--agent-uri <uri>` explicitly.",
    isLocal ? "Note: Local/mock mode enabled – T3N registration was mocked." : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}
