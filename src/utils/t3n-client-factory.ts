/**
 * Purpose: Shared T3N client initialization and authentication factory
 */

import {
  T3nClient,
  createEthAuthInput,
  createRandomHandler,
  loadWasmComponent,
  metamask_sign,
  setEnvironment,
  SessionStatus,
  type Environment as T3nEnvironment,
} from "@terminal3/t3n-sdk";

import { createConfiguredMlKemPublicKeyHandler } from "./t3n-ml-kem.js";
import { inferT3nEnvFromUrl } from "./t3n-urls.js";
import { normalizeEthAddressHex, normalizeT3nDid } from "./identity-utils.js";

export interface T3nClientInternal {
  runFlow(method: string, payload: Uint8Array): Promise<Uint8Array>;
}

export interface T3nClientStateInternal {
  status: SessionStatus;
  did: { value: string; toString: () => string } | null;
}

export async function authenticateT3nClientWithEthDidSuffix(
  client: T3nClient,
  address: string
): Promise<string> {
  const authenticatingClient = client as T3nClient & {
    authenticate?: (input: unknown) => Promise<{ toString(): string }>;
    isAuthenticated?: () => boolean;
    getDid?: () => { toString(): string } | null;
  };

  if (typeof authenticatingClient.authenticate === "function") {
    const did = await authenticatingClient.authenticate(createEthAuthInput(address));
    const didString = normalizeT3nDid(did.toString());

    if (typeof authenticatingClient.getDid === "function") {
      const currentDid = authenticatingClient.getDid()?.toString();
      if (currentDid?.trim()) {
        return normalizeT3nDid(currentDid);
      }
    }

    return didString;
  }

  const authAction = {
    host_to_guest: "PeerRequest",
    eth_auth_action: "SetAuthenticator",
    authenticator: `eth:${address}`,
    did: normalizeEthAddressHex(address),
  };
  const authResult = await (client as unknown as T3nClientInternal).runFlow(
    "auth",
    new TextEncoder().encode(JSON.stringify(authAction))
  );
  const rawDid = JSON.parse(new TextDecoder().decode(authResult)) as string;
  const didString = normalizeT3nDid(rawDid);
  const clientState = client as unknown as T3nClientStateInternal;
  clientState.did = {
    value: didString,
    toString: () => didString,
  };
  clientState.status = SessionStatus.Authenticated;
  return didString;
}

export interface CreateAuthenticatedClientOptions {
  privateKey: string;
  address: string;
  baseUrl: string;
  env?: NodeJS.ProcessEnv;
  timeout?: number;
  headers?: Record<string, string>;
  fallbackT3nEnv: T3nEnvironment;
}

export async function createAuthenticatedT3nClient(
  options: CreateAuthenticatedClientOptions
): Promise<{ client: T3nClient; did: string }> {
  const { privateKey, address, baseUrl, env, timeout, headers, fallbackT3nEnv } = options;

  setEnvironment(inferT3nEnvFromUrl(baseUrl, fallbackT3nEnv));

  const wasmComponent = await loadWasmComponent();
  const handlers = {
    EthSign: metamask_sign(address, undefined, privateKey),
    MlKemPublicKey: createConfiguredMlKemPublicKeyHandler(env, baseUrl),
    Random: createRandomHandler(),
  };

  const client = new T3nClient({
    baseUrl,
    wasmComponent,
    timeout: timeout ?? 30000,
    handlers,
    ...(headers && Object.keys(headers).length > 0 ? { headers } : {}),
  });

  await client.handshake();
  const did = await authenticateT3nClientWithEthDidSuffix(client, address);

  if (!client.isAuthenticated()) {
    throw new Error("Authentication failed: client is not authenticated");
  }

  return { client, did: normalizeT3nDid(did) };
}
