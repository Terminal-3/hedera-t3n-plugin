/**
 * Purpose: Test helper for creating and cleaning up temporary files
 * Scope:   Generates unique temporary file paths, provides cleanup utilities
 * Inputs:  File prefix, optional extension
 * Outputs: Temporary file paths
 */

import { existsSync } from "fs";
import { unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

export function createTempFilePath(prefix: string, extension = ".json"): string {
  const token = Math.random().toString(16).slice(2);
  return join(tmpdir(), `${prefix}-${Date.now()}-${token}${extension}`);
}

export async function cleanupTempFile(path?: string): Promise<void> {
  if (!path || !existsSync(path)) {
    return;
  }

  try {
    await unlink(path);
  } catch {
    // Ignore cleanup errors.
  }
}
