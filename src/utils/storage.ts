/**
 * Purpose: Secure file system operations for agent identity credential storage
 * Scope:   Writes credentials to JSON files with restrictive permissions (600), handles
 *          directory creation, and provides existence checks for credential files
 * Inputs:  Credential objects, output paths/directories
 * Outputs: File paths where credentials were stored, boolean existence checks
 *
 * Security considerations:
 * - Files are created with mode 600 (read/write for owner only) to protect private keys
 * - Filenames are sanitized to prevent directory traversal and filesystem issues
 * - Credentials include version and timestamp metadata for future compatibility
 */

import { existsSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import { basename, dirname, join, resolve } from "path";

import { deriveDidFragment } from "./crypto.js";
import { type Environment } from "./environment.js";
import { ensureOwnerOnlyFilePermissions } from "./file-permissions.js";

export interface StoredCredentials {
  version: number;
  did_t3n: string;
  hedera_wallet: string;
  network_tier: Environment;
  private_key: string;
  public_key: string;
  created_at: string;
  agent_card_path?: string;
  agent_card_cid?: string;
  agent_card_gateway_url?: string;
  t3n_registration?: StoredT3nRegistrationMetadata;
  hedera_registration?: StoredHederaRegistrationMetadata;
  erc8004_last_verified_at?: string;
}

export interface StoredT3nRegistrationMetadata {
  tx_hash: string;
  agent_uri: string;
  runtime_agent_uri: string;
}

export interface StoredHederaRegistrationMetadata {
  tx_hash: string;
  agent_id: string;
  owner: string;
  token_uri: string;
  chain_id: number;
  identity_registry_address: string;
  network: Exclude<Environment, "local">;
}

export interface StoreOptions {
  outputDir?: string;
  outputPath?: string; // Full file path (takes precedence over outputDir)
}

const DEFAULT_OUTPUT = "output/identities";

/**
 * Sanitizes a DID fragment for use as a filesystem-safe filename.
 *
 * Handles did:t3n fragments (40-char hex Ethereum address fragments).
 *
 * Preserves alphanumeric characters, underscores, and hyphens. Removes all other
 * characters that could cause filesystem issues (e.g., path separators, special chars).
 * Falls back to "identity" if sanitization results in an empty string.
 *
 * @param fragment - DID fragment to sanitize
 * @returns Filesystem-safe filename fragment
 */
export function sanitizeFragmentForFilename(fragment: string): string {
  return fragment.replace(/[^a-zA-Z0-9_-]/g, "") || "identity";
}

/**
 * Normalizes an output path to an absolute filesystem path.
 *
 * Resolves relative paths against the current working directory and normalizes
 * any ".." or "." segments in the path.
 *
 * @param outputPath - Path to normalize (may be relative or absolute)
 * @returns Absolute normalized path
 */
export function normalizeOutputPath(outputPath: string): string {
  return resolve(outputPath);
}

/**
 * Stores agent identity credentials to disk with secure permissions.
 *
 * Creates the output directory if it doesn't exist and writes credentials as
 * formatted JSON. Attempts to set file permissions to 600 (owner read/write only)
 * to protect private keys. If permission setting fails (e.g., on Windows or
 * certain filesystems), logs a warning but continues to avoid breaking the operation.
 *
 * @param credentials - Credential data to store (version and created_at are auto-generated)
 * @param options - Storage options
 *   - outputPath: Explicit file path (takes precedence over outputDir)
 *   - outputDir: Directory for auto-generated filenames (defaults to "output/identities")
 * @returns Promise resolving to the absolute path where credentials were stored
 * @throws Error if file write fails or directory creation fails
 */
export async function storeCredentials(
  credentials: Omit<StoredCredentials, "version" | "created_at">,
  options: StoreOptions = {}
): Promise<string> {
  let filepath: string;

  // Explicit file path takes precedence over directory-based storage
  if (options.outputPath) {
    filepath = normalizeOutputPath(options.outputPath);
    // Ensure parent directory exists before writing
    const parentDir = dirname(filepath);
    if (!existsSync(parentDir)) {
      await mkdir(parentDir, { recursive: true });
    }
  } else {
    // Generate filename from DID fragment in specified or default directory
    const outputDir = options.outputDir || DEFAULT_OUTPUT;
    const resolvedOutput = resolve(outputDir);
    const didFragment = deriveDidFragment(credentials.did_t3n);
    const safeFragment = sanitizeFragmentForFilename(didFragment);
    const filename = `${safeFragment}.json`;
    filepath = join(resolvedOutput, filename);

    if (!existsSync(resolvedOutput)) {
      await mkdir(resolvedOutput, { recursive: true });
    }
  }

  const stored: StoredCredentials = {
    version: 1,
    created_at: new Date().toISOString(),
    ...credentials,
  };

  await writeFile(filepath, JSON.stringify(stored, null, 2), "utf8");

  // Attempt to set restrictive permissions (600 = owner read/write only)
  // This may fail on Windows or certain filesystems, so we catch and warn rather than fail
  await ensureOwnerOnlyFilePermissions(filepath);

  return filepath;
}

export async function writeIdentityConfigFile(
  filepath: string,
  data: Record<string, unknown>
): Promise<void> {
  await writeFile(filepath, JSON.stringify(data, null, 2), "utf8");
  await ensureOwnerOnlyFilePermissions(filepath);
}

/**
 * Checks if credentials file exists for a given DID fragment.
 *
 * Sanitizes the fragment and checks for the corresponding JSON file in the
 * specified output directory. Useful for checking if an identity already exists
 * before attempting to create a new one.
 *
 * @param didFragment - DID fragment to check (will be sanitized for filename matching)
 * @param outputDir - Directory to search in (defaults to "output/identities")
 * @returns True if credentials file exists, false otherwise
 */
export function credentialsExist(
  didFragment: string,
  outputDir: string = DEFAULT_OUTPUT
): boolean {
  const safeFragment = sanitizeFragmentForFilename(basename(didFragment));
  const filepath = join(resolve(outputDir), `${safeFragment}.json`);
  return existsSync(filepath);
}
