/**
 * Purpose: High-level T3N DID and agent registration workflows
 */

import { isLocalhostUrl } from "./t3n-endpoint.js";
import { type T3nClient } from "@terminal3/t3n-sdk";
import { type Environment } from "./environment.js";
import {
  deriveHederaAddress,
  deriveDeterministicT3nDid,
} from "./identity-utils.js";
import {
  isLikelyNetworkError,
  messageFromError,
} from "./error-utils.js";
import {
  getT3nDefaultEnv,
  resolveT3nBaseUrl,
} from "./t3n-urls.js";
import {
  createAuthenticatedT3nClient,
} from "./t3n-client-factory.js";
import {
  DEFAULT_REGISTRATION_POLL_INTERVAL_MS,
} from "./constants.js";
import {
  getContractVersion,
  isScriptNotRegisteredError,
  SCRIPT_NAMES,
} from "./contract-version.js";
import {
  isTestEnvironment,
  shouldUseLiveLocalT3nBackend,
} from "./env.js";
import {
  agentRegistryRecordSchema,
  type AgentRegistryRecord,
} from "./validation.js";
import { assertJsonObjectShape } from "./agentCard.js";

const AGENT_REGISTRY_CONTRACT_NAME = SCRIPT_NAMES.AGENT_REGISTRY;
const AGENT_REGISTRY_REGISTER_FUNCTION = "agent-registry-register";
const AGENT_REGISTRY_GET_FUNCTION = "agent-registry-get";

export interface RegisterDidResult {
  did: string;
  address: string;
  baseUrl?: string;
  txHash?: string;
  agentUri?: string;
  agentRecord?: AgentRegistryRecord | null;
}

export interface RegisterDidOptions {
  timeoutMs?: number;
  agentUri?: string;
  registerAgentUri?: boolean;
  verifyRegistration?: boolean;
  registrationConfirmationTimeoutMs?: number;
  registrationPollIntervalMs?: number;
  t3nRequestHeaders?: Record<string, string>;
  env?: NodeJS.ProcessEnv;
}

function normalizeEthAddressHex(address: string): string {
  return address.trim().toLowerCase().replace(/^0x/, "");
}

function buildDefaultAgentUri(address: string): string {
  const fragment = normalizeEthAddressHex(address);
  return `https://agent.${fragment}.t3n.terminal3.io/.well-known/agent_card.json`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractAgentRecordPayload(executePayload: unknown): unknown {
  if (
    executePayload &&
    typeof executePayload === "object" &&
    !Array.isArray(executePayload) &&
    "response" in executePayload
  ) {
    return (executePayload as Record<string, unknown>).response;
  }
  return executePayload;
}

function encodeOwnerBytesToHex(ownerEthAddress: unknown): string | undefined {
  if (!Array.isArray(ownerEthAddress)) {
    return undefined;
  }
  if (ownerEthAddress.length !== 20) {
    return undefined;
  }
  if (!ownerEthAddress.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)) {
    return undefined;
  }
  return `0x${ownerEthAddress
    .map((byte) => Number(byte).toString(16).padStart(2, "0"))
    .join("")}`;
}

function parseAgentRegistryRecord(payload: unknown): AgentRegistryRecord | null {
  if (payload === null) {
    return null;
  }

  const responsePayload = extractAgentRecordPayload(payload);
  assertJsonObjectShape(
    responsePayload,
    `Unexpected ${AGENT_REGISTRY_GET_FUNCTION} response: ${JSON.stringify(payload)}`
  );

  const record = responsePayload as Record<string, unknown>;
  const ownerFromBytes = encodeOwnerBytesToHex(record.owner_eth_address);

  const dataToValidate = {
    ...record,
    owner: (typeof record.owner === "string" ? record.owner.trim() : "") || ownerFromBytes || "",
  };

  try {
    const validated = agentRegistryRecordSchema.parse(dataToValidate);
    return {
      ...validated,
      owner: validated.owner.toLowerCase(),
    };
  } catch (error) {
    throw new Error(
      `Malformed ${AGENT_REGISTRY_GET_FUNCTION} response: ${messageFromError(error)}`
    );
  }
}

