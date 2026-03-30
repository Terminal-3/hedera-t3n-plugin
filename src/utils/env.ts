/**
 * Purpose: Centralized environment variable management for Hedera T3N plugin
 * Scope:   Provides type-safe accessors for plugin configuration, handles dotenv
 *          loading with env key preservation, and maps network tiers to T3N environments
 * Inputs:  process.env, optional NodeJS.ProcessEnv for testing
 * Outputs: Typed network values, environment detection flags, config paths
 *
 * This module serves as the single source of truth for environment configuration.
 * It handles the complexity of preserving environment variables that may be set
 * before dotenv.config() runs (e.g., by test scripts or CI/CD systems).
 *
 * Network tier mapping:
 * - "local" → local mode (mock by default, or live local CCF when enabled)
 * - "testnet" → T3N staging environment (default)
 * - "mainnet" → T3N production environment
 *
 * See .env.example for complete list of supported environment variables.
 */

import dotenv from "dotenv";

/**
 * Environment variable keys that should be preserved across dotenv.config() calls.
 *
 * These keys may be set by test scripts, CI/CD systems, or other tooling before
 * dotenv loads values from .env files. Preserving them ensures that explicit
 * runtime configuration takes precedence over file-based defaults.
 */
export const PRESERVED_ENV_KEYS = [
  "HEDERA_NETWORK",
  "HEDERA_IDENTITY_REGISTRY_ADDRESS",
  "HEDERA_IDENTITY_REGISTRY_ADDRES",
  "T3N_LOCAL_BACKEND",
  "T3N_API_URL",
  "T3N_RUNTIME_API_URL",
  "T3N_AGENT_REGISTRY_SCRIPT_VERSION",
  "T3N_USER_SCRIPT_VERSION",
  "T3N_ML_KEM_PUBLIC_KEY",
  "T3N_ML_KEM_PUBLIC_KEY_FILE",
] as const;

/**
 * Captures current environment variable values before dotenv.config() runs.
 *
 * Creates a snapshot of specified env keys so they can be restored after dotenv
 * potentially overwrites them. Used to preserve runtime configuration that should
 * take precedence over .env file values.
 *
 * @param keys - Array of environment variable keys to capture (defaults to PRESERVED_ENV_KEYS)
 * @returns Snapshot object mapping keys to their current values (undefined if unset)
 */
export function capturePreservedEnvKeys(
  keys: readonly string[] = PRESERVED_ENV_KEYS
): Record<string, string | undefined> {
  const snapshot: Record<string, string | undefined> = {};
  for (const key of keys) {
    snapshot[key] = process.env[key];
  }
  return snapshot;
}

/**
 * Restores environment variables from a snapshot created by capturePreservedEnvKeys.
 *
 * Only restores keys that were explicitly captured with defined values. Undefined
 * snapshot values are skipped so dotenv-loaded values can remain available when
 * no explicit runtime override existed.
 *
 * @param snapshot - Snapshot object returned by capturePreservedEnvKeys
 */
export function restorePreservedEnvKeys(snapshot: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value !== undefined) {
      process.env[key] = value;
    }
  }
}

/**
 * Creates a restore function to preserve env keys across dotenv.config().
 *
 * Convenience wrapper that captures env keys and returns a function to restore them.
 * Use this pattern when you need to preserve runtime configuration across dotenv loading.
 *
 * @example
 * const restore = preserveEnvKeysBeforeDotenv();
 * dotenv.config();
 * restore(); // Restores preserved keys
 *
 * @param keys - Array of environment variable keys to preserve (defaults to PRESERVED_ENV_KEYS)
 * @returns Function to call after dotenv.config() to restore preserved keys
 */
export function preserveEnvKeysBeforeDotenv(
  keys: readonly string[] = PRESERVED_ENV_KEYS
): () => void {
  const snapshot = capturePreservedEnvKeys(keys);
  return () => restorePreservedEnvKeys(snapshot);
}

