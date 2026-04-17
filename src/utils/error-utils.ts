/**
 * Purpose: Centralized error handling and classification for Hedera T3N plugin
 * Scope:   Error message extraction, network error detection, and domain-specific error classifiers
 */

/**
 * Returns a string message from a caught value (Error or unknown).
 */
export function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const NETWORK_ERROR_MARKERS = [
  "fetch failed",
  "network",
  "econnrefused",
  "enotfound",
  "etimedout",
  "timeout",
  "this operation was aborted",
  "aborted",
  "abort",
] as const;

/**
 * Detects if an error is likely a network connectivity issue.
 */
export function isLikelyNetworkError(error: unknown): boolean {
  const message = messageFromError(error).toLowerCase();
  const name = error instanceof Error ? error.name : "";

  return (
    name === "TypeError" ||
    name === "AbortError" ||
    NETWORK_ERROR_MARKERS.some((marker) => message.includes(marker))
  );
}

/**
 * Detects transient transport or gateway-layer errors worth retrying.
 */
export function isTransientNetworkOrGatewayError(error: unknown): boolean {
  if (isLikelyNetworkError(error)) return true;

  const message = messageFromError(error).toLowerCase();
  return ["http 429", "http 502", "http 503", "http 504"].some((marker) =>
    message.includes(marker)
  );
}

/**
 * Detects if a Hedera error indicates a missing record/token.
 */
export function isHederaRecordNotFoundError(error: unknown): boolean {
  const message = messageFromError(error).toLowerCase();

  return (
    message.includes("transaction receipt not found") ||
    message.includes("registered or uriupdated event not found") ||
    message.includes("registered event not found") ||
    message.includes("nonexistent token") ||
    message.includes("owner query for nonexistent token") ||
    message.includes("erc721nonexistenttoken") ||
    message.includes("invalid token id")
  );
}

const PROFILE_MISSING_PATTERNS = [
  "profile is required",
  "profile is missing",
  "profile does not exist",
  "user profile is required",
];

const PROFILE_AUTHORIZATION_PATTERNS = [
  "authorization error",
  "authorization denied",
  "unauthorized to access pii",
  "not authorized to access",
];

export function isProfileMissingErrorMessage(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return PROFILE_MISSING_PATTERNS.some((pattern) => normalized.includes(pattern));
}

export function isProfileAuthorizationErrorMessage(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return PROFILE_AUTHORIZATION_PATTERNS.some((pattern) => normalized.includes(pattern));
}

export type SanitizedSessionError = { code: string; step: string };

export function sanitizeSessionError(error: unknown): SanitizedSessionError {
  const message = messageFromError(error).toLowerCase();

  if (
    message.includes("agent identity configuration path not set") ||
    message.includes("agent identity configuration file not found") ||
    (message.includes("identity configuration at ") && message.includes(" is empty"))
  ) {
    return {
      code: "IDENTITY_CONFIG_MISSING",
      step: "Create an agent identity with `pnpm create-identity`, set `AGENT_IDENTITY_CONFIG_PATH`, then retry.",
    };
  }

  if (
    message.includes("invalid json") ||
    message.includes("valid identity configuration format") ||
    message.includes("must be a json object") ||
    message.includes("is not a file") ||
    message.includes("cannot access the file") ||
    message.includes("cannot read the file")
  ) {
    return {
      code: "IDENTITY_CONFIG_INVALID",
      step: "Fix or regenerate the local agent identity file before retrying.",
    };
  }

  return {
    code: "T3N_AUTH_SESSION_FAILED",
    step: "Check T3N connectivity and local credentials, then recreate the T3N auth session.",
  };
}
