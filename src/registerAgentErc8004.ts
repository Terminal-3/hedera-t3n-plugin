/**
 * Purpose: ERC-8004 agent URI dual-registration entrypoint
 * Scope:   Loads existing identity config, validates public agent card, and registers
 *          the same agent URI in both T3N and Hedera ERC-8004 registries
 * Inputs:  Agent URI and identity config path
 * Outputs: Dual-registration payload with independent verification details
 */

import { readFile } from "fs/promises";

import type { NetworkTier } from "./createIdentity.js";
import {
  loadIdentityOrThrow,
} from "./utils/agent-identity-config.js";
import { assertJsonObjectShape, type AgentCardRecord } from "./utils/agentCard.js";
import {
  AGENT_CARD_FETCH_ATTEMPT_TIMEOUT_MS,
  AGENT_CARD_FETCH_RETRY_INTERVAL_MS,
  AGENT_CARD_FETCH_TIMEOUT_MS,
} from "./utils/constants.js";
import { writeIdentityConfigFile } from "./utils/storage.js";
import {
  assertHederaRegistrationReady,
  registerHederaAgentIdentity,
  type RegisterHederaAgentOptions,
  type RegisterHederaAgentResult,
} from "./utils/hedera.js";
import {
  getT3nEnvironmentLabel,
  isTransientNetworkOrGatewayError,
  registerDidT3n,
  resolveT3nRuntimeApiUrl,
} from "./utils/t3n.js";
import { getT3nEndpointMode } from "./utils/t3n-endpoint.js";
import { messageFromError } from "./utils/tool-result.js";
import { isNonEmptyString } from "./utils/validation.js";

type ValidatePublicAgentCardUrlOptions = {
  timeoutMs?: number;
  attemptTimeoutMs?: number;
  retryIntervalMs?: number;
};

export interface RegisterAgentErc8004Options {
  agentUri?: string;
  identityConfigPath?: string;
  networkTier?: NetworkTier;
  env?: NodeJS.ProcessEnv;
  operatorAccountId?: string;
  operatorPrivateKey?: string;
  /** Optional extra headers for T3N `/api/rpc` requests. */
  t3nRequestHeaders?: Record<string, string>;
}

export interface RegisterAgentErc8004Result {
  did: string;
  agentUri: string;
  verified: boolean;
  network: Exclude<NetworkTier, "local">;
  identityConfigPath: string;
  t3n: {
    txHash: string;
    verified: boolean;
    runtimeAgentUri: string;
    tier: "local/mock" | "staging" | "production";
    endpointMode: string;
    apiUrl?: string;
    runtimeApiUrl?: string;
  };
  hedera: RegisterHederaAgentResult;
}

function readStoredAgentUri(data: unknown): string | undefined {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return undefined;
  }

  const record = data as Record<string, unknown>;
  const gatewayUrl =
    typeof record.agent_card_gateway_url === "string"
      ? record.agent_card_gateway_url.trim()
      : "";
  if (gatewayUrl) {
    return gatewayUrl;
  }

  const cid = typeof record.agent_card_cid === "string" ? record.agent_card_cid.trim() : "";
  if (cid) {
    return `https://gateway.pinata.cloud/ipfs/${cid}`;
  }

  return undefined;
}

function readStoredAgentCardPath(data: unknown): string | undefined {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return undefined;
  }

  const record = data as Record<string, unknown>;
  const agentCardPath =
    typeof record.agent_card_path === "string"
      ? record.agent_card_path.trim()
      : "";

  return agentCardPath || undefined;
}

function normalizeAgentUri(agentUri: string): string {
  const normalized = agentUri.trim();
  if (!normalized) {
    throw new Error("Agent URI is required. Pass --agent-uri <uri>.");
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(`Agent URI '${normalized}' is not a valid absolute URL.`);
  }

  if (parsed.protocol !== "https:") {
    throw new Error(`Agent URI '${normalized}' must use HTTPS.`);
  }

  return normalized;
}