/**
 * Loads .env file while preserving specified environment variables.
 *
 * Wraps the preserve → dotenv.config → restore pattern in a single call.
 * This ensures that runtime-set environment variables (e.g., from test scripts)
 * are not overwritten by .env file values.
 *
 * @example
 * loadDotenvSafe(); // Uses dotenv defaults (searches for .env in current directory)
 * loadDotenvSafe({ path: resolve(process.cwd(), '.env') }); // Explicit path
 *
 * @param options - Optional dotenv configuration options (path, encoding, etc.)
 */
export function loadDotenvSafe(options?: dotenv.DotenvConfigOptions): void {
  const restorePreserved = preserveEnvKeysBeforeDotenv();
  dotenv.config(options);
  restorePreserved();
}

const HEDERA_NETWORKS = ["local", "testnet", "mainnet"] as const;
export type HederaNetwork = (typeof HEDERA_NETWORKS)[number];

/**
 * Gets the raw HEDERA_NETWORK value from environment, if valid.
 *
 * Returns undefined if the variable is unset or contains an invalid value.
 * Use this when you need to distinguish between "unset" and "testnet" (default).
 *
 * @param env - Optional environment object (defaults to process.env)
 * @returns Valid network tier or undefined if unset/invalid
 */
export function getHederaNetworkExplicit(
  env?: NodeJS.ProcessEnv
): HederaNetwork | undefined {
  const v = (env ?? process.env).HEDERA_NETWORK?.toLowerCase();
  if (v && HEDERA_NETWORKS.includes(v as HederaNetwork)) {
    return v as HederaNetwork;
  }
  return undefined;
}

/**
 * Gets the Hedera network tier from environment, defaulting to "testnet".
 *
 * This is the single source of truth for network configuration. Always returns
 * a valid network tier, never undefined. Use getHederaNetworkExplicit() if you
 * need to detect when the value is explicitly unset.
 *
 * @param env - Optional environment object (defaults to process.env)
 * @returns Network tier ("local" | "testnet" | "mainnet"), defaults to "testnet"
 */
export function getHederaNetwork(env?: NodeJS.ProcessEnv): HederaNetwork {
  return getHederaNetworkExplicit(env) ?? "testnet";
}

/**
 * Checks if the plugin is running in local mode.
 *
 * Local mode defaults to mocked T3N behavior, but callers may opt into a live
 * local CCF backend via T3N_LOCAL_BACKEND=ccf.
 *
 * @param env - Optional environment object (defaults to process.env)
 * @returns True if HEDERA_NETWORK is set to "local"
 */
export function isT3nLocal(env?: NodeJS.ProcessEnv): boolean {
  return getHederaNetwork(env) === "local";
}

export type T3nLocalBackend = "mock" | "ccf";

export function getT3nLocalBackend(env?: NodeJS.ProcessEnv): T3nLocalBackend {
  const value = (env ?? process.env).T3N_LOCAL_BACKEND?.trim().toLowerCase();
  if (value === "ccf") return "ccf";
  return "mock";
}

export function shouldUseLiveLocalT3nBackend(env?: NodeJS.ProcessEnv): boolean {
  return isT3nLocal(env) && getT3nLocalBackend(env) === "ccf";
}

export function getT3nApiUrlOverride(env?: NodeJS.ProcessEnv): string | undefined {
  const value = (env ?? process.env).T3N_API_URL?.trim();
  return value === "" ? undefined : value;
}

export function getT3nRuntimeApiUrlOverride(
  env?: NodeJS.ProcessEnv
): string | undefined {
  const value = (env ?? process.env).T3N_RUNTIME_API_URL?.trim();
  return value === "" ? undefined : value;
}

export function getT3nMlKemPublicKeyOverride(
  env?: NodeJS.ProcessEnv
): string | undefined {
  const value = (env ?? process.env).T3N_ML_KEM_PUBLIC_KEY?.trim();
  return value === "" ? undefined : value;
}

