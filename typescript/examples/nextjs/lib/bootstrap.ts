import { execFile } from "child_process";
import { access } from "fs/promises";
import path from "path";
import { pathToFileURL } from "url";
import { promisify } from "util";

import { getProviderReadiness } from "@/lib/config";
import { redactError } from "@/lib/redaction";
import {
  getPluginDistUtilsRoot,
  getPluginRoot,
} from "@/lib/server/plugin-paths";
import { importRuntimeModule } from "@/lib/server/runtime-import";

const execFileAsync = promisify(execFile);

let lastBootstrapError: string | null = null;

type BootstrapState = {
  provider: {
    ready: boolean;
    reason: string | null;
  };
  identity: {
    ready: boolean;
    did?: string;
    networkTier?: string;
    error?: string;
  };
  agentCard: {
    exists: boolean;
    hasGatewayUrl: boolean;
    gatewayUrl?: string;
  };
  session: {
    valid: boolean;
    did?: string;
    networkTier?: string;
  };
  registration: {
    t3nRegistered: boolean;
    hederaRegistered: boolean;
  };
  pinata: {
    configured: boolean;
  };
  recommendations: string[];
  lastBootstrapError: string | null;
};

type StoredCredentials = {
  did_t3n: string;
  network_tier: string;
  agent_card_gateway_url?: string;
  t3n_registration?: {
    agent_uri?: string;
  };
  hedera_registration?: {
    agent_id?: string;
  };
};

type BootstrapModules = {
  getValidatedT3nSessionState: () =>
    | {
        isValid: true;
        did: string;
        networkTier: string;
      }
    | {
        isValid: false;
      };
  readAgentIdentityConfig: (
    path: string
  ) => Promise<{ ok: boolean; path: string; data?: unknown; humanMessage?: string }>;
  resolveAgentIdentityConfigPath: () =>
    | { ok: true; path: string }
    | { ok: false; humanMessage: string };
  validateAgentIdentityConfig: (
    data: unknown,
    path: string
  ) => { ok: boolean; humanMessage?: string };
  getAgentCardPath: (identityPath: string, identity: StoredCredentials) => string;
  validateStoredCredentials: (data: unknown) => StoredCredentials;
};

type T3nSessionModule = Pick<BootstrapModules, "getValidatedT3nSessionState">;
type IdentityConfigModule = Pick<
  BootstrapModules,
  | "readAgentIdentityConfig"
  | "resolveAgentIdentityConfigPath"
  | "validateAgentIdentityConfig"
>;
type AgentCardModule = Pick<BootstrapModules, "getAgentCardPath">;
type ValidationModule = Pick<BootstrapModules, "validateStoredCredentials">;

async function loadBootstrapModules(): Promise<BootstrapModules> {
  const distRoot = getPluginDistUtilsRoot();

  const [
    t3nSessionModule,
    identityConfigModule,
    agentCardModule,
    validationModule,
  ] = await Promise.all([
    importRuntimeModule<T3nSessionModule>(
      pathToFileURL(path.join(distRoot, "t3n-session.js")).href
    ),
    importRuntimeModule<IdentityConfigModule>(
      pathToFileURL(path.join(distRoot, "agent-identity-config.js")).href
    ),
    importRuntimeModule<AgentCardModule>(
      pathToFileURL(path.join(distRoot, "agentCard.js")).href
    ),
    importRuntimeModule<ValidationModule>(
      pathToFileURL(path.join(distRoot, "validation.js")).href
    ),
  ]);

  return {
    getValidatedT3nSessionState: t3nSessionModule.getValidatedT3nSessionState,
    readAgentIdentityConfig: identityConfigModule.readAgentIdentityConfig,
    resolveAgentIdentityConfigPath:
      identityConfigModule.resolveAgentIdentityConfigPath,
    validateAgentIdentityConfig: identityConfigModule.validateAgentIdentityConfig,
    getAgentCardPath: agentCardModule.getAgentCardPath,
    validateStoredCredentials: validationModule.validateStoredCredentials,
  };
}

async function fileExists(pathname: string): Promise<boolean> {
  try {
    await access(pathname);
    return true;
  } catch {
    return false;
  }
}

function hasPinataCredentials(): boolean {
  return Boolean(
    process.env.PINATA_JWT ||
      (process.env.PINATA_API_KEY && process.env.PINATA_API_SECRET)
  );
}

