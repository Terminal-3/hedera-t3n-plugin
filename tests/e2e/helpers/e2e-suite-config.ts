import { describe } from "vitest";

import { parseE2eOptions } from "./e2e-options.js";
import { checkLlmHealth, type LlmHealthCheckResult } from "./llm-health-check.js";

void parseE2eOptions(process.argv.slice(2));

const GROQ_API_KEY = process.env.GROQ_API_KEY?.trim();
const GROQ_MODEL = process.env.GROQ_MODEL?.trim() || "llama-3.3-70b-versatile";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY?.trim();
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL?.trim() || "openai/gpt-4o-mini";
const OPENROUTER_BASE_URL =
  process.env.OPENROUTER_BASE_URL?.trim() || "https://openrouter.ai/api/v1";
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL?.trim();
const OLLAMA_MODEL = process.env.OLLAMA_MODEL?.trim();

export const LLM_PROVIDER = GROQ_API_KEY ? "groq" : OPENROUTER_API_KEY ? "openrouter" : "ollama";
export const LLM_MODEL =
  LLM_PROVIDER === "groq"
    ? GROQ_MODEL
    : LLM_PROVIDER === "openrouter"
      ? OPENROUTER_MODEL
      : OLLAMA_MODEL;
export const LLM_BASE_URL =
  LLM_PROVIDER === "ollama"
    ? OLLAMA_BASE_URL
    : LLM_PROVIDER === "openrouter"
      ? OPENROUTER_BASE_URL
      : undefined;
export const LLM_API_KEY =
  LLM_PROVIDER === "groq"
    ? GROQ_API_KEY
    : LLM_PROVIDER === "openrouter"
      ? OPENROUTER_API_KEY
      : undefined;
export const IDEMPOTENT_SIDE_EFFECT_INVOCATION =
  LLM_PROVIDER === "ollama"
    ? ({ disallowUnexpectedToolCalls: true } as const)
    : ({ disallowUnexpectedToolCalls: false } as const);

export const LLM_PROVIDER_DISPLAY =
  LLM_PROVIDER === "groq"
    ? "Groq"
    : LLM_PROVIDER === "openrouter"
      ? "OpenRouter"
      : "Ollama";
export const LLM_MODEL_DISPLAY = LLM_MODEL?.trim() || "unknown-model";

const accountId = process.env.HEDERA_ACCOUNT_ID;
const privateKey = process.env.HEDERA_PRIVATE_KEY;

export const E2E_USER_DID = "did:t3n:0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a";

export const AUTH_AGENT_CONTEXT_USER_PROMPT =
  "Inspect my agent readiness. Call AUTH_AGENT_CONTEXT exactly once with no arguments and no prose.";
export const AUTH_AGENT_CONTEXT_FOLLOW_UP_PROMPT =
  "Now emit exactly one AUTH_AGENT_CONTEXT tool call with {} as arguments and no prose.";
export const PRIVATE_DATA_PROCESSING_USER_PROMPT =
  `Run private data processing for ${E2E_USER_DID}. Call PRIVATE_DATA_PROCESSING exactly once with {"userDid":"${E2E_USER_DID}","fields":["first_name","email_address","favorite_color"]} and no prose.`;
export const PRIVATE_DATA_PROCESSING_FOLLOW_UP_PROMPT =
  `Call PRIVATE_DATA_PROCESSING exactly once now with {"userDid":"${E2E_USER_DID}","fields":["first_name","email_address","favorite_color"]} and no prose.`;

export type AuthAgentContextToolParsedRaw = {
  success?: boolean;
  ready?: boolean;
  identity?: {
    available?: boolean;
    valid?: boolean;
    path?: string | null;
    error?: string | null;
  };
  session?: {
    available?: boolean;
    authenticated?: boolean;
    did?: string | null;
    network?: string | null;
    error?: string | null;
  };
  registration?: {
    status?: string;
    error?: string | null;
  };
  nextSteps?: string[];
};

export type PrivateDataProcessingToolParsedRaw = {
  success?: boolean;
  error?: string;
  userDid?: string;
  fieldExistence?: Record<string, boolean>;
  missingFields?: string[];
  unsupportedFields?: Array<{ field?: string; reason?: string }>;
  guidance?: {
    profileUrl?: string | null;
    onboardingUrl?: string | null;
    steps?: string[];
  };
  authReady?: boolean;
  authError?: string;
};

export type RequiredConfig = {
  provider: "ollama" | "groq" | "openrouter";
  baseUrl: string;
  model: string;
  apiKey?: string;
  accountId: string;
  privateKey: string;
};

export function assertNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Expected non-empty ${label}.`);
  }
  return value;
}

export function assertPathsMatch(expected: string, actual: string, label: string): void {
  const resolvedExpected = new URL(`file://${expected}`).pathname;
  const resolvedActual = new URL(`file://${actual}`).pathname;
  if (resolvedExpected !== resolvedActual) {
    throw new Error(`${label} path mismatch. Expected ${expected}. Got ${actual}.`);
  }
}

export function getRequiredConfig(): RequiredConfig | null {
  if (typeof accountId !== "string" || typeof privateKey !== "string") {
    return null;
  }

  if (LLM_PROVIDER === "groq") {
    if (!GROQ_API_KEY || !LLM_MODEL) {
      return null;
    }
    return {
      provider: "groq",
      baseUrl: "https://api.groq.com/openai/v1",
      model: LLM_MODEL,
      apiKey: GROQ_API_KEY,
      accountId,
      privateKey,
    };
  }

  if (LLM_PROVIDER === "openrouter") {
    if (!OPENROUTER_API_KEY || !OPENROUTER_MODEL || !OPENROUTER_BASE_URL) {
      return null;
    }
    return {
      provider: "openrouter",
      baseUrl: OPENROUTER_BASE_URL,
      model: OPENROUTER_MODEL,
      apiKey: OPENROUTER_API_KEY,
      accountId,
      privateKey,
    };
  }

  if (!OLLAMA_BASE_URL || !OLLAMA_MODEL) {
    return null;
  }

  return {
    provider: "ollama",
    baseUrl: OLLAMA_BASE_URL,
    model: OLLAMA_MODEL,
    accountId,
    privateKey,
  };
}

let healthCheck: LlmHealthCheckResult | null = null;
let skipReason: string | undefined;

if (!accountId || !privateKey) {
  skipReason = "Hedera credentials not set (HEDERA_ACCOUNT_ID, HEDERA_PRIVATE_KEY).";
} else {
  healthCheck = await checkLlmHealth({
    provider: LLM_PROVIDER,
    baseUrl: LLM_BASE_URL,
    model: LLM_MODEL ?? "",
    apiKey: LLM_API_KEY,
  });
  if (!healthCheck.ok) {
    skipReason = `LLM health check failed. ${healthCheck.reason ?? "Provider unreachable."}`;
  }
}

if (skipReason) {
  console.warn(`E2E skipped: ${skipReason}`);
}

export const healthCheckResult = healthCheck;
export const e2eSkipReason = skipReason;
export const describeE2e = skipReason ? describe.skip : describe.sequential;
