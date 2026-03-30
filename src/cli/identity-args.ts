/**
 * Purpose: CLI argument parsing and output target resolution for create-identity command
 * Scope:   Parses --env and --path arguments, resolves output targets, handles overwrite decisions
 * Inputs:  Command-line arguments array, process environment
 * Outputs: Parsed CLI args, resolved output targets, overwrite decisions
 * 
 * Validates --env argument values and throws descriptive errors for invalid or missing values.
 * Supported --env values: local, testnet, mainnet
 */

import type { NetworkTier } from "../createIdentity.js";
import { getIdentityEnvironment } from "../utils/env.js";
import { normalizeOutputPath } from "../utils/storage.js";

const NETWORK_TIERS: NetworkTier[] = ["local", "testnet", "mainnet"];

export type CreateIdentityCliArgs = {
  networkTier: NetworkTier;
  pathArg?: string;
};

export type OutputTarget =
  | { kind: "none" }
  | { kind: "file"; path: string }
  | { kind: "dir"; path: string };

export type OverwriteDecision =
  | { action: "proceed" }
  | { action: "prompt" }
  | { action: "fail"; message: string };

export function parseCreateIdentityArgs(
  argv: string[],
  env: NodeJS.ProcessEnv
): CreateIdentityCliArgs {
  let networkTier: NetworkTier = getIdentityEnvironment(env);
  let pathArg: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--env=")) {
      const value = arg.slice("--env=".length).trim();
      if (!value) {
        throw new Error("Missing value for --env");
      }
      if (!NETWORK_TIERS.includes(value as NetworkTier)) {
        throw new Error(
          `Invalid value for --env: "${value}". Supported values: ${NETWORK_TIERS.join(", ")}`
        );
      }
      networkTier = value as NetworkTier;
      continue;
    }
    if (arg === "--env") {
      const next = argv[i + 1];
      if (!next || next.startsWith("-")) {
        throw new Error("Missing value for --env");
      }
      if (!NETWORK_TIERS.includes(next as NetworkTier)) {
        throw new Error(
          `Invalid value for --env: "${next}". Supported values: ${NETWORK_TIERS.join(", ")}`
        );
      }
      networkTier = next as NetworkTier;
      i += 1;
      continue;
    }
    if (arg.startsWith("--path=")) {
      const value = arg.slice("--path=".length);
      if (!value) {
        throw new Error("Missing value for --path");
      }
      pathArg = value;
      continue;
    }
    if (arg === "--path" || arg === "-p") {
      const next = argv[i + 1];
      if (!next || next.startsWith("-")) {
        throw new Error("Missing value for --path");
      }
      pathArg = next;
      i += 1;
      continue;
    }
    if (arg.startsWith("--agent-uri=") || arg === "--agent-uri") {
      throw new Error(
        "--agent-uri is no longer supported by create-identity. " +
          "Run `pnpm register-agent-erc8004 --agent-uri <uri>` after identity creation."
      );
    }
  }

  return { networkTier, pathArg };
}

/**
 * Resolve output target from --path or AGENT_IDENTITY_CONFIG_PATH.
 * Both are fully trusted: they may point anywhere on the filesystem; no path containment is enforced.
 */
export function resolveOutputTarget(
  pathArg: string | undefined,
  envPath: string | undefined
): OutputTarget {
  const selected = pathArg && pathArg.trim() !== "" ? pathArg.trim() : envPath?.trim();
  if (!selected) {
    return { kind: "none" };
  }

  const normalized = normalizeOutputPath(selected);
  if (selected.toLowerCase().endsWith(".json")) {
    return { kind: "file", path: normalized };
  }

  return { kind: "dir", path: normalized };
}

export function getOverwriteDecision(params: {
  targetPath: string;
  fileExists: boolean;
  isTTY: boolean;
}): OverwriteDecision {
  const { targetPath, fileExists, isTTY } = params;
  if (!fileExists) {
    return { action: "proceed" };
  }
  if (!isTTY) {
    return {
      action: "fail",
      message: `File already exists at ${targetPath}. Refusing to overwrite in non-interactive environment.`,
    };
  }
  return { action: "prompt" };
}
