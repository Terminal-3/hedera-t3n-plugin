/**
 * Purpose: Shared timeout and retry constants for network-facing workflows
 * Scope:   Centralises durable default timings used across registration and T3N utilities
 * Inputs:  None
 * Outputs: Named numeric constants
 */

export const AGENT_CARD_FETCH_TIMEOUT_MS = 20_000;
export const AGENT_CARD_FETCH_ATTEMPT_TIMEOUT_MS = 5_000;
export const AGENT_CARD_FETCH_RETRY_INTERVAL_MS = 2_000;

export const DEFAULT_AGENT_RECORD_TIMEOUT_MS = 10_000;
export const DEFAULT_REGISTRATION_POLL_INTERVAL_MS = 500;
