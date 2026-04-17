/**
 * Purpose: CLI argument parsing for register-agent-erc8004
 * Scope:   Parses --env, --path, and --agent-uri arguments and resolves path/env precedence
 * Inputs:  Command-line argument arrays and environment variables
 * Outputs: Parsed registration arguments with deterministic precedence rules
 */

import type { NetworkTier } from "../createIdentity.js";
import { getIdentityEnvironment } from "../utils/env.js";
import {
  assertEnumFlagValue,
  buildUnexpectedPositionalArgError,
  buildUnknownFlagError,
  tryReadFlag,
} from "./arg-utils.js";

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

  for (let i = 0; i < argv.length; ) {
    const arg = argv[i];

    const envMatch = tryReadFlag(argv, i, "--env");
    if (envMatch) {
      networkTier = assertEnumFlagValue("--env", envMatch.value, NETWORK_TIERS);
      i += envMatch.consumedCount;
      continue;
    }

    const pathMatch = tryReadFlag(argv, i, "--path", "-p");
    if (pathMatch) {
      pathArg = pathMatch.value;
      i += pathMatch.consumedCount;
      continue;
    }

    const agentUriMatch = tryReadFlag(argv, i, "--agent-uri");
    if (agentUriMatch) {
      agentUriArg = agentUriMatch.value;
      i += agentUriMatch.consumedCount;
      continue;
    }

    if (arg.startsWith("-")) {
      throw buildUnknownFlagError(arg, REGISTER_AGENT_SUPPORTED_FLAGS);
    }

    throw buildUnexpectedPositionalArgError(arg, REGISTER_AGENT_SUPPORTED_FLAGS);
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