function assertAgentCardRecord(data: unknown, agentUri: string): asserts data is AgentCardRecord {
  assertJsonObjectShape(data, `Agent card at '${agentUri}' must be a JSON object.`);

  const record = data as Record<string, unknown>;
  if (!isNonEmptyString(record.type)) {
    throw new Error(`Agent card at '${agentUri}' is missing required string field 'type'.`);
  }
  if (!isNonEmptyString(record.name)) {
    throw new Error(`Agent card at '${agentUri}' is missing required string field 'name'.`);
  }
  if (!isNonEmptyString(record.description)) {
    throw new Error(
      `Agent card at '${agentUri}' is missing required string field 'description'.`
    );
  }
  if (!Array.isArray(record.endpoints) || record.endpoints.length === 0) {
    throw new Error(
      `Agent card at '${agentUri}' must contain a non-empty 'endpoints' array.`
    );
  }

  for (const [index, endpoint] of record.endpoints.entries()) {
    if (!endpoint || typeof endpoint !== "object" || Array.isArray(endpoint)) {
      throw new Error(
        `Agent card endpoint at index ${index} for '${agentUri}' must be an object.`
      );
    }

    const endpointRecord = endpoint as Record<string, unknown>;
    if (!isNonEmptyString(endpointRecord.name)) {
      throw new Error(
        `Agent card endpoint at index ${index} for '${agentUri}' is missing 'name'.`
      );
    }
    if (!isNonEmptyString(endpointRecord.endpoint)) {
      throw new Error(
        `Agent card endpoint at index ${index} for '${agentUri}' is missing 'endpoint'.`
      );
    }
    if (!isNonEmptyString(endpointRecord.version)) {
      throw new Error(
        `Agent card endpoint at index ${index} for '${agentUri}' is missing 'version'.`
      );
    }
  }
}

export async function validatePublicAgentCardUrl(
  agentUri: string,
  options: ValidatePublicAgentCardUrlOptions = {}
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? AGENT_CARD_FETCH_TIMEOUT_MS;
  const attemptTimeoutMs =
    options.attemptTimeoutMs ?? AGENT_CARD_FETCH_ATTEMPT_TIMEOUT_MS;
  const retryIntervalMs =
    options.retryIntervalMs ?? AGENT_CARD_FETCH_RETRY_INTERVAL_MS;
  const deadline = Date.now() + timeoutMs;
  let lastError = "unknown error";

  while (Date.now() <= deadline) {
    const controller = new AbortController();
    const timeoutMs = Math.min(
      attemptTimeoutMs,
      Math.max(1, deadline - Date.now())
    );
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(agentUri, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Connection: "close",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error(
            "HTTP 403 (forbidden): agent URI must be publicly reachable without authentication."
          );
        }

        const retryAfterHeader = response.headers.get("retry-after");
        const retryAfterSeconds = retryAfterHeader
          ? Number.parseInt(retryAfterHeader, 10)
          : Number.NaN;
        const retryAfterMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? retryAfterSeconds * 1000
          : retryIntervalMs;

        if (
          (response.status === 429 || response.status === 502 || response.status === 503 || response.status === 504) &&
          Date.now() + retryAfterMs <= deadline
        ) {
          lastError = `HTTP ${response.status}`;
          await new Promise((resolve) => setTimeout(resolve, retryAfterMs));
          continue;
        }

        throw new Error(`HTTP ${response.status}`);
      }

      const payload = (await response.json()) as unknown;
      assertAgentCardRecord(payload, agentUri);
      return;
    } catch (error) {
      lastError = messageFromError(error);
      if (!isTransientNetworkOrGatewayError(error)) {
        break;
      }
      if (Date.now() + retryIntervalMs > deadline) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, retryIntervalMs));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(
    `Failed to validate public agent card at '${agentUri}': ${lastError}`
  );
}