export function getT3nMlKemPublicKeyFileOverride(
  env?: NodeJS.ProcessEnv
): string | undefined {
  const value = (env ?? process.env).T3N_ML_KEM_PUBLIC_KEY_FILE?.trim();
  return value === "" ? undefined : value;
}

/**
 * Legacy type alias for API compatibility.
 *
 * @deprecated Use HederaNetwork type directly. This alias is maintained for
 * backward compatibility with existing code.
 */
export type IdentityEnvironment = HederaNetwork;

/**
 * Gets the identity environment, derived from HEDERA_NETWORK.
 *
 * This function exists for API compatibility. It returns the same value as
 * getHederaNetwork() but uses the IdentityEnvironment type alias.
 *
 * @param env - Optional environment object (defaults to process.env)
 * @returns Identity environment ("local" | "testnet" | "mainnet"), defaults to "testnet"
 */
export function getIdentityEnvironment(env?: NodeJS.ProcessEnv): IdentityEnvironment {
  return getHederaNetwork(env);
}

/**
 * Gets the path to the agent identity configuration file.
 *
 * Returns undefined if the variable is unset or contains only whitespace.
 * Empty strings are normalized to undefined to handle edge cases where
 * environment variables may be set to empty values.
 *
 * @param env - Optional environment object (defaults to process.env)
 * @returns Config file path or undefined if unset/empty
 */
export function getAgentIdentityConfigPath(env?: NodeJS.ProcessEnv): string | undefined {
  const v = (env ?? process.env).AGENT_IDENTITY_CONFIG_PATH?.trim();
  return v === "" ? undefined : v;
}

/**
 * Gets the Hedera operator account ID from environment.
 *
 * Used for Hedera on-chain operations that should be funded/signed by the
 * configured operator wallet rather than the generated agent identity key.
 *
 * @param env - Optional environment object (defaults to process.env)
 * @returns Account ID or undefined if unset/empty
 */
export function getHederaAccountId(env?: NodeJS.ProcessEnv): string | undefined {
  const v = (env ?? process.env).HEDERA_ACCOUNT_ID?.trim();
  return v === "" ? undefined : v;
}

/**
 * Gets the Hedera operator private key from environment.
 *
 * @param env - Optional environment object (defaults to process.env)
 * @returns Private key or undefined if unset/empty
 */
export function getHederaPrivateKey(env?: NodeJS.ProcessEnv): string | undefined {
  const v = (env ?? process.env).HEDERA_PRIVATE_KEY?.trim();
  return v === "" ? undefined : v;
}

/**
 * Gets the Hedera ERC-8004 IdentityRegistry address from environment.
 *
 * Canonical key: HEDERA_IDENTITY_REGISTRY_ADDRESS
 * Backward-compatible alias: HEDERA_IDENTITY_REGISTRY_ADDRES
 *
 * @param env - Optional environment object (defaults to process.env)
 * @returns Contract address or undefined if unset/empty
 */
export function getHederaIdentityRegistryAddress(
  env?: NodeJS.ProcessEnv
): string | undefined {
  const source = env ?? process.env;
  const v =
    source.HEDERA_IDENTITY_REGISTRY_ADDRESS?.trim() ??
    source.HEDERA_IDENTITY_REGISTRY_ADDRES?.trim();
  return v === "" ? undefined : v;
}

/**
 * Detects if the code is running in a test environment.
 *
 * Checks for standard test environment indicators (NODE_ENV=test or VITEST variable).
 * Used to adjust behavior like timeout values for faster test execution.
 *
 * @param env - Optional environment object (defaults to process.env)
 * @returns True if running in a test environment
 */
export function isTestEnvironment(env?: NodeJS.ProcessEnv): boolean {
  const e = env ?? process.env;
  return e.NODE_ENV === "test" || e.VITEST !== undefined;
}
