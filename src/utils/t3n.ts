/**
 * Purpose: T3N network integration for DID registration and network tier resolution
 * Scope:   Registers did:t3n:a: identities on T3N network, resolves base URLs from
 *          config files or defaults, and maps network tiers to T3N environments
 * Inputs:  Environment options, private keys, process environment
 * Outputs: RegisterDidResult with DID and address, resolved base URLs, network labels
 *
 * This module handles the complexity of T3N network integration, including:
 * - DID registration (backend returns did:t3n:a:XXXX format directly)
 * - Network tier to T3N environment mapping (local/testnet → staging, mainnet → production)
 * - Config file resolution with fallback to hardcoded defaults
 * - Network error detection and user-friendly error messages
 */

import {
  T3nClient,
  SessionStatus,
  createRandomHandler,
  loadWasmComponent,
  metamask_sign,
  setEnvironment,
  type Environment as T3nEnvironment,
} from "@terminal3/t3n-sdk";

import {
  getT3nApiUrlOverride,
  getT3nRuntimeApiUrlOverride,
  getHederaNetwork as getHederaNetworkFromEnvValue,
  getHederaNetworkExplicit,
  isTestEnvironment,
  shouldUseLiveLocalT3nBackend,
  type HederaNetwork,
} from "./env.js";
import { deriveHederaAddress } from "./hedera.js";
import {
  getNetworkTierConfigFilename,
  loadPluginNetworkConfig,
} from "./network-config.js";
import { createConfiguredMlKemPublicKeyHandler } from "./t3n-ml-kem.js";
import { messageFromError } from "./tool-result.js";
import {
  getContractVersion,
  isScriptNotRegisteredError,
  SCRIPT_NAMES,
} from "./contract-version.js";
import { type Environment } from "./environment.js";

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
  /** Optional extra headers for T3N `/api/rpc` requests (e.g. tracing). */
  t3nRequestHeaders?: Record<string, string>;
  env?: NodeJS.ProcessEnv;
}

export interface FetchAgentRecordOptions {
  networkTier: Environment;
  timeoutMs?: number;
  t3nRequestHeaders?: Record<string, string>;
  env?: NodeJS.ProcessEnv;
}

export interface AgentRegistryRecord {
  agent_uri: string;
  registered_at: number;
  updated_at: number;
  owner: string;
}

interface ResolveBaseUrlOptions {
  env?: NodeJS.ProcessEnv;
}

interface InternalEnvConfig {
  t3nEnv: T3nEnvironment;
  hederaNetwork: HederaNetwork;
  defaultBaseUrl: string;
}

/**
 * Infers T3N environment from base URL string.
 *
 * Examines the URL for environment indicators (localhost, staging) to determine
 * the appropriate T3nEnvironment. Falls back to provided default if no
 * indicators are found.
 *
 * @param baseUrl - Base URL to examine
 * @param fallback - Default environment if URL doesn't contain indicators
 * @returns Inferred T3nEnvironment
 */
function inferT3nEnvFromUrl(
  baseUrl: string,
  fallback: T3nEnvironment
): T3nEnvironment {
  const url = baseUrl.toLowerCase();
  if (url.includes("localhost") || url.includes("127.0.0.1")) return "local";
  if (url.includes("staging")) return "staging";
  return fallback;
}

const NETWORK_TIER_CONFIG: Record<Environment, InternalEnvConfig> = {
  local: {
    t3nEnv: "staging", // HEDERA_NETWORK=local → T3N Environment=staging
    hederaNetwork: "local",
    defaultBaseUrl: "http://localhost:3000",
  },
  testnet: {
    t3nEnv: "staging", // HEDERA_NETWORK=testnet → T3N Environment=staging
    hederaNetwork: "testnet",
    defaultBaseUrl: "https://cn-api.sg.staging.t3n.terminal3.io",
  },
  mainnet: {
    t3nEnv: "production", // HEDERA_NETWORK=mainnet → T3N Environment=production
    hederaNetwork: "mainnet",
    defaultBaseUrl: "https://cn-api.sg.prod.t3n.terminal3.io",
  },
};

