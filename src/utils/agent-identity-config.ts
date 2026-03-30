/**
 * Purpose: Agent identity configuration file reading and validation
 * Scope:   Resolves config paths, reads JSON files, validates against StoredCredentials schema
 * Inputs:  File paths, unknown data objects
 * Outputs: AgentIdentityConfigResult with success/failure status and human-readable messages
 */

import { existsSync } from "fs";
import { readFile, stat } from "fs/promises";
import { resolve } from "path";

import { getAgentIdentityConfigPath } from "./env.js";
import { messageFromError } from "./tool-result.js";
import { validateStoredCredentials } from "./validation.js";

const CREATE_IDENTITY_HINT =
  "Please checkout the repository and use `pnpm create-identity` to create an identity configuration file.";
const CREATE_VALID_IDENTITY_HINT =
  "Please checkout the repository and use `pnpm create-identity` to create a valid identity configuration file.";

export type AgentIdentityConfigResult =
  | {
      ok: true;
      path: string;
      data?: unknown;
    }
  | {
      ok: false;
      error: string;
      humanMessage: string;
      path?: string;
      details?: string;
    };

export function resolveAgentIdentityConfigPath(): AgentIdentityConfigResult {
  const configPath = getAgentIdentityConfigPath();
  if (!configPath) {
    return {
      ok: false,
      error: "AGENT_IDENTITY_CONFIG_PATH not set",
      humanMessage: `Agent identity configuration path not set. ${CREATE_IDENTITY_HINT}`,
    };
  }

  return {
    ok: true,
    path: resolve(configPath),
  };
}

export async function readAgentIdentityConfig(
  resolvedPath: string
): Promise<AgentIdentityConfigResult> {
  if (!existsSync(resolvedPath)) {
    return {
      ok: false,
      error: "File not found",
      path: resolvedPath,
      humanMessage: `Agent identity configuration file not found at ${resolvedPath}. ${CREATE_IDENTITY_HINT}`,
    };
  }

  try {
    const stats = await stat(resolvedPath);
    if (!stats.isFile()) {
      return {
        ok: false,
        error: "Path is not a file",
        path: resolvedPath,
        humanMessage: `The path ${resolvedPath} exists but is not a file. ${CREATE_IDENTITY_HINT}`,
      };
    }
  } catch (error) {
    return {
      ok: false,
      error: "Cannot access file",
      path: resolvedPath,
      details: messageFromError(error),
      humanMessage: `Cannot access the file at ${resolvedPath}. ${CREATE_IDENTITY_HINT}`,
    };
  }

  let fileContent: string;
  try {
    fileContent = await readFile(resolvedPath, "utf8");
  } catch (error) {
    return {
      ok: false,
      error: "Cannot read file",
      path: resolvedPath,
      details: messageFromError(error),
      humanMessage: `Cannot read the file at ${resolvedPath}. ${CREATE_IDENTITY_HINT}`,
    };
  }

  try {
    const data: unknown = JSON.parse(fileContent);
    return {
      ok: true,
      path: resolvedPath,
      data,
    };
  } catch (error) {
    return {
      ok: false,
      error: "Invalid JSON",
      path: resolvedPath,
      details: messageFromError(error),
      humanMessage: `The file at ${resolvedPath} contains invalid JSON. ${CREATE_VALID_IDENTITY_HINT}`,
    };
  }
}

export function validateAgentIdentityConfig(
  data: unknown,
  resolvedPath: string
): AgentIdentityConfigResult {
  try {
    validateStoredCredentials(data);
  } catch (error) {
    return {
      ok: false,
      error: "Invalid identity configuration format",
      path: resolvedPath,
      details: messageFromError(error),
      humanMessage: `The file at ${resolvedPath} does not have a valid identity configuration format. ${CREATE_VALID_IDENTITY_HINT}`,
    };
  }

  return {
    ok: true,
    path: resolvedPath,
  };
}
