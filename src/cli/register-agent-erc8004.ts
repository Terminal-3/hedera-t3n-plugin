/**
 * Purpose: CLI entrypoint for register-agent-erc8004
 * Scope:   Resolves identity + URI inputs and executes ERC-8004 registration
 * Inputs:  Command-line args and environment variables
 * Outputs: Registration result and verification summary
 */

import {
  formatRegisterAgentErc8004Message,
  registerAgentErc8004,
} from "../registerAgentErc8004.js";
import { pathToFileURL } from "url";
import {
  getAgentIdentityConfigPath,
  loadDotenvSafe,
} from "../utils/env.js";
import {
  parseRegisterAgentErc8004Args,
  resolveRegistrationIdentityPath,
} from "./register-agent-erc8004-args.js";
export async function runRegisterAgentErc8004Command(
  argv: string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  loadDotenvSafe();

  const { networkTier, pathArg, agentUriArg } = parseRegisterAgentErc8004Args(
    argv,
    env
  );

  const identityConfigPath = resolveRegistrationIdentityPath(
    pathArg,
    getAgentIdentityConfigPath(env)
  );

  const result = await registerAgentErc8004({
    networkTier,
    identityConfigPath,
    agentUri: agentUriArg,
    env,
  });

  console.log(formatRegisterAgentErc8004Message(result));
}

export async function main(): Promise<void> {
  await runRegisterAgentErc8004Command();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("Failed to register agent ERC-8004", error);
    process.exit(1);
  });
}
