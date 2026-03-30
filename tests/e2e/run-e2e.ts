import { spawnSync } from "child_process";
import { existsSync } from "fs";
import { resolve } from "path";

import {
  E2E_AGENT_CARD_GATEWAY_URL_ENV,
  E2E_IPFS_PINATA_ENV,
  E2E_LOCAL_CCF_DEFAULTS_ENV,
  parseE2eOptions,
  stripE2eOptionArgs,
} from "./helpers/e2e-options.js";
import { readMlKemPublicKeyFromFile } from "../../src/utils/t3n-ml-kem.js";

const PNPM_EXECUTABLE = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const forwardedArgs = process.argv.slice(2);
const options = parseE2eOptions(forwardedArgs, process.env);
const vitestArgs = stripE2eOptionArgs(forwardedArgs);

const env: NodeJS.ProcessEnv = { ...process.env, HEDERA_T3N_LIVE_SESSION: "1" };

const LOCAL_CCF_DEFAULT_API_URL = "http://127.0.0.1:3000";
const LOCAL_CCF_DEFAULT_RPC_URL = "http://127.0.0.1:3000/api/rpc";
const LOCAL_CCF_DEFAULT_API_URL_ENV = "HEDERA_E2E_LOCAL_CCF_API_URL";
const LOCAL_CCF_DEFAULT_RUNTIME_API_URL_ENV = "HEDERA_E2E_LOCAL_CCF_RUNTIME_API_URL";
const LOCAL_CCF_KEY_FILE_CANDIDATES_ENV = "HEDERA_E2E_LOCAL_CCF_KEY_FILE_CANDIDATES";
const LOCAL_CCF_NODE_PORTS = [3000, 3001, 3002] as const;
const LOCAL_CCF_STATUS_PATH = "/status";
const LOCAL_CCF_STATUS_TIMEOUT_MS = 2500;
const LOCAL_CCF_ML_KEM_KEY_CANDIDATES = [
  "/tmp/ccf-local-generated/node-1-keys.json",
  "/tmp/ccf-local-generated/node-2-keys.json",
  "/tmp/ccf-local-generated/node-3-keys.json",
  resolve(process.cwd(), "../../local/network/keys/all_keys_configs/all_keys_config_1.json"),
  resolve(process.cwd(), "../../local/network/keys/all_keys_configs/all_keys_config_2.json"),
  resolve(process.cwd(), "../../local/network/keys/all_keys_configs/all_keys_config_3.json"),
];

type LocalCcfStatus = {
  phase?: string;
  raft_role?: string;
};

function isBlank(value: string | undefined): boolean {
  return !value || value.trim() === "";
}

function requireExistingFile(pathValue: string, envName: string): void {
  if (!existsSync(pathValue)) {
    throw new Error(`[e2e] ${envName} points to a missing file: ${pathValue}`);
  }
}

function parseCandidatePaths(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function choosePreferredMlKemKeyFile(
  explicitKeyFile: string | undefined,
  candidateKeyFiles: string[]
): { selectedKeyFile?: string } {
  const existingCandidates = candidateKeyFiles.filter((candidatePath) => existsSync(candidatePath));
  const explicit = explicitKeyFile?.trim();

  if (!explicit) {
    return {
      selectedKeyFile: existingCandidates[0],
    };
  }

  requireExistingFile(explicit, "T3N_ML_KEM_PUBLIC_KEY_FILE");

  if (existingCandidates.length === 0) {
    return {
      selectedKeyFile: explicit,
    };
  }

  let explicitKey: string;
  try {
    explicitKey = readMlKemPublicKeyFromFile(explicit);
  } catch {
    return {
      selectedKeyFile: explicit,
    };
  }

  const matchingCandidate = existingCandidates.find((candidatePath) => {
    try {
      return readMlKemPublicKeyFromFile(candidatePath) === explicitKey;
    } catch {
      return false;
    }
  });

  if (matchingCandidate) {
    return {
      selectedKeyFile: explicit,
    };
  }

  throw new Error(
    `[e2e] T3N_ML_KEM_PUBLIC_KEY_FILE=${explicit} does not match the discovered local CCF key material. ` +
      `Use one of the discovered key files instead, or unset the override: ${existingCandidates.join(", ")}`
  );
}

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function buildRpcUrlFromApiUrl(apiUrl: string): string {
  try {
    const parsed = new URL(apiUrl);
    const normalizedPath = parsed.pathname.replace(/\/+$/, "");
    parsed.pathname = `${normalizedPath}/api/rpc`;
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return `${stripTrailingSlash(apiUrl)}/api/rpc`;
  }
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
    });
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveLocalCcfLeaderApiUrl(): Promise<string | undefined> {
  const candidates = LOCAL_CCF_NODE_PORTS.map((port) => `http://127.0.0.1:${port}`);
  const statuses = await Promise.all(
    candidates.map(async (apiUrl) => {
      const statusUrl = `${apiUrl}${LOCAL_CCF_STATUS_PATH}`;
      const payload = (await fetchJsonWithTimeout(
        statusUrl,
        LOCAL_CCF_STATUS_TIMEOUT_MS
      )) as LocalCcfStatus | null;
      return { apiUrl, payload };
    })
  );

  const readyLeader = statuses.find(
    ({ payload }) => payload?.phase === "ready" && payload?.raft_role === "leader"
  );
  if (readyLeader) {
    return readyLeader.apiUrl;
  }

  const leader = statuses.find(({ payload }) => payload?.raft_role === "leader");
  return leader?.apiUrl;
}

