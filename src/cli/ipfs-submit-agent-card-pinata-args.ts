/**
 * Purpose: CLI argument parsing for ipfs-submit-agent-card-pinata
 * Scope:   Parses --api-key argument
 * Inputs:  Command-line argument arrays
 * Outputs: Parsed arguments for Pinata upload
 */

import {
  buildUnexpectedPositionalArgError,
  buildUnknownFlagError,
  tryReadFlag,
} from "./arg-utils.js";

export type IpfsSubmitAgentCardPinataArgs = {
  jwt?: string;
  apiKey?: string;
  apiSecret?: string;
  pathArg?: string;
};
const PINATA_SUPPORTED_FLAGS = "--path/-p, --jwt, --api-key, --api-secret";

export function parseIpfsSubmitAgentCardPinataArgs(
  argv: string[]
): IpfsSubmitAgentCardPinataArgs {
  let jwt: string | undefined;
  let apiKey: string | undefined;
  let apiSecret: string | undefined;
  let pathArg: string | undefined;

  for (let i = 0; i < argv.length; ) {
    const arg = argv[i];

    const jwtMatch = tryReadFlag(argv, i, "--jwt");
    if (jwtMatch) {
      jwt = jwtMatch.value;
      i += jwtMatch.consumedCount;
      continue;
    }

    const apiKeyMatch = tryReadFlag(argv, i, "--api-key");
    if (apiKeyMatch) {
      apiKey = apiKeyMatch.value;
      i += apiKeyMatch.consumedCount;
      continue;
    }

    const apiSecretMatch = tryReadFlag(argv, i, "--api-secret");
    if (apiSecretMatch) {
      apiSecret = apiSecretMatch.value;
      i += apiSecretMatch.consumedCount;
      continue;
    }

    const pathMatch = tryReadFlag(argv, i, "--path", "-p");
    if (pathMatch) {
      pathArg = pathMatch.value;
      i += pathMatch.consumedCount;
      continue;
    }

    if (arg.startsWith("-")) {
      throw buildUnknownFlagError(arg, PINATA_SUPPORTED_FLAGS);
    }

    throw buildUnexpectedPositionalArgError(arg, PINATA_SUPPORTED_FLAGS);
  }

  if ((apiKey && !apiSecret) || (!apiKey && apiSecret)) {
    throw new Error("Both --api-key and --api-secret are required when using API key auth");
  }

  return { jwt, apiKey, apiSecret, pathArg };
}
