/**
 * Purpose: Shared plugin network configuration loading for T3N and Hedera integrations
 * Scope:   Loads environment-specific JSON config files from packaged defaults merged
 *          with caller cwd overrides
 * Inputs:  Network tier / config filename
 * Outputs: Parsed plugin config with recognized keys only
 */

import { readFile } from "fs/promises";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

import type { HederaNetwork } from "./env.js";
import type { Environment } from "./environment.js";

export interface PluginNetworkConfig {
  t3nApiUrl?: string;
  t3nRuntimeApiPath?: string;
  dashboardUrl?: string;
  findUserDid?: string;
  registerUserDid?: string;
  agentsUrl?: string;
  hederaJsonRpcUrl?: string;
  hederaErc8004IdentityRegistryAddress?: string;
  hederaChainId?: number;
  hederaExplorerUrl?: string;
}

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(MODULE_DIR, "../..");

function normalizeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function normalizeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

async function loadConfigFromDirectory(
  directory: string,
  filename: string
): Promise<PluginNetworkConfig> {
  const path = resolve(directory, filename);
  try {
    const content = await readFile(path, "utf8");
    const parsed = JSON.parse(content) as Record<string, unknown>;

    return {
      t3nApiUrl: normalizeString(parsed.t3nApiUrl),
      t3nRuntimeApiPath: normalizeString(parsed.t3nRuntimeApiPath),
      dashboardUrl: normalizeString(parsed.dashboardUrl),
      findUserDid: normalizeString(parsed.findUserDid),
      registerUserDid: normalizeString(parsed.registerUserDid),
      agentsUrl: normalizeString(parsed.agentsUrl),
      hederaJsonRpcUrl: normalizeString(parsed.hederaJsonRpcUrl),
      hederaErc8004IdentityRegistryAddress: normalizeString(
        parsed.hederaErc8004IdentityRegistryAddress
      ),
      hederaChainId: normalizeInteger(parsed.hederaChainId),
      hederaExplorerUrl: normalizeString(parsed.hederaExplorerUrl),
    };
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

function mergePluginNetworkConfig(
  base: PluginNetworkConfig,
  override: PluginNetworkConfig
): PluginNetworkConfig {
  return {
    ...base,
    ...(Object.fromEntries(
      Object.entries(override).filter(([, value]) => value !== undefined)
    ) as Partial<PluginNetworkConfig>),
  };
}

export async function loadPluginNetworkConfig(
  filename: string,
  options: { cwd?: string } = {}
): Promise<PluginNetworkConfig> {
  const packaged = await loadConfigFromDirectory(PACKAGE_ROOT, filename);
  const cwdConfig = await loadConfigFromDirectory(options.cwd ?? process.cwd(), filename);
  return mergePluginNetworkConfig(packaged, cwdConfig);
}

export function getNetworkTierConfigFilename(
  networkTier: Environment | HederaNetwork
): string {
  if (networkTier === "mainnet") return "config.production.json";
  if (networkTier === "testnet") return "config.staging.json";
  return "config.local.json";
}