async function validateLocalAgentCardFile(
  agentCardPath: string,
  agentUri: string
): Promise<void> {
  const raw = await readFile(agentCardPath, "utf8");
  const payload = JSON.parse(raw) as unknown;
  assertAgentCardRecord(payload, agentUri);
}

export async function registerAgentErc8004(
  options: RegisterAgentErc8004Options
): Promise<RegisterAgentErc8004Result> {
  const env = options.env ?? process.env;
  const { path: identityConfigPath, data, credentials } = await loadIdentityOrThrow({
    pathOverride: options.identityConfigPath,
    env,
    missingPathMessage:
      "Agent identity configuration path not set. Pass --path <identity.json> or set AGENT_IDENTITY_CONFIG_PATH.",
  });

  const network = (options.networkTier ?? credentials.network_tier) as NetworkTier;
  if (network === "local") {
    throw new Error(
      "register-agent-erc8004 does not support HEDERA_NETWORK=local. Use testnet or mainnet."
    );
  }

  const resolvedAgentUri = options.agentUri?.trim() || readStoredAgentUri(data);
  if (!resolvedAgentUri) {
    throw new Error(
      "Agent URI is required. Pass --agent-uri <uri> or run `hedera-t3n-plugin ipfs-submit-agent-card-pinata` first."
    );
  }
  const agentUri = normalizeAgentUri(resolvedAgentUri);
  const storedAgentUri = readStoredAgentUri(data);
  const storedAgentCardPath = readStoredAgentCardPath(data);

  try {
    await validatePublicAgentCardUrl(agentUri);
  } catch (error) {
    const canUseStoredLocalFallback =
      storedAgentUri === agentUri && typeof storedAgentCardPath === "string";

    if (!canUseStoredLocalFallback || !isTransientNetworkOrGatewayError(error)) {
      throw error;
    }

    try {
      await validateLocalAgentCardFile(storedAgentCardPath, agentUri);
    } catch (localError) {
      throw new Error(
        `Failed to validate public agent card at '${agentUri}': ${messageFromError(error)}. ` +
          `Local fallback validation also failed: ${messageFromError(localError)}`
      );
    }
  }

  await assertHederaRegistrationReady(network, {
    env,
    operatorAccountId: options.operatorAccountId,
    operatorPrivateKey: options.operatorPrivateKey,
  });

  const registrationRuntimeApiUrl = await resolveT3nRuntimeApiUrl(network, { env });
  const t3nRegistration = await registerDidT3n(credentials.private_key, network, {
    agentUri,
    verifyRegistration: true,
    env,
    ...(options.t3nRequestHeaders &&
    Object.keys(options.t3nRequestHeaders).length > 0
      ? { t3nRequestHeaders: options.t3nRequestHeaders }
      : {}),
  });

  if (!t3nRegistration.txHash) {
    throw new Error("T3N registration did not return a transaction hash.");
  }
  if (t3nRegistration.did !== credentials.did_t3n) {
    throw new Error(
      `T3N registration DID mismatch. Identity file DID '${credentials.did_t3n}' does not match registration DID '${t3nRegistration.did}'.`
    );
  }
  const runtimeAgentUri = t3nRegistration.agentRecord?.agent_uri ?? agentUri;
  const t3nRuntimeVerified = Boolean(t3nRegistration.agentRecord);
  const t3nTier = getT3nEnvironmentLabel(network);
  const t3nEndpointMode = getT3nEndpointMode(network, t3nRegistration.baseUrl);
  if (!t3nRegistration.agentRecord) {
    throw new Error("T3N registration verification failed: CCF readback record was not returned.");
  }
  if (t3nRegistration.agentRecord && t3nRegistration.agentRecord.agent_uri !== agentUri) {
    throw new Error(
      `T3N registration verification failed: CCF readback record mismatch (expected '${agentUri}', got '${t3nRegistration.agentRecord.agent_uri}').`
    );
  }

  let hederaRegistration: RegisterHederaAgentResult;
  const hederaRegistrationOptions: RegisterHederaAgentOptions = {
    env,
    operatorAccountId: options.operatorAccountId,
    operatorPrivateKey: options.operatorPrivateKey,
  };
  if (credentials.hedera_registration) {
    hederaRegistrationOptions.existingRegistration = credentials.hedera_registration;
  }

  try {
    hederaRegistration = await registerHederaAgentIdentity(
      network,
      agentUri,
      hederaRegistrationOptions
    );
  } catch (error) {
    throw new Error(
      "T3N registration succeeded, but Hedera ERC-8004 registration failed. " +
        `T3N tx hash: ${t3nRegistration.txHash}. ${messageFromError(error)}`
    );
  }

  const updatedIdentity = {
    ...data,
    t3n_registration: {
      tx_hash: t3nRegistration.txHash,
      agent_uri: agentUri,
      runtime_agent_uri: runtimeAgentUri,
    },
    hedera_registration: {
      tx_hash: hederaRegistration.txHash,
      agent_id: hederaRegistration.agentId,
      owner: hederaRegistration.owner,
      token_uri: hederaRegistration.tokenUri,
      chain_id: hederaRegistration.chainId,
      identity_registry_address: hederaRegistration.identityRegistryAddress,
      network,
    },
    erc8004_last_verified_at: new Date().toISOString(),
  };
  await writeIdentityConfigFile(identityConfigPath, updatedIdentity);

  return {
    did: t3nRegistration.did,
    agentUri,
    verified: true,
    network,
    identityConfigPath,
    t3n: {
      txHash: t3nRegistration.txHash,
      verified: t3nRuntimeVerified,
      runtimeAgentUri,
      tier: t3nTier,
      endpointMode: t3nEndpointMode,
      apiUrl: t3nRegistration.baseUrl,
      runtimeApiUrl: registrationRuntimeApiUrl,
    },
    hedera: hederaRegistration,
  };
}