const NETWORK_ERROR_MARKERS = [
  "fetch failed",
  "network",
  "econnrefused",
  "enotfound",
  "etimedout",
  "timeout",
  "this operation was aborted",
  "aborted",
  "abort",
] as const;

const AGENT_REGISTRY_CONTRACT_NAME = SCRIPT_NAMES.AGENT_REGISTRY;
const AGENT_REGISTRY_REGISTER_FUNCTION = "agent-registry-register";
const AGENT_REGISTRY_GET_FUNCTION = "agent-registry-get";
const DEFAULT_AGENT_RECORD_TIMEOUT_MS = 10000;
const DEFAULT_REGISTRATION_POLL_INTERVAL_MS = 500;

/**
 * Generates DID suffix in format `a:XXXX` from Ethereum address.
 *
 * Extracts the first 16 hex characters (after 0x prefix) to create a consistent
 * identifier. This format matches the mock DID generation used in local mode,
 * ensuring compatibility between mock and real registration flows.
 *
 * @param address - Ethereum address (0x-prefixed hex string)
 * @returns DID suffix in format "a:XXXX" where XXXX is 16 hex characters
 */
function generateDidSuffix(address: string): string {
  const suffix = address.replace("0x", "").slice(0, 16);
  return `a:${suffix}`;
}

function buildDerivedDid(prefix: "did:t3:a:" | "did:t3n:a:", address: string): string {
  const suffix = address.replace("0x", "").slice(0, 16);
  return `${prefix}${suffix}`;
}

function isLikelyLocalBaseUrl(baseUrl: string): boolean {
  return (
    baseUrl.includes("127.0.0.1") ||
    baseUrl.includes("localhost") ||
    baseUrl.includes("[::1]")
  );
}

export function deriveDeterministicT3nDid(
  address: string,
  options: { networkTier: Environment; baseUrl?: string }
): string {
  if (options.networkTier === "local") {
    return buildDerivedDid("did:t3n:a:", address);
  }

  if (options.baseUrl && isLikelyLocalBaseUrl(options.baseUrl)) {
    return buildDerivedDid("did:t3:a:", address);
  }

  return buildDerivedDid("did:t3n:a:", address);
}

/**
 * Builds a mock DID in the format required by the specification.
 *
 * Used in local/mock mode to generate a DID without making network calls.
 * Format: `did:t3n:a:{suffix}` where suffix is the first 16 hex characters
 * from the Ethereum address (after 0x prefix).
 *
 * @param address - Ethereum address (0x-prefixed hex string)
 * @returns Mock DID in format `did:t3n:a:XXXX`
 */
function buildMockDid(address: string): string {
  return deriveDeterministicT3nDid(address, { networkTier: "local" });
}

/**
 * Builds a default agent URI used when caller did not provide one.
 *
 * The URI is deterministic from the wallet address fragment and acts as a
 * safe non-empty default for on-chain registration.
 */
function buildDefaultAgentUri(address: string): string {
  const fragment = address.replace("0x", "").slice(0, 16);
  return `https://agent.${fragment}.t3n.terminal3.io/.well-known/agent_card.json`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface T3nClientInternal {
  runFlow(method: string, payload: Uint8Array): Promise<Uint8Array>;
}

interface T3nClientStateInternal {
  status: SessionStatus;
  did: { value: string; toString: () => string } | null;
}

interface PublicKvResponse {
  found: boolean;
  encoding: "json" | "utf8" | "base64" | null;
  value: unknown;
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
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`Unexpected ${AGENT_REGISTRY_GET_FUNCTION} response: ${JSON.stringify(payload)}`);
  }

  const record = payload as Record<string, unknown>;
  const agentUri = typeof record.agent_uri === "string" ? record.agent_uri.trim() : "";
  const registeredAt = record.registered_at;
  const updatedAt = record.updated_at;
  const ownerFromString = typeof record.owner === "string" ? record.owner.trim() : "";
  const ownerFromBytes = encodeOwnerBytesToHex(record.owner_eth_address);
  const owner = ownerFromString || ownerFromBytes || "";

  if (agentUri === "") {
    throw new Error(`Malformed ${AGENT_REGISTRY_GET_FUNCTION} response: missing agent_uri`);
  }
  if (!Number.isInteger(registeredAt) || !Number.isInteger(updatedAt)) {
    throw new Error(
      `Malformed ${AGENT_REGISTRY_GET_FUNCTION} response: registered_at/updated_at must be integers`
    );
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(owner)) {
    throw new Error(`Malformed ${AGENT_REGISTRY_GET_FUNCTION} response: invalid owner`);
  }

  return {
    agent_uri: agentUri,
    registered_at: Number(registeredAt),
    updated_at: Number(updatedAt),
    owner: owner.toLowerCase(),
  };
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

