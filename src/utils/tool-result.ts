/**
 * Purpose: Shared types and helpers for Hedera Agent Kit tool results
 * Scope:   Provides a standardised shape for success/error returns
 */

/** Canonical return type for every tool's execute / outputParser. */
export interface ToolResult {
  raw: Record<string, unknown>;
  humanMessage: string;
}

export { messageFromError } from "./error-utils.js";

/**
 * Build a standardised error result for a tool.
 *
 * @param error   - Short machine-readable error description
 * @param humanMessage - Human-friendly explanation (defaults to `error`)
 * @param extra   - Optional extra fields merged into `raw` (e.g. `path`, `details`)
 */
export function buildErrorResult(
  error: string,
  humanMessage?: string,
  extra?: Record<string, unknown>
): ToolResult {
  return {
    raw: { success: false, error, ...extra },
    humanMessage: humanMessage ?? error,
  };
}

export function parseToolOutput(rawOutput: string): ToolResult {
  const trimmed = rawOutput?.trim() ?? "";
  if (!trimmed || trimmed.startsWith("Error:") || trimmed.startsWith("error:")) {
    return buildErrorResult(trimmed || rawOutput);
  }

  try {
    const parsed = JSON.parse(rawOutput) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
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