async function applyLocalCcfDefaultsForTestnet(
  targetEnv: NodeJS.ProcessEnv,
  enabled: boolean
): Promise<void> {
  if (!enabled) {
    return;
  }

  const network = targetEnv.HEDERA_NETWORK?.trim().toLowerCase();
  if (network !== "testnet") {
    return;
  }

  const configuredApiDefault = targetEnv[LOCAL_CCF_DEFAULT_API_URL_ENV]?.trim();
  const configuredRuntimeApiDefault =
    targetEnv[LOCAL_CCF_DEFAULT_RUNTIME_API_URL_ENV]?.trim();
  const shouldProbeLeader = isBlank(targetEnv.T3N_API_URL) && isBlank(configuredApiDefault);
  const discoveredLeaderApiUrl = shouldProbeLeader
    ? await resolveLocalCcfLeaderApiUrl()
    : undefined;
  const apiUrlDefault = configuredApiDefault || discoveredLeaderApiUrl || LOCAL_CCF_DEFAULT_API_URL;
  const runtimeApiUrlDefault =
    configuredRuntimeApiDefault || buildRpcUrlFromApiUrl(apiUrlDefault) || LOCAL_CCF_DEFAULT_RPC_URL;
  const configuredCandidateKeyFiles = parseCandidatePaths(
    targetEnv[LOCAL_CCF_KEY_FILE_CANDIDATES_ENV]
  );
  const candidateKeyFiles = Array.from(
    new Set([
      ...configuredCandidateKeyFiles,
      ...LOCAL_CCF_ML_KEM_KEY_CANDIDATES,
    ])
  );
  const initialMlKemPublicKeyFile = targetEnv.T3N_ML_KEM_PUBLIC_KEY_FILE?.trim();
  const hasInlineMlKemPublicKey = !isBlank(targetEnv.T3N_ML_KEM_PUBLIC_KEY);

  if (isBlank(targetEnv.T3N_API_URL)) {
    targetEnv.T3N_API_URL = apiUrlDefault;
  }

  if (isBlank(targetEnv.T3N_RUNTIME_API_URL)) {
    targetEnv.T3N_RUNTIME_API_URL = runtimeApiUrlDefault;
  }

  if (!hasInlineMlKemPublicKey) {
    const { selectedKeyFile } = choosePreferredMlKemKeyFile(
      initialMlKemPublicKeyFile,
      candidateKeyFiles
    );

    if (selectedKeyFile) {
      targetEnv.T3N_ML_KEM_PUBLIC_KEY_FILE = selectedKeyFile;
    }

    if (isBlank(targetEnv.T3N_ML_KEM_PUBLIC_KEY_FILE)) {
      const checkedCandidates =
        candidateKeyFiles.length > 0 ? candidateKeyFiles.join(", ") : "(none configured)";
      throw new Error(
        "[e2e] Local CCF defaults require ML-KEM key material, but no key was found. " +
          "Set T3N_ML_KEM_PUBLIC_KEY_FILE or T3N_ML_KEM_PUBLIC_KEY. " +
          `Checked key-file candidates: ${checkedCandidates}`
      );
    }
  }

  if (discoveredLeaderApiUrl) {
    console.info(`[e2e] Local CCF leader selected via /status: ${discoveredLeaderApiUrl}`);
  } else if (shouldProbeLeader) {
    console.warn(
      `[e2e] Could not detect local CCF leader via /status; falling back to ${apiUrlDefault}`
    );
  }

  const keySourceSummary = !isBlank(targetEnv.T3N_ML_KEM_PUBLIC_KEY_FILE)
    ? `T3N_ML_KEM_PUBLIC_KEY_FILE=${targetEnv.T3N_ML_KEM_PUBLIC_KEY_FILE}`
    : hasInlineMlKemPublicKey
      ? "T3N_ML_KEM_PUBLIC_KEY=<inline value set>"
      : "ML-KEM key source unresolved";
  console.info(
    `[e2e] Local CCF defaults active: T3N_API_URL=${targetEnv.T3N_API_URL}; ` +
      `T3N_RUNTIME_API_URL=${targetEnv.T3N_RUNTIME_API_URL}; ${keySourceSummary}`
  );
}

async function main(): Promise<number> {
  await applyLocalCcfDefaultsForTestnet(env, options.localCcfDefaults);
  env[E2E_LOCAL_CCF_DEFAULTS_ENV] = options.localCcfDefaults ? "1" : "0";

  if (options.agentCardGatewayUrl) {
    env[E2E_AGENT_CARD_GATEWAY_URL_ENV] = options.agentCardGatewayUrl;
  } else {
    delete env[E2E_AGENT_CARD_GATEWAY_URL_ENV];
  }

  if (options.ipfsPinata) {
    env[E2E_IPFS_PINATA_ENV] = "1";
  } else {
    delete env[E2E_IPFS_PINATA_ENV];
  }

  // Keep Vitest in control of reporter rendering and stream ordering.
  const result = spawnSync(
    PNPM_EXECUTABLE,
    ["exec", "vitest", "run", "--config", "vitest.e2e.config.ts", ...vitestArgs],
    {
      cwd: process.cwd(),
      env,
      stdio: "inherit",
    }
  );

  if (result.error) {
    throw result.error;
  }

  return result.status ?? 1;
}

void main()
  .then((code) => {
    process.exit(code);
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(message);
    process.exit(1);
  });
