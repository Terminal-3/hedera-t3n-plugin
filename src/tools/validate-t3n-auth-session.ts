import { z } from "zod";

import type { Context, Tool } from "hedera-agent-kit";

import { getValidatedT3nSessionState } from "../utils/t3n-session.js";
import { buildErrorResult, type ToolResult } from "../utils/tool-result.js";

const validateT3nAuthSessionParamsSchema = z.object({}).strict();

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

function buildInvalidSessionResult(
  reason: "no_session" | "not_authenticated" | "no_did"
): ToolResult {
  if (reason === "no_did") {
    return buildErrorResult(
      "T3N_AUTH_SESSION_INVALID",
      "The current T3N session is missing an authenticated DID. Recreate the session with `CREATE_T3N_AUTH_SESSION` and retry.",
      { isValid: false }
    );
  }

  return buildErrorResult(
    "NO_T3N_AUTH_SESSION",
    "No authenticated T3N session found. Call `CREATE_T3N_AUTH_SESSION` first.",
    { isValid: false }
  );
}

export const validateT3nAuthSessionTool = (_context: Context): Tool => ({
  method: "validate_t3n_auth_session",
  name: "VALIDATE_T3N_AUTH_SESSION",
  description:
    "Validate whether the current in-memory T3N session is authenticated and ready to use.",
  parameters: validateT3nAuthSessionParamsSchema,
  outputParser: parseToolOutput,
  execute: async (
    _client: unknown,
    _context: Context,
    params: unknown
  ): Promise<ToolResult> => {
    await Promise.resolve();

    const parsedParams = validateT3nAuthSessionParamsSchema.safeParse(params ?? {});
    if (!parsedParams.success) {
      return buildErrorResult(
        "INVALID_PARAMETERS",
        "Invalid parameters. This tool does not accept any parameters."
      );
    }

    const sessionState = getValidatedT3nSessionState();
    if (!sessionState.isValid) {
      return buildInvalidSessionResult(sessionState.reason);
    }

    return {
      raw: {
        success: true,
        isValid: true,
        did: sessionState.did,
        network: sessionState.networkTier,
      },
      humanMessage: "T3N authentication session is valid.",
    };
  },
});
