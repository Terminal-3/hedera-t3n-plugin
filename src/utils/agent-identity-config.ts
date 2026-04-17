/**
 * Purpose: Agent identity configuration file reading and validation
 * Scope:   Resolves config paths, reads JSON files, validates against StoredCredentials schema
 * Inputs:  File paths, unknown data objects
 * Outputs: AgentIdentityConfigResult with success/failure status and human-readable messages
 */

import { existsSync } from "fs";
import { readFile, stat } from "fs/promises";
import { resolve } from "path";

import { assertJsonObjectShape } from "./agentCard.js";
import { getAgentIdentityConfigPath } from "./env.js";
import { messageFromError } from "./tool-result.js";
import { validateStoredCredentials } from "./validation.js";

import type { StoredCredentials } from "./storage.js";

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

export function resolveAgentIdentityConfigPath(
  options?: { env?: NodeJS.ProcessEnv }
): AgentIdentityConfigResult {
  const configPath = getAgentIdentityConfigPath(options?.env);
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

export function resolveRequiredAgentIdentityConfigPath(options: {
  pathOverride?: string;
  env?: NodeJS.ProcessEnv;
  missingPathMessage: string;
}): string {
  const configuredPath =
    options.pathOverride && options.pathOverride.trim() !== ""
      ? options.pathOverride.trim()
      : getAgentIdentityConfigPath(options.env);

  if (!configuredPath) {
    throw new Error(options.missingPathMessage);
  }

  return resolve(configuredPath);
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

function assertJsonObject(
  data: unknown,
  resolvedPath: string,
  invalidObjectMessage?: string
): Record<string, unknown> {
  assertJsonObjectShape(
    data,
    invalidObjectMessage ?? `Identity configuration at ${resolvedPath} must be a JSON object.`
  );
  return data as Record<string, unknown>;
}

export async function loadAgentIdentityConfigObject(options: {
  resolvedPath: string;
  emptyFileMessage: string;
  invalidObjectMessage?: string;
}): Promise<Record<string, unknown>> {
  const readResult = await readAgentIdentityConfig(options.resolvedPath);
  if (!readResult.ok) {
    throw new Error(readResult.humanMessage);
  }
  if (readResult.data === undefined) {
    throw new Error(options.emptyFileMessage);
  }

  return assertJsonObject(
    readResult.data,
    options.resolvedPath,
    options.invalidObjectMessage
  );
}

export async function loadValidatedStoredCredentials(options: {
  resolvedPath: string;
  emptyFileMessage: string;
  invalidObjectMessage?: string;
  disallowLocalMessage?: string;
}): Promise<{
  path: string;
  data: Record<string, unknown>;
  credentials: StoredCredentials;
}> {
  const data = await loadAgentIdentityConfigObject({
    resolvedPath: options.resolvedPath,
    emptyFileMessage: options.emptyFileMessage,
    invalidObjectMessage: options.invalidObjectMessage,
  });

  const validateResult = validateAgentIdentityConfig(data, options.resolvedPath);
  if (!validateResult.ok) {
    throw new Error(validateResult.humanMessage);
  }

  const credentials = validateStoredCredentials(data);
  if (credentials.network_tier === "local" && options.disallowLocalMessage) {
    throw new Error(options.disallowLocalMessage);
  }

  return {
    path: options.resolvedPath,
    data,
    credentials,
  };
}

/**
 * Resolves, loads, and validates the current agent identity configuration.
 *
 * Use this helper when callers want a single throw-on-failure path that returns the
 * resolved file path, raw JSON object, and validated stored credentials together.
 */
export async function loadIdentityOrThrow(options: {
  pathOverride?: string;
  env?: NodeJS.ProcessEnv;
  missingPathMessage?: string;
  emptyFileMessage?: string;
  invalidObjectMessage?: string;
  disallowLocalMessage?: string;
} = {}): Promise<{
  path: string;
  data: Record<string, unknown>;
  credentials: StoredCredentials;
}> {
  const path = resolveRequiredAgentIdentityConfigPath({
    pathOverride: options.pathOverride,
    env: options.env,
    missingPathMessage:
      options.missingPathMessage ??
      `Agent identity configuration path not set. ${CREATE_IDENTITY_HINT}`,
  });

  return loadValidatedStoredCredentials({
    resolvedPath: path,
    emptyFileMessage:
      options.emptyFileMessage ??
      `Identity configuration at ${path} is empty. Run \`pnpm create-identity\` first.`,
    invalidObjectMessage: options.invalidObjectMessage,
    disallowLocalMessage: options.disallowLocalMessage,
  });
}
