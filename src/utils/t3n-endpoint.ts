import type { Environment } from "./environment.js";

export function isLocalhostUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    const normalized = url.trim().toLowerCase();
    return (
      normalized.includes("localhost") ||
      normalized.includes("127.0.0.1") ||
      normalized.includes("[::1]")
    );
  }
}

export function getT3nEndpointMode(
  networkTier: Environment,
  t3nApiBaseUrl: string | undefined
): string {
  if (!t3nApiBaseUrl) {
    return networkTier === "local"
      ? "local/mock (no network call)"
      : "endpoint unavailable";
  }

  if (isLocalhostUrl(t3nApiBaseUrl)) {
    return networkTier === "local"
      ? "local CCF"
      : "local CCF override (Hedera remains non-local)";
  }

  if (networkTier === "testnet") {
    return "public staging";
  }
  if (networkTier === "mainnet") {
    return "public production";
  }

  return "custom remote endpoint";
}
