#!/usr/bin/env node

/**
 * Purpose: Package-level CLI dispatcher for the published hedera-t3n-plugin binary
 * Scope:   Routes subcommands to the existing command implementations
 * Inputs:  process.argv or provided argv array
 * Outputs: Command output or usage text
 */

import { runCreateIdentityCommand } from "./create-identity.js";
import { runInitCommand } from "./init.js";
import { runIpfsSubmitAgentCardPinataCommand } from "./ipfs-submit-agent-card-pinata.js";
import { runRegisterAgentErc8004Command } from "./register-agent-erc8004.js";
import { realpathSync } from "fs";
import { fileURLToPath } from "url";

function usage(): string {
  return [
    "Usage:",
    "  hedera-t3n-plugin init [--force]",
    "  hedera-t3n-plugin create-identity [--env <local|testnet|mainnet>] [--path <file-or-dir>]",
    "  hedera-t3n-plugin ipfs-submit-agent-card-pinata [--path <identity.json>] [--jwt <token> | --api-key <key> --api-secret <secret>]",
    "  hedera-t3n-plugin register-agent-erc8004 [--env <testnet|mainnet>] [--path <identity.json>] [--agent-uri <uri>]",
    "",
    "Notes:",
    "  - `init` creates `.env` and `.env.secret.pinata` in the current working directory from the packaged example templates.",
    "  - The other commands load `.env` from the current working directory.",
    "  - `ipfs-submit-agent-card-pinata` also loads `.env.secret.pinata` from the current working directory.",
    "  - --path targets the output file/directory for create-identity and the identity config JSON for the other commands.",
  ].join("\n");
}

export async function runCli(
  argv: string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  const [command, ...rest] = argv;

  if (!command || command === "--help" || command === "-h") {
    console.log(usage());
    return;
  }

  if (command === "create-identity") {
    await runCreateIdentityCommand(rest, env);
    return;
  }
  if (command === "init") {
    await runInitCommand(rest);
    return;
  }
  if (command === "ipfs-submit-agent-card-pinata") {
    await runIpfsSubmitAgentCardPinataCommand(rest, env);
    return;
  }
  if (command === "register-agent-erc8004") {
    await runRegisterAgentErc8004Command(rest, env);
    return;
  }

  throw new Error(`Unknown command: ${command}\n\n${usage()}`);
}

function isDirectExecutionEntry(): boolean {
  if (!process.argv[1]) {
    return false;
  }

  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isDirectExecutionEntry()) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
