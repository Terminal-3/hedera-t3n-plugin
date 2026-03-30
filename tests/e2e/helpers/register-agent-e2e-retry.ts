/**
 * E2E-only: wait for `/healthz` then retry `registerAgentErc8004` on transient T2T/decaps errors.
 */

import {
  registerAgentErc8004,
  type RegisterAgentErc8004Options,
} from "../../../src/registerAgentErc8004.js";
import { resolveT3nBaseUrl } from "../../../src/utils/t3n.js";

import { waitForT3nApiReady } from "./wait-t3n-api-ready.js";

const MAX_ATTEMPTS = 4;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetriableT2tRegistrationError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return message.includes("t2t decaps failed") && message.includes("channel closed");
}

export async function registerAgentErc8004WithE2eRetry(
  options: RegisterAgentErc8004Options
): Promise<Awaited<ReturnType<typeof registerAgentErc8004>>> {
  const env = options.env ?? process.env;
  const baseUrl = await resolveT3nBaseUrl("testnet", { env });
  await waitForT3nApiReady(baseUrl);

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await registerAgentErc8004(options);
    } catch (error) {
      lastError = error;
      const canRetry =
        attempt < MAX_ATTEMPTS && isRetriableT2tRegistrationError(error);
      if (!canRetry) {
        throw error;
      }
      const backoffMs = 500 * 2 ** (attempt - 1) + Math.floor(Math.random() * 200);
      console.warn(
        `[e2e] registerAgentErc8004 attempt ${attempt}/${MAX_ATTEMPTS} failed (${String(error)}); retrying in ${backoffMs}ms`
      );
      await sleep(backoffMs);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("registerAgentErc8004WithE2eRetry: unexpected failure");
}
