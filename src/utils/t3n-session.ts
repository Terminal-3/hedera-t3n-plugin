import type { T3nClient } from "@terminal3/t3n-sdk";
import {
  eth_get_address,
  SessionStatus,
} from "@terminal3/t3n-sdk";

import {
  loadIdentityOrThrow,
} from "./agent-identity-config.js";
import { isTestEnvironment, shouldUseLiveLocalT3nBackend } from "./env.js";
import {
  createAuthenticatedT3nClient,
  resolveT3nBaseUrl,
} from "./t3n.js";

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
  const { path, credentials } = await loadIdentityOrThrow({
    env,
  });

  return {
    did: credentials.did_t3n,
    privateKey: credentials.private_key,
    networkTier: credentials.network_tier,
    identityPath: path,
  };
}

async function createAuthenticatedClient(
  privateKey: string,
  networkTier: Environment,
  env: NodeJS.ProcessEnv
): Promise<{ client: T3nClient; did: string; baseUrl: string }> {
  const baseUrl = await resolveT3nBaseUrl(networkTier, { env });
  const address = eth_get_address(privateKey);

  const { client, did } = await createAuthenticatedT3nClient({
    privateKey,
    address,
    baseUrl,
    env,
    fallbackT3nEnv: "production",
  });

  return { client, did, baseUrl };
}

export function clearT3nSession(): void {
  currentSession = null;
}

export function resetT3nSessionStateForTests(): void {
  clearT3nSession();
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
