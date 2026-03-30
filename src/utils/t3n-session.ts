import type { T3nClient } from "@terminal3/t3n-sdk";
import {
  T3nClient as T3nClientClass,
  SessionStatus,
  createEthAuthInput,
  createRandomHandler,
  eth_get_address,
  loadWasmComponent,
  metamask_sign,
  setEnvironment,
} from "@terminal3/t3n-sdk";

import {
  readAgentIdentityConfig,
  resolveAgentIdentityConfigPath,
  validateAgentIdentityConfig,
} from "./agent-identity-config.js";
import { isTestEnvironment, shouldUseLiveLocalT3nBackend } from "./env.js";
import { createConfiguredMlKemPublicKeyHandler } from "./t3n-ml-kem.js";
import {
  authenticateT3nClientWithEthDidSuffix,
  resolveT3nBaseUrl,
} from "./t3n.js";
import { validateStoredCredentials } from "./validation.js";

import type { Environment } from "./environment.js";

type StoredSession = {
  client: T3nClient;
  did: string;
  privateKey: string;
  networkTier: Environment;
  baseUrl: string;
  identityPath: string;
};

type LoadedIdentityCredentials = {
  did: string;
  privateKey: string;
  networkTier: Environment;
  identityPath: string;
};

type MockExecuteRequest = {
  function_name: string;
};

type T3nClientWithAuthenticate = T3nClient & {
  authenticate(input: unknown): Promise<{ toString(): string }>;
};

export type T3nSessionState =
  | {
      isValid: true;
      client: T3nClient;
      did: string;
      networkTier: Environment;
      baseUrl: string;
      identityPath: string;
    }
  | {
      isValid: false;
      reason: "no_session" | "not_authenticated" | "no_did";
    };

export type CreateT3nSessionResult = {
  did: string;
  reused: boolean;
  networkTier: Environment;
  baseUrl: string;
};

let currentSession: StoredSession | null = null;

function inferSdkEnvironment(baseUrl: string): "local" | "staging" | "production" {
  const normalized = baseUrl.toLowerCase();
  if (
    normalized.includes("localhost") ||
    normalized.includes("127.0.0.1") ||
    normalized.includes(":3000")
  ) {
    return "local";
  }
  if (normalized.includes("staging") || normalized.includes("stg")) {
    return "staging";
  }
  return "production";
}

function shouldUseMockSession(env: NodeJS.ProcessEnv): boolean {
  if (shouldUseLiveLocalT3nBackend(env)) {
    return false;
  }
  if (isTestEnvironment(env)) {
    return env.HEDERA_T3N_LIVE_SESSION !== "1";
  }
  return env.HEDERA_NETWORK === "local";
}

function createMockT3nClient(did: string): T3nClient {
  return {
    getDid: () => ({ toString: () => did }) as ReturnType<T3nClient["getDid"]>,
    isAuthenticated: () => true,
    getStatus: () => SessionStatus.Authenticated,
    execute: async (request: MockExecuteRequest) => {
      await Promise.resolve();

      if (request.function_name === "get-profile-fields-name-only") {
        // Return some mock profile fields to allow demo testing in local mode
        return JSON.stringify({
          response: ["email", "givenName", "familyName", "userName"],
        });
      }
      return JSON.stringify({ response: {} });
    },
  } as unknown as T3nClient;
}

async function loadIdentityCredentials(
  env: NodeJS.ProcessEnv = process.env
): Promise<LoadedIdentityCredentials> {
  const previousIdentityPath = process.env.AGENT_IDENTITY_CONFIG_PATH;
  if (env.AGENT_IDENTITY_CONFIG_PATH !== undefined) {
    process.env.AGENT_IDENTITY_CONFIG_PATH = env.AGENT_IDENTITY_CONFIG_PATH;
  }

  const resolvedPathResult = resolveAgentIdentityConfigPath();

  if (previousIdentityPath !== undefined) {
    process.env.AGENT_IDENTITY_CONFIG_PATH = previousIdentityPath;
  } else if (env.AGENT_IDENTITY_CONFIG_PATH !== undefined) {
    delete process.env.AGENT_IDENTITY_CONFIG_PATH;
  }
  if (!resolvedPathResult.ok) {
    throw new Error(resolvedPathResult.humanMessage);
  }

  const readResult = await readAgentIdentityConfig(resolvedPathResult.path);
  if (!readResult.ok) {
    throw new Error(readResult.humanMessage);
  }
  if (!readResult.data) {
    throw new Error(
      `Identity configuration at ${resolvedPathResult.path} is empty. Run \`pnpm create-identity\` first.`
    );
  }

  const validateResult = validateAgentIdentityConfig(readResult.data, readResult.path);
  if (!validateResult.ok) {
    throw new Error(validateResult.humanMessage);
  }

  const credentials = validateStoredCredentials(readResult.data);

  return {
    did: credentials.did_t3n,
    privateKey: credentials.private_key,
    networkTier: credentials.network_tier,
    identityPath: resolvedPathResult.path,
  };
}

