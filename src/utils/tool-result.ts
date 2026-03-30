/**
 * Purpose: Shared types and helpers for Hedera Agent Kit tool results
 * Scope:   Provides a standardised shape for success/error returns
 */

/** Canonical return type for every tool's execute / outputParser. */
export interface ToolResult {
  raw: Record<string, unknown>;
  humanMessage: string;
}

/**
 * Returns a string message from a caught value (Error or unknown).
 * Single source of truth for error-to-message conversion in tool details and user-facing messages.
 */
export function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

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
