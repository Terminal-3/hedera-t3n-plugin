import { z } from "zod";

import type { Context, Tool } from "hedera-agent-kit";

import { buildErrorResult, messageFromError, type ToolResult } from "../utils/tool-result.js";
import { createOrReuseT3nSessionFromIdentity } from "../utils/t3n-session.js";

const createT3nAuthSessionParamsSchema = z.object({}).strict();
const CREATE_SESSION_MAX_ATTEMPTS = 3;
const CREATE_SESSION_RETRY_BASE_DELAY_MS = 300;

function parseToolOutput(rawOutput: string): ToolResult {
  const trimmed = rawOutput?.trim() ?? "";
  if (!trimmed || trimmed.startsWith("Error:") || trimmed.startsWith("error:")) {
    return buildErrorResult(trimmed || rawOutput);
  }
  try {
    const parsed = JSON.parse(rawOutput) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return buildErrorResult(rawOutput);
    }
    const obj = parsed as { raw?: Record<string, unknown>; humanMessage?: string };
    return {
      raw: obj.raw ?? {},
      humanMessage: obj.humanMessage ?? "",
    };
  } catch {
    return buildErrorResult(rawOutput);
  }
}

function sanitizeCreateSessionError(error: unknown): ToolResult {
  const message = messageFromError(error);
  const normalized = message.toLowerCase();

  if (
    normalized.includes("agent identity configuration path not set") ||
    normalized.includes("agent identity configuration file not found") ||
    (normalized.includes("identity configuration at ") && normalized.includes(" is empty"))
  ) {
    return buildErrorResult(
      "IDENTITY_CONFIG_MISSING",
      "Agent identity configuration is not available. Run `pnpm create-identity` and set `AGENT_IDENTITY_CONFIG_PATH`, then retry."
    );
  }

  if (
    normalized.includes("invalid json") ||
    normalized.includes("valid identity configuration format") ||
    normalized.includes("must be a json object") ||
    normalized.includes("is not a file") ||
    normalized.includes("cannot access the file") ||
    normalized.includes("cannot read the file")
  ) {
    return buildErrorResult(
      "IDENTITY_CONFIG_INVALID",
      "Agent identity configuration is invalid. Regenerate or fix the local identity file before retrying."
    );
  }

  return buildErrorResult(
    "T3N_AUTH_SESSION_FAILED",
    "T3N authentication session could not be created. Check local configuration and T3N connectivity, then retry."
  );
}

function isRetriableCreateSessionError(error: unknown): boolean {
  const normalized = messageFromError(error).toLowerCase();

  return (
    normalized.includes("http 5") ||
    normalized.includes("bad gateway") ||
    normalized.includes("gateway timeout") ||
    normalized.includes("service unavailable") ||
    normalized.includes("timed out") ||
    normalized.includes("timeout") ||
    normalized.includes("fetch failed") ||
    normalized.includes("network error") ||
    normalized.includes("socket hang up") ||
    normalized.includes("econnreset") ||
    normalized.includes("econnrefused")
  );
}

function waitForRetry(attempt: number): Promise<void> {
  const delayMs = attempt * CREATE_SESSION_RETRY_BASE_DELAY_MS;
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

export const createT3nAuthSessionTool = (_context: Context): Tool => ({
  method: "create_t3n_auth_session",
  name: "CREATE_T3N_AUTH_SESSION",
  description:
    "Create or reuse an authenticated T3N SDK session using the private key stored in the local agent identity configuration file.",
  parameters: createT3nAuthSessionParamsSchema,
  outputParser: parseToolOutput,
  execute: async (
    _client: unknown,
    _context: Context,
    params: unknown
  ): Promise<ToolResult> => {
    const parsedParams = createT3nAuthSessionParamsSchema.safeParse(params ?? {});
    if (!parsedParams.success) {
      return buildErrorResult(
        "INVALID_PARAMETERS",
        "Invalid parameters. This tool does not accept any parameters."
      );
    }

    let lastError: unknown;
    for (let attempt = 1; attempt <= CREATE_SESSION_MAX_ATTEMPTS; attempt += 1) {
      try {
        const session = await createOrReuseT3nSessionFromIdentity();
        return {
          raw: {
            success: true,
            did: session.did,
            reused: session.reused,
            network: session.networkTier,
          },
          humanMessage: session.reused
            ? "T3N authentication session already exists and is valid."
            : "T3N authentication session created successfully.",
        };
      } catch (error) {
        lastError = error;
        const shouldRetry =
          attempt < CREATE_SESSION_MAX_ATTEMPTS && isRetriableCreateSessionError(error);
        if (shouldRetry) {
          await waitForRetry(attempt);
          continue;
        }

        return sanitizeCreateSessionError(error);
      }
    }

    return sanitizeCreateSessionError(lastError);
  },
});