async function createAuthenticatedClient(
  privateKey: string,
  networkTier: Environment,
  env: NodeJS.ProcessEnv
): Promise<{ client: T3nClient; did: string; baseUrl: string }> {
  const baseUrl = await resolveT3nBaseUrl(networkTier, { env });
  setEnvironment(inferSdkEnvironment(baseUrl));

  const wasmComponent = await loadWasmComponent();
  const address = eth_get_address(privateKey);
  const handlers = {
    EthSign: metamask_sign(address, undefined, privateKey),
    MlKemPublicKey: createConfiguredMlKemPublicKeyHandler(env),
    Random: createRandomHandler(),
  };

  const client = new T3nClientClass({
    baseUrl,
    wasmComponent,
    timeout: 30000,
    handlers,
  });

  await client.handshake();
  let did: { toString(): string };
  try {
    did = await (client as T3nClientWithAuthenticate).authenticate(createEthAuthInput(address));
  } catch {
    const fallbackDid = await authenticateT3nClientWithEthDidSuffix(client, address);
    did = { toString: () => fallbackDid };
  }

  if (!client.isAuthenticated()) {
    throw new Error("Authentication failed: client is not authenticated");
  }

  return {
    client,
    did: did.toString(),
    baseUrl,
  };
}

export function clearT3nSession(): void {
  currentSession = null;
}

export function resetT3nSessionStateForTests(): void {
  currentSession = null;
}

export function getValidatedT3nSessionState(): T3nSessionState {
  if (!currentSession) {
    return { isValid: false, reason: "no_session" };
  }

  if (!currentSession.client.isAuthenticated()) {
    return { isValid: false, reason: "not_authenticated" };
  }

  const did = currentSession.client.getDid()?.toString();
  if (!did?.trim()) {
    return { isValid: false, reason: "no_did" };
  }

  return {
    isValid: true,
    client: currentSession.client,
    did,
    networkTier: currentSession.networkTier,
    baseUrl: currentSession.baseUrl,
    identityPath: currentSession.identityPath,
  };
}

export async function createOrReuseT3nSessionFromIdentity(
  options: { env?: NodeJS.ProcessEnv } = {}
): Promise<CreateT3nSessionResult> {
  const env = options.env ?? process.env;

  let credentials: LoadedIdentityCredentials;
  try {
    credentials = await loadIdentityCredentials(env);
  } catch (error) {
    clearT3nSession();
    throw error;
  }

  const baseUrl = await resolveT3nBaseUrl(credentials.networkTier, { env });

  if (
    currentSession &&
    currentSession.privateKey === credentials.privateKey &&
    currentSession.baseUrl === baseUrl
  ) {
    const sessionState = getValidatedT3nSessionState();
    if (sessionState.isValid) {
      return {
        did: sessionState.did,
        reused: true,
        networkTier: sessionState.networkTier,
        baseUrl: sessionState.baseUrl,
      };
    }
  }

  if (shouldUseMockSession(env)) {
    currentSession = {
      client: createMockT3nClient(credentials.did),
      did: credentials.did,
      privateKey: credentials.privateKey,
      networkTier: credentials.networkTier,
      baseUrl,
      identityPath: credentials.identityPath,
    };

    return {
      did: credentials.did,
      reused: false,
      networkTier: credentials.networkTier,
      baseUrl,
    };
  }

  const authenticated = await createAuthenticatedClient(
    credentials.privateKey,
    credentials.networkTier,
    env
  );

  currentSession = {
    client: authenticated.client,
    did: authenticated.did,
    privateKey: credentials.privateKey,
    networkTier: credentials.networkTier,
    baseUrl: authenticated.baseUrl,
    identityPath: credentials.identityPath,
  };

  return {
    did: authenticated.did,
    reused: false,
    networkTier: credentials.networkTier,
    baseUrl: authenticated.baseUrl,
  };
}
