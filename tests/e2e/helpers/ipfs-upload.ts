import { execFile } from "child_process";
import { readFile, writeFile } from "fs/promises";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { promisify } from "util";

import { ensureOwnerOnlyFilePermissions } from "../../../src/utils/file-permissions.js";
import { validatePublicAgentCardUrl } from "../../../src/registerAgentErc8004.js";

const execFileAsync = promisify(execFile);
const DEFAULT_IPFS_GATEWAY_READY_TIMEOUT_MS = 180_000;
const DEFAULT_IPFS_GATEWAY_RETRY_INTERVAL_MS = 5_000;
const DEFAULT_IPFS_GATEWAY_FETCH_TIMEOUT_MS = 15_000;
const IPFS_GATEWAY_READY_TIMEOUT_ENV = "HEDERA_E2E_IPFS_GATEWAY_READY_TIMEOUT_MS";
const IPFS_GATEWAY_RETRY_INTERVAL_ENV = "HEDERA_E2E_IPFS_GATEWAY_RETRY_INTERVAL_MS";
const IPFS_GATEWAY_FETCH_TIMEOUT_ENV = "HEDERA_E2E_IPFS_GATEWAY_FETCH_TIMEOUT_MS";
const PNPM_EXECUTABLE = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function readPositiveMsEnv(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw) {
    return defaultValue;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return defaultValue;
  }

  return parsed;
}

function getProjectRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
}

export async function readAgentCardGatewayUrl(identityPath: string): Promise<string | undefined> {
  const raw = await readFile(identityPath, "utf8");
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const gatewayUrl =
    typeof parsed.agent_card_gateway_url === "string"
      ? parsed.agent_card_gateway_url.trim()
      : "";
  return gatewayUrl || undefined;
}

export async function persistAgentCardGatewayUrl(
  identityPath: string,
  gatewayUrl: string
): Promise<void> {
  const raw = await readFile(identityPath, "utf8");
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  parsed.agent_card_gateway_url = gatewayUrl;
  await writeFile(identityPath, JSON.stringify(parsed, null, 2), "utf8");
  await ensureOwnerOnlyFilePermissions(identityPath, "agent identity file");
}

export async function waitForAgentCardGatewayUrlReady(
  gatewayUrl: string,
  options: {
    timeoutMs?: number;
    retryIntervalMs?: number;
    fetchTimeoutMs?: number;
  } = {}
): Promise<void> {
  const timeoutMs =
    options.timeoutMs ??
    readPositiveMsEnv(
      IPFS_GATEWAY_READY_TIMEOUT_ENV,
      DEFAULT_IPFS_GATEWAY_READY_TIMEOUT_MS
    );
  const retryIntervalMs =
    options.retryIntervalMs ??
    readPositiveMsEnv(
      IPFS_GATEWAY_RETRY_INTERVAL_ENV,
      DEFAULT_IPFS_GATEWAY_RETRY_INTERVAL_MS
    );
  const defaultFetchTimeoutMs = readPositiveMsEnv(
    IPFS_GATEWAY_FETCH_TIMEOUT_ENV,
    DEFAULT_IPFS_GATEWAY_FETCH_TIMEOUT_MS
  );
  const deadline = Date.now() + timeoutMs;

  let lastError = "unknown error";

  while (Date.now() <= deadline) {
    try {
      const controller = new AbortController();
      const fetchTimeoutMs = Math.min(
        options.fetchTimeoutMs ?? defaultFetchTimeoutMs,
        Math.max(1, deadline - Date.now())
      );
      const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs);
      try {
        const response = await fetch(gatewayUrl, {
          method: "HEAD",
          headers: {
            Connection: "close",
          },
          signal: controller.signal,
        });

        if (response.ok || response.status === 429) {
          return;
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (Date.now() + retryIntervalMs > deadline) {
        break;
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, retryIntervalMs));
    }
  }

  throw new Error(
    `Timed out waiting for agent card gateway URL '${gatewayUrl}' to become ready. Last error: ${lastError}`
  );
}

export async function validatePublicAgentCardGatewayUrl(
  gatewayUrl: string
): Promise<void> {
  const timeoutMs = readPositiveMsEnv(
    IPFS_GATEWAY_READY_TIMEOUT_ENV,
    DEFAULT_IPFS_GATEWAY_READY_TIMEOUT_MS
  );
  const retryIntervalMs = readPositiveMsEnv(
    IPFS_GATEWAY_RETRY_INTERVAL_ENV,
    DEFAULT_IPFS_GATEWAY_RETRY_INTERVAL_MS
  );
  const fetchTimeoutMs = readPositiveMsEnv(
    IPFS_GATEWAY_FETCH_TIMEOUT_ENV,
    DEFAULT_IPFS_GATEWAY_FETCH_TIMEOUT_MS
  );

  await waitForAgentCardGatewayUrlReady(gatewayUrl, {
    timeoutMs,
    retryIntervalMs,
    fetchTimeoutMs,
  });

  await validatePublicAgentCardUrl(gatewayUrl, {
    timeoutMs,
    retryIntervalMs,
    attemptTimeoutMs: fetchTimeoutMs,
  });
}

export async function runIpfsSubmitAgentCardPinataCli(
  identityPath: string
): Promise<string> {
  try {
    await execFileAsync(
      PNPM_EXECUTABLE,
      ["exec", "tsx", "src/cli/ipfs-submit-agent-card-pinata.ts"],
      {
        cwd: getProjectRoot(),
        env: {
          ...process.env,
          AGENT_IDENTITY_CONFIG_PATH: identityPath,
        },
        maxBuffer: 1024 * 1024,
      }
    );
  } catch (error) {
    const failure = error as {
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    throw new Error(
      "ipfs-submit-agent-card-pinata failed. " +
        [failure.message, failure.stdout, failure.stderr]
          .filter(Boolean)
          .join("\n")
    );
  }

  const gatewayUrl = await readAgentCardGatewayUrl(identityPath);
  if (!gatewayUrl) {
    throw new Error(
      "Pinata CLI completed but no agent_card_gateway_url was written to the identity file."
    );
  }

  await waitForAgentCardGatewayUrlReady(gatewayUrl);
  return gatewayUrl;
}
