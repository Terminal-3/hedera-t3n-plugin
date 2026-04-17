/**
 * Purpose: Health check utility for supported E2E LLM services
 * Scope:   Checks if Ollama is reachable and specified model is available, or Groq config exists
 * Inputs:  Provider config and optional timeout
 * Outputs: Health check result with availability status and available models list
 */

const DEFAULT_HEALTH_CHECK_TIMEOUT_MS = 10_000;

type OllamaTagsResponse = {
  models?: { name: string }[];
};

export type LlmHealthCheckResult = {
  ok: boolean;
  reason?: string;
  availableModels?: string[];
};

export async function checkLlmHealth({
  provider,
  baseUrl,
  model,
  apiKey,
  timeoutMs = DEFAULT_HEALTH_CHECK_TIMEOUT_MS,
}: {
  provider: "ollama" | "groq" | "openrouter";
  baseUrl?: string;
  model: string;
  apiKey?: string;
  timeoutMs?: number;
}): Promise<LlmHealthCheckResult> {
  if (provider === "groq") {
    return apiKey
      ? { ok: true, availableModels: [model] }
      : { ok: false, reason: "GROQ_API_KEY is missing." };
  }

  if (provider === "openrouter") {
    if (!apiKey) {
      return { ok: false, reason: "OPENROUTER_API_KEY is missing." };
    }
    if (!baseUrl) {
      return { ok: false, reason: "OPENROUTER_BASE_URL is missing." };
    }
    return { ok: true, availableModels: [model] };
  }

  if (!baseUrl) {
    return { ok: false, reason: "OLLAMA_BASE_URL is missing." };
  }

  return checkOllamaHealth(baseUrl, model, timeoutMs);
}

export async function checkOllamaHealth(
  baseUrl: string,
  model: string,
  timeoutMs = DEFAULT_HEALTH_CHECK_TIMEOUT_MS
): Promise<LlmHealthCheckResult> {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${normalizedBaseUrl}/api/tags`, {
      signal: controller.signal,
    });

    if (!res.ok) {
      return {
        ok: false,
        reason: `Ollama returned HTTP ${res.status}`,
      };
    }

    const data = (await res.json()) as OllamaTagsResponse;
    const models = data?.models ?? [];
    const hasModel = models.some(
      (entry) => entry.name === model || entry.name.startsWith(`${model}:`)
    );
    if (!hasModel) {
      return {
        ok: false,
        reason: `Model "${model}" not found on Ollama server.`,
        availableModels: models.map((entry) => entry.name),
      };
    }

    return {
      ok: true,
      availableModels: models.map((entry) => entry.name),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      reason: `Ollama unreachable or timed out. ${message}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}