export function formatRegisterAgentErc8004Message(
  result: RegisterAgentErc8004Result
): string {
  const hederaAction = result.hedera.created
    ? "created"
    : result.hedera.updated
      ? "updated"
      : "reused existing";

  return [
    "ERC-8004 dual registration completed.",
    "",
    "Summary:",
    `T3N tx hash: ${result.t3n.txHash}`,
    `Hedera tx hash: ${result.hedera.txHash}`,
    `Hedera agent ID: ${result.hedera.agentId}`,
    `Hedera operator account used: ${result.hedera.operatorAccountId}`,
    `Hedera owner/address: ${result.hedera.owner}`,
    result.hedera.explorerTxUrl
      ? `Hedera explorer: ${result.hedera.explorerTxUrl}`
      : undefined,
    "",
    "Details:",
    `DID: ${result.did}`,
    `Agent URI: ${result.agentUri}`,
    `Network: ${result.network}`,
    `T3N tier: ${result.t3n.tier}`,
    `T3N endpoint mode: ${result.t3n.endpointMode}`,
    `T3N API URL: ${result.t3n.apiUrl ?? "(not configured)"}`,
    `T3N runtime API URL: ${result.t3n.runtimeApiUrl ?? "(not configured)"}`,
    `T3N CCF readback record match: ${result.t3n.verified ? "yes" : "no"}`,
    `T3N CCF readback agent URI: ${result.t3n.runtimeAgentUri}`,
    `Hedera registry: ${result.hedera.identityRegistryAddress}`,
    `Hedera chain ID: ${result.hedera.chainId}`,
    `Hedera operator address: ${result.hedera.operatorAddress}`,
    `Hedera action: ${hederaAction}`,
    `Hedera token URI match: ${result.hedera.verified ? "yes" : "no"}`,
    `Identity config: ${result.identityConfigPath}`,
  ]
    .filter(Boolean)
    .join("\n");
}