async function fetchAgentRecordViaAction(
  client: T3nClient,
  did: string,
  contractVersion: string
): Promise<AgentRegistryRecord | null> {
  const executeResponseRaw = await client.execute({
    script_name: AGENT_REGISTRY_CONTRACT_NAME,
    script_version: contractVersion,
    function_name: AGENT_REGISTRY_GET_FUNCTION,
    input: { did },
  });

  let executeResponse: unknown;
  try {
    executeResponse = JSON.parse(executeResponseRaw);
  } catch (error) {
    throw new Error(
      `Failed to parse execute_action response for ${AGENT_REGISTRY_GET_FUNCTION}: ${messageFromError(error)}`
    );
  }

  return parseAgentRegistryRecord(extractAgentRecordPayload(executeResponse));
}

async function waitForAgentRecord(options: {
  did: string;
  expectedAgentUri: string;
  client: T3nClient;
  contractVersion: string;
  timeoutMs: number;
  intervalMs: number;
}): Promise<AgentRegistryRecord> {
  const { did, expectedAgentUri, client, contractVersion, timeoutMs, intervalMs } = options;
  const deadline = Date.now() + timeoutMs;
  let lastRecord: AgentRegistryRecord | null = null;

  while (Date.now() <= deadline) {
    const record = await fetchAgentRecordViaAction(client, did, contractVersion);
    lastRecord = record;

    if (record && record.agent_uri === expectedAgentUri) {
      return record;
    }

    await sleep(intervalMs);
  }

  if (!lastRecord) {
    throw new Error(
      `Agent registry record for DID '${did}' not found via ${AGENT_REGISTRY_GET_FUNCTION} within ${timeoutMs}ms`
    );
  }

  throw new Error(
    `Agent registry record mismatch for DID '${did}': expected agent_uri '${expectedAgentUri}', got '${lastRecord.agent_uri}'`
  );
}

function extractTxHash(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  const obj = payload as Record<string, unknown>;

  if (typeof obj.tx_hash === "string") {
    return obj.tx_hash;
  }
  if (typeof obj.txHash === "string") {
    return obj.txHash;
  }
  if (obj.response && typeof obj.response === "object") {
    const response = obj.response as Record<string, unknown>;
    if (typeof response.tx_hash === "string") {
      return response.tx_hash;
    }
    if (typeof response.txHash === "string") {
      return response.txHash;
    }
  }
  return undefined;
}

export function resolveRegistrationConfirmationTimeoutMs(
  options: Pick<RegisterDidOptions, "timeoutMs" | "registrationConfirmationTimeoutMs"> = {},
  defaultTimeoutMs = 90000
): number {
  return (
    options.registrationConfirmationTimeoutMs ??
    options.timeoutMs ??
    defaultTimeoutMs
  );
}