export async function getBootstrapState(): Promise<BootstrapState> {
  const modules = await loadBootstrapModules();
  const provider = getProviderReadiness();
  const identityPathResult = modules.resolveAgentIdentityConfigPath();
  const recommendations: string[] = [];

  if (!identityPathResult.ok) {
    recommendations.push("Run `pnpm create-identity` and set `AGENT_IDENTITY_CONFIG_PATH`.");
    return {
      provider,
      identity: {
        ready: false,
        error: identityPathResult.humanMessage,
      },
      agentCard: {
        exists: false,
        hasGatewayUrl: false,
      },
      session: {
        valid: false,
      },
      registration: {
        t3nRegistered: false,
        hederaRegistered: false,
      },
      pinata: {
        configured: hasPinataCredentials(),
      },
      recommendations,
      lastBootstrapError,
    };
  }

  const readResult = await modules.readAgentIdentityConfig(identityPathResult.path);
  if (!readResult.ok || !readResult.data) {
    recommendations.push("Repair the local identity JSON before using the demo.");
    return {
      provider,
      identity: {
        ready: false,
        error: readResult.ok ? "Identity config is empty." : readResult.humanMessage,
      },
      agentCard: {
        exists: false,
        hasGatewayUrl: false,
      },
      session: {
        valid: false,
      },
      registration: {
        t3nRegistered: false,
        hederaRegistered: false,
      },
      pinata: {
        configured: hasPinataCredentials(),
      },
      recommendations,
      lastBootstrapError,
    };
  }

  const validateResult = modules.validateAgentIdentityConfig(
    readResult.data,
    identityPathResult.path
  );
  if (!validateResult.ok) {
    recommendations.push("Regenerate the identity file with `pnpm create-identity`.");
    return {
      provider,
      identity: {
        ready: false,
        error: validateResult.humanMessage,
      },
      agentCard: {
        exists: false,
        hasGatewayUrl: false,
      },
      session: {
        valid: false,
      },
      registration: {
        t3nRegistered: false,
        hederaRegistered: false,
      },
      pinata: {
        configured: hasPinataCredentials(),
      },
      recommendations,
      lastBootstrapError,
    };
  }

  const credentials = modules.validateStoredCredentials(
    readResult.data
  ) as StoredCredentials;
  const agentCardPath = modules.getAgentCardPath(
    identityPathResult.path,
    credentials
  );
  const agentCardExists = await fileExists(agentCardPath);
  const sessionState = modules.getValidatedT3nSessionState();

  if (!agentCardExists) {
    recommendations.push("Generate or restore the public `agent_card.json` next to the identity file.");
  }

  if (!credentials.agent_card_gateway_url) {
    recommendations.push(
      hasPinataCredentials()
        ? "Use Bootstrap Refresh with upload enabled to publish `agent_card.json`."
        : "Provide Pinata credentials or host `agent_card.json` on a public HTTPS URL."
    );
  }

  return {
    provider,
    identity: {
      ready: true,
      did: credentials.did_t3n,
      networkTier: credentials.network_tier,
    },
    agentCard: {
      exists: agentCardExists,
      hasGatewayUrl: Boolean(credentials.agent_card_gateway_url),
      gatewayUrl: credentials.agent_card_gateway_url,
    },
    session: sessionState.isValid
      ? {
          valid: true,
          did: sessionState.did,
          networkTier: sessionState.networkTier,
        }
      : {
          valid: false,
        },
    registration: {
      t3nRegistered: Boolean(credentials.t3n_registration?.agent_uri),
      hederaRegistered: Boolean(credentials.hedera_registration?.agent_id),
    },
    pinata: {
      configured: hasPinataCredentials(),
    },
    recommendations,
    lastBootstrapError,
  };
}

export async function refreshBootstrapState(options?: { attemptUpload?: boolean }) {
  if (options?.attemptUpload && hasPinataCredentials()) {
    try {
      await execFileAsync("pnpm", ["ipfs-submit-agent-card-pinata"], {
        cwd: getPluginRoot(),
        env: process.env,
        timeout: 90_000,
      });
      lastBootstrapError = null;
    } catch (error) {
      lastBootstrapError = redactError(error);
    }
  }

  return getBootstrapState();
}
