/**
 * Purpose: URL resolution and environment mapping for T3N network integration
 */

import { type Environment as T3nEnvironment } from "@terminal3/t3n-sdk";
import { type Environment } from "./environment.js";
import {
  getT3nApiUrlOverride,
  getT3nRuntimeApiUrlOverride,
  getHederaNetwork as getHederaNetworkFromEnvValue,
  getHederaNetworkExplicit,
  type HederaNetwork,
} from "./env.js";
import {
  getNetworkTierConfigFilename,
  loadPluginNetworkConfig,
} from "./network-config.js";
import { isLocalhostUrl } from "./t3n-endpoint.js";

interface InternalEnvConfig {
  t3nEnv: T3nEnvironment;
  hederaNetwork: HederaNetwork;
  defaultBaseUrl: string;
}

const NETWORK_TIER_CONFIG: Record<Environment, InternalEnvConfig> = {
  local: {
    t3nEnv: "staging",
    hederaNetwork: "local",
    defaultBaseUrl: "http://localhost:3000",
  },
  testnet: {
    t3nEnv: "staging",
    hederaNetwork: "testnet",
    defaultBaseUrl: "https://cn-api.sg.staging.t3n.terminal3.io",
  },
  mainnet: {
    t3nEnv: "production",
    hederaNetwork: "mainnet",
    defaultBaseUrl: "https://cn-api.sg.prod.t3n.terminal3.io",
  },
};

export function inferT3nEnvFromUrl(
  baseUrl: string,
  fallback: T3nEnvironment
): T3nEnvironment {
  const url = baseUrl.toLowerCase();
  if (isLocalhostUrl(baseUrl)) return "local";
  if (url.includes("staging") || url.includes("stg")) return "staging";
  return fallback;
}

export async function resolveT3nBaseUrl(
  networkTier: Environment,
  options: { env?: NodeJS.ProcessEnv } = {}
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

export function getT3nDefaultEnv(networkTier: Environment): T3nEnvironment {
  return NETWORK_TIER_CONFIG[networkTier].t3nEnv;
}

/**
 * Gets human-readable T3N environment label for a given network tier.
 */
export function getT3nEnvironmentLabel(networkTier: Environment): "local/mock" | "staging" | "production" {
  if (networkTier === "local") return "local/mock";
  if (networkTier === "mainnet") return "production";
  return "staging";
}

/**
 * Gets Hedera network from environment or falls back to network tier default.
 */
export function getHederaNetworkFromTier(
  networkTier: Environment,
  env?: NodeJS.ProcessEnv
): HederaNetwork {
  return getHederaNetworkExplicit(env) ?? NETWORK_TIER_CONFIG[networkTier].hederaNetwork;
}