export async function registerDidT3n(
  privateKey: string,
  networkTier: Environment = "local",
  options: RegisterDidOptions = {}
): Promise<RegisterDidResult> {
  const address = deriveHederaAddress(privateKey);
  const useMockLocalRegistration =
    networkTier === "local" && !shouldUseLiveLocalT3nBackend(options.env);

  if (useMockLocalRegistration) {
    const localDid = deriveDeterministicT3nDid(address);
    const explicitAgentUri = options.agentUri?.trim();
    const localAgentUri =
      explicitAgentUri && explicitAgentUri !== ""
        ? explicitAgentUri
        : buildDefaultAgentUri(address);
    return {
      did: localDid,
      address,
      agentUri: localAgentUri,
    };
  }

  const baseUrl = await resolveT3nBaseUrl(networkTier, { env: options.env });
  const shouldRegisterAgentUri = options.registerAgentUri ?? true;
  const defaultTimeout = isTestEnvironment() ? 25000 : 90000;
  const timeout = options.timeoutMs ?? defaultTimeout;

  try {
    const { client, did } = await createAuthenticatedT3nClient({
      privateKey,
      address,
      baseUrl,
      env: options.env,
      timeout,
      headers: options.t3nRequestHeaders,
      fallbackT3nEnv: getT3nDefaultEnv(networkTier),
    });

    if (!shouldRegisterAgentUri) {
      return { did, address, baseUrl };
    }

    let agentRegistryContractVersion: string;
    try {
      agentRegistryContractVersion = await getContractVersion(baseUrl, SCRIPT_NAMES.AGENT_REGISTRY, {
        env: options.env,
      });
    } catch (error) {
      if (isScriptNotRegisteredError(error, SCRIPT_NAMES.AGENT_REGISTRY)) {
        throw new Error(
          `Failed to resolve current version for ${AGENT_REGISTRY_CONTRACT_NAME}: ${messageFromError(error)}. ` +
            `The current T3N endpoint at ${baseUrl} does not expose the agent-registry contract. ` +
            "Use a local CCF or explicit T3N_API_URL/T3N_RUNTIME_API_URL override for live registration."
        );
      }
      throw new Error(
        `Failed to resolve current version for ${AGENT_REGISTRY_CONTRACT_NAME}: ${messageFromError(error)}`
      );
    }

    const agentUri = options.agentUri?.trim() || buildDefaultAgentUri(address);
    if (!agentUri) {
      throw new Error("agentURI must not be empty");
    }

    const executeRequest = {
      script_name: AGENT_REGISTRY_CONTRACT_NAME,
      script_version: agentRegistryContractVersion,
      function_name: AGENT_REGISTRY_REGISTER_FUNCTION,
      input: { agentURI: agentUri },
    };

    const executeResponseRaw = await client.execute(executeRequest);
    let executeResponse: unknown;
    try {
      executeResponse = JSON.parse(executeResponseRaw);
    } catch (error) {
      throw new Error(
        `Failed to parse execute_action response for ${AGENT_REGISTRY_REGISTER_FUNCTION}: ${messageFromError(error)}`
      );
    }
    const txHash = extractTxHash(executeResponse);
    if (!txHash) {
      throw new Error(
        `Missing tx hash in ${AGENT_REGISTRY_REGISTER_FUNCTION} response: ${JSON.stringify(executeResponse)}`
      );
    }

    const shouldVerifyRegistration = options.verifyRegistration ?? true;

    let agentRecord: AgentRegistryRecord | null = null;
    if (shouldVerifyRegistration) {
      const confirmationTimeoutMs = options.registrationConfirmationTimeoutMs ?? options.timeoutMs ?? defaultTimeout;
      const pollIntervalMs =
        options.registrationPollIntervalMs ?? DEFAULT_REGISTRATION_POLL_INTERVAL_MS;
      agentRecord = await waitForAgentRecord({
        did,
        expectedAgentUri: agentUri,
        client,
        contractVersion: agentRegistryContractVersion,
        timeoutMs: confirmationTimeoutMs,
        intervalMs: pollIntervalMs,
      });
    }

    return {
      did,
      address,
      baseUrl,
      txHash,
      agentUri,
      agentRecord,
    };
  } catch (error) {
    mapRegisterDidT3nFailure(error, baseUrl, options);
  }
}

function mapRegisterDidT3nFailure(
  error: unknown,
  baseUrl: string,
  options: RegisterDidOptions
): never {
  const message = messageFromError(error);
  const normalizedMessage = message.toLowerCase();
  const isLocalBaseUrl = isLocalhostUrl(baseUrl);

  if (isLikelyNetworkError(error)) {
    const suggestion =
      "Check your network connection and ensure the T3N node is accessible. " +
      "To use local/mock mode, set HEDERA_NETWORK=local or use networkTier='local'. " +
      "To use a live local backend, set T3N_LOCAL_BACKEND=ccf.";

    throw new Error(
      `Failed to register did:t3n: Network unreachable at ${baseUrl}. ` +
        `Original error: ${message}. ${suggestion}`
    );
  }

  if ((shouldUseLiveLocalT3nBackend(options.env) || isLocalBaseUrl) && message.includes("T2T decaps failed")) {
    throw new Error(
      `Failed to register did:t3n: ${message}. ` +
        "Live local CCF uses the cluster's current ML-KEM public key. " +
        "Set T3N_ML_KEM_PUBLIC_KEY or T3N_ML_KEM_PUBLIC_KEY_FILE " +
        "(for example to a generated node-*-keys.json file or a current local/network all_keys_config_*.json)."
    );
  }

  if (isLocalBaseUrl && normalizedMessage.includes("object not found")) {
    throw new Error(
        `Failed to register did:t3n: ${message}. ` +
        "Local CCF may have elected a different leader than your configured T3N_API_URL. " +
        "Point T3N_API_URL/T3N_RUNTIME_API_URL to the current leader from /status " +
        "(raft_role=leader), or use the e2e --local-ccf preset to auto-select the leader."
    );
  }

  if (normalizedMessage.includes("eth authenticator is required")) {
    throw new Error(
      `Failed to register did:t3n: ${message}. ` +
        "This indicates the session authenticator was not available during contract execution. " +
        "Verify auth flow completion and node/service authenticator propagation for execute_action."
    );
  }

  throw new Error(`Failed to register did:t3n: ${message}`);
}