export async function authenticateT3nClientWithEthDidSuffix(
  client: T3nClient,
  address: string
): Promise<string> {
  const authAction = {
    host_to_guest: "PeerRequest",
    eth_auth_action: "SetAuthenticator",
    authenticator: `eth:${address}`,
    did: generateDidSuffix(address),
  };
  const authResult = await (client as unknown as T3nClientInternal).runFlow(
    "auth",
    new TextEncoder().encode(JSON.stringify(authAction))
  );
  const didString = JSON.parse(new TextDecoder().decode(authResult)) as string;
  const clientState = client as unknown as T3nClientStateInternal;
  clientState.did = {
    value: didString,
    toString: () => didString,
  };
  clientState.status = SessionStatus.Authenticated;
  return didString;
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

function parsePublicKvResponse(payload: unknown): PublicKvResponse {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`Unexpected /api/public-kv response: ${JSON.stringify(payload)}`);
  }

  const value = payload as Record<string, unknown>;
  if (typeof value.found !== "boolean") {
    throw new Error(`Malformed /api/public-kv response: missing found flag`);
  }

  const encoding = value.encoding;
  if (
    encoding !== null &&
    encoding !== "json" &&
    encoding !== "utf8" &&
    encoding !== "base64"
  ) {
    throw new Error(`Malformed /api/public-kv response: invalid encoding`);
  }

  return {
    found: value.found,
    encoding,
    value: value.value,
  };
}

function buildPublicAgentRegistryUrl(baseUrl: string, did: string): string {
  const url = new URL("/api/public-kv", baseUrl);
  url.searchParams.set("map", "public:agent_registry");
  url.searchParams.set("key", did);
  return url.toString();
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

function shouldLogT3nClientDebug(env?: NodeJS.ProcessEnv): boolean {
  const e = env ?? process.env;
  return e.HEDERA_T3N_DEBUG === "1";
}

function t3nClientDebug(
  env: NodeJS.ProcessEnv | undefined,
  message: string,
  data: Record<string, string | number | undefined>
): void {
  if (!shouldLogT3nClientDebug(env)) {
    return;
  }
  const parts = Object.entries(data)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${v}`);
  const suffix = parts.length > 0 ? ` ${parts.join(" ")}` : "";
  console.debug(`[hedera-t3n-plugin:t3n] ${message}${suffix}`);
}

/**
 * Resolves T3N base URL for an explicit network tier.
 *
 * Loads the config file associated with the requested tier (merged with any caller cwd
 * override file) and falls back to hardcoded defaults when the config does not define
 * `t3nApiUrl`.
 *
 * @param networkTier - Network tier to resolve URL for
 * @param options - Reserved for API compatibility
 * @returns Resolved base URL string
 */
export async function resolveT3nBaseUrl(
  networkTier: Environment,
  options: ResolveBaseUrlOptions = {}
): Promise<string> {
  const apiUrlOverride = getT3nApiUrlOverride(options.env);
  if (apiUrlOverride) return apiUrlOverride;

  const tierConfig = await loadPluginNetworkConfig(getNetworkTierConfigFilename(networkTier));
  if (tierConfig.t3nApiUrl) return tierConfig.t3nApiUrl;

  return NETWORK_TIER_CONFIG[networkTier].defaultBaseUrl;
}

function buildRuntimeApiUrlFromBase(baseUrl: string): string | undefined {
  try {
    const parsed = new URL(baseUrl);
    const normalizedPath = parsed.pathname.replace(/\/+$/, "");
    if (normalizedPath === "" || normalizedPath === "/") {
      parsed.pathname = "/api/rpc";
    } else if (normalizedPath.endsWith("/api")) {
      parsed.pathname = `${normalizedPath}/rpc`;
    } else if (normalizedPath.endsWith("/api/rpc")) {
      parsed.pathname = normalizedPath;
    } else {
      parsed.pathname = `${normalizedPath}/api/rpc`;
    }
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    const normalized = baseUrl.trim().replace(/\/+$/, "");
    if (normalized === "") return undefined;
    if (normalized.endsWith("/api/rpc")) return normalized;
    if (normalized.endsWith("/api")) return `${normalized}/rpc`;
    return `${normalized}/api/rpc`;
  }
}

function buildRuntimeApiUrlFromPath(
  baseUrl: string,
  runtimeApiPath: string
): string | undefined {
  const normalizedPath = runtimeApiPath.trim();
  if (normalizedPath === "") return undefined;
  if (/^https?:\/\//i.test(normalizedPath)) {
    return normalizedPath;
  }

  try {
    const parsedBase = new URL(baseUrl);
    const root = `${parsedBase.protocol}//${parsedBase.host}`;
    const absolutePath = normalizedPath.startsWith("/")
      ? normalizedPath
      : `/${normalizedPath}`;
    const resolved = new URL(absolutePath, `${root}/`);
    resolved.search = "";
    resolved.hash = "";
    return resolved.toString();
  } catch {
    const normalizedBase = baseUrl.trim().replace(/\/+$/, "");
    if (normalizedBase === "") return undefined;
    const normalizedSegment = normalizedPath.replace(/^\/+/, "");
    return `${normalizedBase}/${normalizedSegment}`;
  }
}

