/**
 * Purpose: CLI argument parsing for ipfs-submit-agent-card-pinata
 * Scope:   Parses --api-key argument
 * Inputs:  Command-line argument arrays
 * Outputs: Parsed arguments for Pinata upload
 */

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

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith("--jwt=")) {
      const value = arg.slice("--jwt=".length).trim();
      if (!value) {
        throw new Error("Missing value for --jwt");
      }
      jwt = value;
      continue;
    }
    if (arg === "--jwt") {
      const next = argv[i + 1];
      if (!next || next.startsWith("-")) {
        throw new Error("Missing value for --jwt");
      }
      jwt = next.trim();
      if (!jwt) {
        throw new Error("Missing value for --jwt");
      }
      i += 1;
      continue;
    }
    if (arg.startsWith("--api-key=")) {
      const value = arg.slice("--api-key=".length).trim();
      if (!value) {
        throw new Error("Missing value for --api-key");
      }
      apiKey = value;
      continue;
    }
    if (arg === "--api-key") {
      const next = argv[i + 1];
      if (!next || next.startsWith("-")) {
        throw new Error("Missing value for --api-key");
      }
      apiKey = next.trim();
      if (!apiKey) {
        throw new Error("Missing value for --api-key");
      }
      i += 1;
      continue;
    }
    if (arg.startsWith("--api-secret=")) {
      const value = arg.slice("--api-secret=".length).trim();
      if (!value) {
        throw new Error("Missing value for --api-secret");
      }
      apiSecret = value;
      continue;
    }
    if (arg === "--api-secret") {
      const next = argv[i + 1];
      if (!next || next.startsWith("-")) {
        throw new Error("Missing value for --api-secret");
      }
      apiSecret = next.trim();
      if (!apiSecret) {
        throw new Error("Missing value for --api-secret");
      }
      i += 1;
      continue;
    }
    if (arg.startsWith("--path=")) {
      const value = arg.slice("--path=".length).trim();
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
      pathArg = next.trim();
      if (!pathArg) {
        throw new Error("Missing value for --path");
      }
      i += 1;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(
        `Unknown argument: "${arg}". Supported flags: ${PINATA_SUPPORTED_FLAGS}`
      );
    }

    throw new Error(
      `Unexpected positional argument: "${arg}". Supported flags: ${PINATA_SUPPORTED_FLAGS}`
    );
  }

  if ((apiKey && !apiSecret) || (!apiKey && apiSecret)) {
    throw new Error("Both --api-key and --api-secret are required when using API key auth");
  }

  return { jwt, apiKey, apiSecret, pathArg };
}
