/**
 * Purpose: CLI argument parsing for register-agent-erc8004
 * Scope:   Parses --env, --path, and --agent-uri arguments and resolves path/env precedence
 * Inputs:  Command-line argument arrays and environment variables
 * Outputs: Parsed registration arguments with deterministic precedence rules
 */

import type { NetworkTier } from "../createIdentity.js";
import { getIdentityEnvironment } from "../utils/env.js";

const NETWORK_TIERS: Array<Exclude<NetworkTier, "local">> = ["testnet", "mainnet"];
const REGISTER_AGENT_SUPPORTED_FLAGS = "--env, --path/-p, --agent-uri";

export type RegisterAgentErc8004CliArgs = {
  networkTier: Exclude<NetworkTier, "local">;
  pathArg?: string;
  agentUriArg?: string;
};

export function parseRegisterAgentErc8004Args(
  argv: string[],
  env: NodeJS.ProcessEnv
): RegisterAgentErc8004CliArgs {
  let networkTier: Exclude<NetworkTier, "local"> =
    getIdentityEnvironment(env) === "mainnet" ? "mainnet" : "testnet";
  let pathArg: string | undefined;
  let agentUriArg: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith("--env=")) {
      const value = arg.slice("--env=".length).trim();
      if (!value) {
        throw new Error("Missing value for --env");
      }
      if (!NETWORK_TIERS.includes(value as (typeof NETWORK_TIERS)[number])) {
        throw new Error(
          `Invalid value for --env: "${value}". Supported values: ${NETWORK_TIERS.join(", ")}`
        );
      }
      networkTier = value as Exclude<NetworkTier, "local">;
      continue;
    }
    if (arg === "--env") {
      const next = argv[i + 1];
      if (!next || next.startsWith("-")) {
        throw new Error("Missing value for --env");
      }
      if (!NETWORK_TIERS.includes(next as (typeof NETWORK_TIERS)[number])) {
        throw new Error(
          `Invalid value for --env: "${next}". Supported values: ${NETWORK_TIERS.join(", ")}`
        );
      }
      networkTier = next as Exclude<NetworkTier, "local">;
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
    if (arg.startsWith("--agent-uri=")) {
      const value = arg.slice("--agent-uri=".length).trim();
      if (!value) {
        throw new Error("Missing value for --agent-uri");
      }
      agentUriArg = value;
      continue;
    }
    if (arg === "--agent-uri") {
      const next = argv[i + 1];
      if (!next || next.startsWith("-")) {
        throw new Error("Missing value for --agent-uri");
      }
      agentUriArg = next.trim();
      if (!agentUriArg) {
        throw new Error("Missing value for --agent-uri");
      }
      i += 1;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(
        `Unknown argument: "${arg}". Supported flags: ${REGISTER_AGENT_SUPPORTED_FLAGS}`
      );
    }

    throw new Error(
      `Unexpected positional argument: "${arg}". Supported flags: ${REGISTER_AGENT_SUPPORTED_FLAGS}`
    );
  }

  return { networkTier, pathArg, agentUriArg };
}

export function resolveRegistrationIdentityPath(
  pathArg: string | undefined,
  envPath: string | undefined
): string | undefined {
  const selected = pathArg && pathArg.trim() !== "" ? pathArg.trim() : envPath?.trim();
  return selected && selected !== "" ? selected : undefined;
}

export function resolveRegistrationAgentUri(
  agentUriArg: string | undefined
): string | undefined {
  const selected = agentUriArg?.trim();
  return selected && selected !== "" ? selected : undefined;
}