/**
 * Resolves the T3N Session API URL (`/api/rpc`) for a network tier.
 *
 * Resolution order:
 * 1. `T3N_RUNTIME_API_URL` env override
 * 2. Derived from explicit `T3N_API_URL` env override (`.../api/rpc`)
 * 3. `t3nRuntimeApiPath` config key (path, joined with `t3nApiUrl`)
 * 4. Derived from resolved `t3nApiUrl` (`.../api/rpc`)
 */
export async function resolveT3nRuntimeApiUrl(
  networkTier: Environment,
  options?: { env?: NodeJS.ProcessEnv }
): Promise<string | undefined>;
export async function resolveT3nRuntimeApiUrl(
  options?: { env?: NodeJS.ProcessEnv }
): Promise<string | undefined>;
export async function resolveT3nRuntimeApiUrl(
  networkTierOrOptions: Environment | { env?: NodeJS.ProcessEnv } = {},
  maybeOptions: { env?: NodeJS.ProcessEnv } = {}
): Promise<string | undefined> {
  const env =
    typeof networkTierOrOptions === "string"
      ? (maybeOptions.env ?? process.env)
      : (networkTierOrOptions.env ?? process.env);
  const runtimeApiUrlOverride = getT3nRuntimeApiUrlOverride(env);
  if (runtimeApiUrlOverride) return runtimeApiUrlOverride;
  const apiUrlOverride = getT3nApiUrlOverride(env);
  if (apiUrlOverride) {
    const derivedOverrideUrl = buildRuntimeApiUrlFromBase(apiUrlOverride);
    if (derivedOverrideUrl) return derivedOverrideUrl;
  }

  const networkTier =
    typeof networkTierOrOptions === "string"
      ? networkTierOrOptions
      : getHederaNetworkFromEnvValue(env);

  const config = await loadPluginNetworkConfig(getNetworkTierConfigFilename(networkTier));
  const baseUrl = await resolveT3nBaseUrl(networkTier, { env });
  if (config.t3nRuntimeApiPath) {
    const fromRuntimeApiPathConfig = buildRuntimeApiUrlFromPath(
      baseUrl,
      config.t3nRuntimeApiPath
    );
    if (fromRuntimeApiPathConfig) return fromRuntimeApiPathConfig;
  }
  return buildRuntimeApiUrlFromBase(baseUrl);
}

/**
 * Detects if an error is likely a network connectivity issue.
 *
 * Examines error name and message for common network error indicators (connection
 * refused, timeout, DNS failures, etc.). Used to provide user-friendly error messages
 * that suggest checking network connectivity or using local mode.
 *
 * @param error - Error object or unknown value to examine
 * @returns True if error appears to be network-related
 */
function isLikelyNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      error.name === "TypeError" ||
      error.name === "AbortError" ||
      NETWORK_ERROR_MARKERS.some((marker) => message.includes(marker))
    );
  }

  // Fallback for non-Error values: convert to string and check for markers
  const fallbackMessage = String(error).toLowerCase();
  return NETWORK_ERROR_MARKERS.some((marker) => fallbackMessage.includes(marker));
}

/**
 * Fetches an agent registry record via unauthenticated public HTTP readback endpoint.
 */
export async function fetchAgentViaCcfAction(
  did: string,
  options: FetchAgentRecordOptions
): Promise<AgentRegistryRecord | null> {
  const baseUrl = await resolveT3nBaseUrl(options.networkTier, { env: options.env });
  const timeoutMs = options.timeoutMs ?? DEFAULT_AGENT_RECORD_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(buildPublicAgentRegistryUrl(baseUrl, did), {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(options.t3nRequestHeaders ?? {}),
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const bodySuffix = body ? ` (${body.trim()})` : "";
      throw new Error(
        `Public CCF readback HTTP ${response.status}: ${response.statusText}${bodySuffix}`
      );
    }

    const payload = (await response.json()) as unknown;
    const publicKv = parsePublicKvResponse(payload);
    if (!publicKv.found) {
      return null;
    }

    return parseAgentRegistryRecord(publicKv.value);
  } finally {
    clearTimeout(timeout);
  }
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

/**
 * Registers a did:t3n:a: identity and agent URI on the T3N network.
 *
 * In local mode, returns a mock DID without making network calls unless the caller
 * explicitly enables the live local CCF backend. In network mode, performs the full
 * registration flow:
 * 1. Derives Hedera address from private key
 * 2. Resolves T3N base URL from config or defaults
 * 3. Initializes T3N SDK client with WASM handlers
 * 4. Performs handshake and authentication
 * 5. Triggers `tee:agent-registry/contracts` → `agent-registry-register`
 * 6. Optionally verifies registration via CCF-native `action.execute` readback
 *
 *
 * The networkTier parameter takes precedence over HEDERA_NETWORK environment variable
 * to allow explicit control per call.
 *
 * @param privateKey - Private key (0x-prefixed hex) to derive address and sign with
 * @param networkTier - Network tier (default: "local")
 * @param options - Registration options
 *   - timeoutMs: Request timeout in milliseconds (default: 90s, 25s in tests)
 * @returns Promise resolving to registration result with DID, address, and baseUrl
 * @throws Error if network registration fails or network is unreachable
 */
export async function registerDidT3n(
  privateKey: string,
  networkTier: Environment = "local",
  options: RegisterDidOptions = {}
): Promise<RegisterDidResult> {
  const tierConfig = NETWORK_TIER_CONFIG[networkTier];
  const address = deriveHederaAddress(privateKey);

  // networkTier parameter takes precedence over HEDERA_NETWORK env var
  const hederaNetwork = networkTier;

  const useMockLocalRegistration =
    hederaNetwork === "local" && !shouldUseLiveLocalT3nBackend(options.env);

  // Local mode defaults to mock DID generation unless explicitly switched to live local CCF.
  if (useMockLocalRegistration) {
    const localDid = buildMockDid(address);
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

  // Shorter timeout in tests to fail fast when staging is unreachable.
  // Real staging registration can take ~50s, so production/dev default must be higher.
  const defaultTimeout = isTestEnvironment() ? 25000 : 90000;
  const timeout = options.timeoutMs ?? defaultTimeout;

  try {
    const runtimeEnv = inferT3nEnvFromUrl(baseUrl, tierConfig.t3nEnv);
    setEnvironment(runtimeEnv);

    const wasmComponent = await loadWasmComponent();
    const handlers = {
      EthSign: metamask_sign(address, undefined, privateKey),
      MlKemPublicKey: createConfiguredMlKemPublicKeyHandler(options.env),
      Random: createRandomHandler(),
    };

    t3nClientDebug(options.env, "registerDidT3n start", { baseUrl });

    const client = new T3nClient({
      baseUrl,
      wasmComponent,
      handlers,
      timeout,
      ...(options.t3nRequestHeaders &&
      Object.keys(options.t3nRequestHeaders).length > 0
        ? { headers: options.t3nRequestHeaders }
        : {}),
    });

    await client.handshake();
    const didString = await authenticateT3nClientWithEthDidSuffix(client, address);

    if (!shouldRegisterAgentUri) {
      return {
        did: didString,
        address,
        baseUrl,
      };
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
      const confirmationTimeoutMs = resolveRegistrationConfirmationTimeoutMs(
        options,
        defaultTimeout
      );
      const pollIntervalMs =
        options.registrationPollIntervalMs ?? DEFAULT_REGISTRATION_POLL_INTERVAL_MS;
      agentRecord = await waitForAgentRecord({
        did: didString,
        expectedAgentUri: agentUri,
        client,
        contractVersion: agentRegistryContractVersion,
        timeoutMs: confirmationTimeoutMs,
        intervalMs: pollIntervalMs,
      });
    }

    return {
      did: didString,
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
  const isLikelyLocalBaseUrlValue = isLikelyLocalBaseUrl(baseUrl);

  if (isLikelyNetworkError(error)) {
    const suggestion =
      "Check your network connection and ensure the T3N node is accessible. " +
      "To use local/mock mode, set HEDERA_NETWORK=local or use networkTier='local'. " +
      "To use a live local backend, set T3N_LOCAL_BACKEND=ccf.";

    throw new Error(
      `Failed to register did:t3n:a: Network unreachable at ${baseUrl}. ` +
        `Original error: ${message}. ${suggestion}`
    );
  }

  if ((shouldUseLiveLocalT3nBackend(options.env) || isLikelyLocalBaseUrlValue) && message.includes("T2T decaps failed")) {
    throw new Error(
      `Failed to register did:t3n:a: ${message}. ` +
        "Live local CCF uses the cluster's current ML-KEM public key. " +
        "Set T3N_ML_KEM_PUBLIC_KEY or T3N_ML_KEM_PUBLIC_KEY_FILE " +
        "(for example to a generated node-*-keys.json file or a current local/network all_keys_config_*.json)."
    );
  }

  if (isLikelyLocalBaseUrlValue && normalizedMessage.includes("object not found")) {
    throw new Error(
        `Failed to register did:t3n:a: ${message}. ` +
        "Local CCF may have elected a different leader than your configured T3N_API_URL. " +
        "Point T3N_API_URL/T3N_RUNTIME_API_URL to the current leader from /status " +
        "(raft_role=leader), or use the e2e --local-ccf preset to auto-select the leader."
    );
  }

  if (normalizedMessage.includes("eth authenticator is required")) {
    throw new Error(
      `Failed to register did:t3n:a: ${message}. ` +
        "This indicates the session authenticator was not available during contract execution. " +
        "Verify auth flow completion and node/service authenticator propagation for execute_action."
    );
  }

  throw new Error(`Failed to register did:t3n:a: ${message}`);
}

/**
 * Gets Hedera network from environment or falls back to network tier default.
 *
 * Checks for explicit HEDERA_NETWORK environment variable first. If unset or invalid,
 * falls back to the default network for the given tier (from NETWORK_TIER_CONFIG).
 *
 * @param networkTier - Network tier to use as fallback
 * @param env - Optional environment object (defaults to process.env)
 * @returns Hedera network tier
 */
export function getHederaNetworkFromTier(
  networkTier: Environment,
  env?: NodeJS.ProcessEnv
): HederaNetwork {
  return getHederaNetworkExplicit(env) ?? NETWORK_TIER_CONFIG[networkTier].hederaNetwork;
}

/**
 * Gets human-readable T3N environment label for a given network tier.
 *
 * Used in user-facing messages to clearly indicate which T3N environment is being
 * used. Local mode is labeled as "local/mock" to emphasize that it's not a real
 * network connection.
 *
 * @param networkTier - Network tier to get label for
 * @returns Human-readable environment label
 */
export function getT3nEnvironmentLabel(networkTier: Environment): "local/mock" | "staging" | "production" {
  if (networkTier === "local") return "local/mock";
  if (networkTier === "mainnet") return "production";
  return "staging";
}
