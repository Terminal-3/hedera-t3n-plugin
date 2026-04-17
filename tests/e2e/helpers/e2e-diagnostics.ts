import type { T3nSessionState } from "../../../src/utils/t3n-session.js";

type SessionSummary =
  | {
      valid: true;
      did: string;
      networkTier: string;
      baseUrl: string;
      identityPath: string;
    }
  | {
      valid: false;
      reason: string;
    };

export function summarizeT3nSessionState(sessionState: T3nSessionState): SessionSummary {
  if (!sessionState.isValid) {
    return {
      valid: false,
      reason: sessionState.reason,
    };
  }

  return {
    valid: true,
    did: sessionState.did,
    networkTier: sessionState.networkTier,
    baseUrl: sessionState.baseUrl,
    identityPath: sessionState.identityPath,
  };
}

export function formatFailureDiagnostics(context: {
  provider: string;
  model: string | undefined;
  threadId: string;
  identityPath: string;
  identityFileExistedBefore: boolean;
  sessionBefore: SessionSummary;
  sessionAfter: SessionSummary;
  parsedToolNames: string[];
  rawPayload: unknown;
}): string {
  return [
    "Failure diagnostics:",
    `provider=${context.provider}`,
    `model=${context.model ?? "unknown"}`,
    `threadId=${context.threadId}`,
    `identityPath=${context.identityPath}`,
    `identityFileExistedBefore=${String(context.identityFileExistedBefore)}`,
    `sessionBefore=${JSON.stringify(context.sessionBefore)}`,
    `sessionAfter=${JSON.stringify(context.sessionAfter)}`,
    `parsedToolNames=${JSON.stringify(context.parsedToolNames)}`,
    `rawPayload=${JSON.stringify(context.rawPayload)}`,
  ].join("\n");
}
