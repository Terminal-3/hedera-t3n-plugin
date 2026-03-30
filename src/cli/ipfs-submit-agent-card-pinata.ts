/**
 * Purpose: CLI entrypoint for uploading a public agent card JSON to Pinata IPFS
 * Scope:   Resolves identity config path, generates or loads agent_card.json, uploads public JSON, persists CID bookkeeping
 * Inputs:  Pinata auth args or env config, AGENT_IDENTITY_CONFIG_PATH env var
 * Outputs: Prints CID and updates the local identity JSON with agent card metadata
 */

import path from "path";
import { pathToFileURL } from "url";

import { submitAgentCardToPinata } from "../submitAgentCardPinata.js";
import { loadDotenvSafe } from "../utils/env.js";
import { parseIpfsSubmitAgentCardPinataArgs } from "./ipfs-submit-agent-card-pinata-args.js";

export async function runIpfsSubmitAgentCardPinataCommand(
  argv: string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  loadDotenvSafe();
  loadDotenvSafe({ path: path.resolve(process.cwd(), ".env.secret.pinata") });

  const cliAuth = parseIpfsSubmitAgentCardPinataArgs(argv);
  const result = await submitAgentCardToPinata({
    identityConfigPath: cliAuth.pathArg,
    jwt: cliAuth.jwt,
    apiKey: cliAuth.apiKey,
    apiSecret: cliAuth.apiSecret,
    env,
  });

  console.log(`Pinata upload complete. CID: ${result.cid}`);
  console.log(`Pinata gateway URL: ${result.gatewayUrl}`);
  console.log(`Pinata upload filename: ${result.uploadFilename}`);
  console.log(`Uploaded agent card: ${result.agentCardPath}`);
  if (result.created) {
    console.log("Generated new public agent card from the local identity file.");
  }
}

export async function main(): Promise<void> {
  await runIpfsSubmitAgentCardPinataCommand();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("Failed to upload agent identity JSON to Pinata", error);
    process.exit(1);
  });
}
