/**
 * Purpose: Test helper for creating and cleaning up temporary identity files
 * Scope:   Creates test identity files for e2e tests, provides cleanup utilities
 * Inputs:  Optional file paths
 * Outputs: Temporary identity file paths
 */

import { rm } from "fs/promises";
import { tmpdir } from "os";
import { dirname, join } from "path";

import { createIdentity } from "../../../src/createIdentity.js";
import { resolveT3nBaseUrl } from "../../../src/utils/t3n.js";
import { cleanupTempFile } from "../../helpers/temp-files.js";

import { waitForT3nApiReady } from "./wait-t3n-api-ready.js";

const CREATE_IDENTITY_MAX_ATTEMPTS = 3;
const CREATE_IDENTITY_RETRY_BASE_DELAY_MS = 400;
const LOCAL_CCF_TRANSIENT_ERROR_MARKERS = [
  "object not found",
  "not leader",
  "leader is unknown",
  "raft",
  "unavailable",
] as const;

export function createTempIdentityPath(prefix = "e2e-agent-identity"): string {
  const token = Math.random().toString(16).slice(2);
  const dir = join(tmpdir(), `${prefix}-${Date.now()}-${token}`);
  return join(dir, "agent_identity.json");
}

function isRetriableCreateIdentityError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  return (
    LOCAL_CCF_TRANSIENT_ERROR_MARKERS.some((marker) => message.includes(marker)) ||
    message.includes("http 5") ||
    message.includes("internal error") ||
    message.includes("bad gateway") ||
    message.includes("gateway timeout") ||
    message.includes("service unavailable") ||
    message.includes("timed out") ||
    message.includes("timeout") ||
    message.includes("network error") ||
    message.includes("decaps failed")
  );
}

function waitForRetry(attempt: number): Promise<void> {
  const delayMs = attempt * CREATE_IDENTITY_RETRY_BASE_DELAY_MS;
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

export async function createTestIdentityFile(path?: string): Promise<string> {
  const outputPath = path ?? createTempIdentityPath();
  let lastError: unknown;

  for (let attempt = 1; attempt <= CREATE_IDENTITY_MAX_ATTEMPTS; attempt += 1) {
    try {
      if (attempt === 1) {
        const t3nBaseUrl = await resolveT3nBaseUrl("testnet");
        await waitForT3nApiReady(t3nBaseUrl);
      }
      await createIdentity({
        networkTier: "testnet",
        outputPath,
      });
      return outputPath;
    } catch (error) {
      lastError = error;
      const shouldRetry =
        attempt < CREATE_IDENTITY_MAX_ATTEMPTS && isRetriableCreateIdentityError(error);
      if (shouldRetry) {
        await waitForRetry(attempt);
        continue;
      }
      throw error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Failed to create test identity file after retry attempts.");
}

export async function cleanupIdentityFile(path?: string): Promise<void> {
  if (!path) {
    return;
  }

  const parentDir = dirname(path);
  try {
    await rm(parentDir, { recursive: true, force: true });
  } catch {
    await cleanupTempFile(path);
  }
}
