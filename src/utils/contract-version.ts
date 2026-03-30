import {
  AGENT_REGISTRY_CONTRACT_NAME,
  USER_CONTRACT_NAME,
} from "./user-contract.js";

export const SCRIPT_NAMES = {
  AGENT_REGISTRY: `${AGENT_REGISTRY_CONTRACT_NAME}`,
  USER: `${USER_CONTRACT_NAME}`,
} as const;

type ScriptName = (typeof SCRIPT_NAMES)[keyof typeof SCRIPT_NAMES];
type ContractVersionMap = Partial<Record<ScriptName, string>>;

type ContractVersionLookupErrorCode =
  | "SCRIPT_NOT_REGISTERED"
  | "HTTP_ERROR"
  | "INVALID_RESPONSE";

export class ContractVersionLookupError extends Error {
  readonly code: ContractVersionLookupErrorCode;
  readonly rpcUrl: string;
  readonly scriptName: string;
  readonly status?: number;
  readonly responseBody?: string;

  constructor(options: {
    message: string;
    code: ContractVersionLookupErrorCode;
    rpcUrl: string;
    scriptName: string;
    status?: number;
    responseBody?: string;
  }) {
    super(options.message);
    this.name = "ContractVersionLookupError";
    this.code = options.code;
    this.rpcUrl = options.rpcUrl;
    this.scriptName = options.scriptName;
    this.status = options.status;
    this.responseBody = options.responseBody;
  }
}

const contractVersionsCache = new Map<string, ContractVersionMap>();

function normalizeRpcUrl(rpcUrl: string): string {
  return rpcUrl.trim().replace(/\/+$/, "");
}

function isCurrentVersionResponse(
  value: unknown
): value is { current_version: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.current_version === "string";
}

function normalizeVersionOverride(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function getContractVersionOverride(
  scriptName: ScriptName,
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  if (scriptName === SCRIPT_NAMES.AGENT_REGISTRY) {
    return normalizeVersionOverride(env.T3N_AGENT_REGISTRY_SCRIPT_VERSION);
  }
  if (scriptName === SCRIPT_NAMES.USER) {
    return normalizeVersionOverride(env.T3N_USER_SCRIPT_VERSION);
  }
  return undefined;
}

function parseErrorMessage(responseBody: string): string | undefined {
  try {
    const parsed = JSON.parse(responseBody) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }
    const record = parsed as Record<string, unknown>;
    return typeof record.error === "string" ? record.error : undefined;
  } catch {
    return undefined;
  }
}

export function isScriptNotRegisteredError(
  error: unknown,
  scriptName?: ScriptName
): boolean {
  if (!(error instanceof ContractVersionLookupError)) {
    return false;
  }
  if (error.code !== "SCRIPT_NOT_REGISTERED") {
    return false;
  }
  return scriptName === undefined ? true : error.scriptName === scriptName;
}

export async function fetchCurrentVersion(
  rpcUrl: string,
  scriptName: ScriptName
): Promise<string> {
  const url = `${normalizeRpcUrl(rpcUrl)}/api/contracts/current?name=${encodeURIComponent(scriptName)}`;
  const response = await fetch(url, { method: "GET" });
  if (!response.ok) {
    const responseBody = await response.text();
    const errorMessage = parseErrorMessage(responseBody);
    const message = errorMessage
      ? `Failed to fetch current version for ${scriptName}: ${response.status} ${response.statusText}. ${errorMessage}`
      : `Failed to fetch current version for ${scriptName}: ${response.status} ${response.statusText}`;
    throw new ContractVersionLookupError({
      message,
      code:
        response.status === 404 &&
        (errorMessage ?? responseBody)
          .toLowerCase()
          .includes("no registered version for script")
          ? "SCRIPT_NOT_REGISTERED"
          : "HTTP_ERROR",
      rpcUrl,
      scriptName,
      status: response.status,
      responseBody,
    });
  }
  const body = (await response.json()) as unknown;
  if (!isCurrentVersionResponse(body)) {
    throw new ContractVersionLookupError({
      message: `Unexpected response shape for ${scriptName}: missing current_version`,
      code: "INVALID_RESPONSE",
      rpcUrl,
      scriptName,
    });
  }
  return body.current_version;
}

/**
 * Fetches and caches contract versions for a Trinity RPC endpoint.
 */
export async function initContractVersions(rpcUrl: string): Promise<void> {
  const normalizedRpcUrl = normalizeRpcUrl(rpcUrl);
  if (contractVersionsCache.has(normalizedRpcUrl)) {
    return;
  }

  const cacheEntry: ContractVersionMap = {};
  const results = await Promise.allSettled([
    fetchCurrentVersion(normalizedRpcUrl, SCRIPT_NAMES.AGENT_REGISTRY),
    fetchCurrentVersion(normalizedRpcUrl, SCRIPT_NAMES.USER),
  ]);

  if (results[0].status === "fulfilled") {
    cacheEntry[SCRIPT_NAMES.AGENT_REGISTRY] = results[0].value;
  }
  if (results[1].status === "fulfilled") {
    cacheEntry[SCRIPT_NAMES.USER] = results[1].value;
  }

  contractVersionsCache.set(normalizedRpcUrl, cacheEntry);
}

export function getCachedContractVersion(
  rpcUrl: string,
  scriptName: ScriptName
): string | undefined {
  const normalizedRpcUrl = normalizeRpcUrl(rpcUrl);
  return contractVersionsCache.get(normalizedRpcUrl)?.[scriptName];
}

export async function getContractVersion(
  rpcUrl: string,
  scriptName: ScriptName,
  options: { env?: NodeJS.ProcessEnv } = {}
): Promise<string> {
  const override = getContractVersionOverride(scriptName, options.env ?? process.env);
  if (override) {
    return override;
  }

  const normalizedRpcUrl = normalizeRpcUrl(rpcUrl);
  const cachedVersion = getCachedContractVersion(normalizedRpcUrl, scriptName);
  if (cachedVersion) {
    return cachedVersion;
  }

  const resolvedVersion = await fetchCurrentVersion(normalizedRpcUrl, scriptName);
  const cachedEntry = contractVersionsCache.get(normalizedRpcUrl) ?? {};
  contractVersionsCache.set(normalizedRpcUrl, {
    ...cachedEntry,
    [scriptName]: resolvedVersion,
  });
  return resolvedVersion;
}

export function resetContractVersionsCacheForTests(): void {
  contractVersionsCache.clear();
}
