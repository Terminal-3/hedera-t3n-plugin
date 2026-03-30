export type E2eOptions = {
  agentCardGatewayUrl?: string;
  ipfsPinata: boolean;
  localCcfDefaults: boolean;
};

export const E2E_AGENT_CARD_GATEWAY_URL_ENV = "HEDERA_E2E_AGENT_CARD_GATEWAY_URL";
export const E2E_IPFS_PINATA_ENV = "HEDERA_E2E_IPFS_PINATA";
export const E2E_LOCAL_CCF_DEFAULTS_ENV = "HEDERA_E2E_LOCAL_CCF_DEFAULTS";

function parseBooleanFlag(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

export function stripE2eOptionArgs(argv: string[]): string[] {
  const remainingArgs: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--ipfs-pinata") {
      continue;
    }

    if (arg === "--local-ccf") {
      continue;
    }

    if (arg.startsWith("--agent-card-gateway-url=")) {
      continue;
    }

    if (arg === "--agent-card-gateway-url") {
      const next = argv[i + 1];
      if (!next || next.startsWith("-")) {
        throw new Error("Missing value for --agent-card-gateway-url");
      }
      i += 1;
      continue;
    }

    remainingArgs.push(arg);
  }

  return remainingArgs;
}

export function parseE2eOptions(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env
): E2eOptions {
  let agentCardGatewayUrl = env[E2E_AGENT_CARD_GATEWAY_URL_ENV]?.trim() || undefined;
  let ipfsPinata = parseBooleanFlag(env[E2E_IPFS_PINATA_ENV]);
  let localCcfDefaults = parseBooleanFlag(env[E2E_LOCAL_CCF_DEFAULTS_ENV]);

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--ipfs-pinata") {
      ipfsPinata = true;
      continue;
    }

    if (arg === "--local-ccf") {
      localCcfDefaults = true;
      continue;
    }

    if (arg.startsWith("--agent-card-gateway-url=")) {
      const value = arg.slice("--agent-card-gateway-url=".length).trim();
      if (!value) {
        throw new Error("Missing value for --agent-card-gateway-url");
      }
      agentCardGatewayUrl = value;
      continue;
    }

    if (arg === "--agent-card-gateway-url") {
      const next = argv[i + 1];
      if (!next || next.startsWith("-")) {
        throw new Error("Missing value for --agent-card-gateway-url");
      }
      agentCardGatewayUrl = next.trim();
      if (!agentCardGatewayUrl) {
        throw new Error("Missing value for --agent-card-gateway-url");
      }
      i += 1;
      continue;
    }

  }

  if (ipfsPinata && agentCardGatewayUrl) {
    throw new Error(
      "Use either --agent-card-gateway-url <url> or --ipfs-pinata, not both."
    );
  }

  return {
    agentCardGatewayUrl,
    ipfsPinata,
    localCcfDefaults,
  };
}
