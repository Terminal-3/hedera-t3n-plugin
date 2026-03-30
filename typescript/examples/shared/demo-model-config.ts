import { existsSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

export type DemoModelProvider = "ollama" | "openai" | "openai-compatible";

export type DemoModelConfig = {
  model: string;
  provider: DemoModelProvider;
  providerApiKey?: string;
  providerBaseUrl: string;
};

let pluginEnvLoaded = false;

function stripWrappingQuotes(value: string): string {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function loadEnvFile(filePath: string): void {
  const content = readFileSync(filePath, "utf8");

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    process.env[key] = stripWrappingQuotes(line.slice(separatorIndex + 1).trim());
  }
}

function loadPluginEnv(): void {
  if (pluginEnvLoaded) {
    return;
  }

  pluginEnvLoaded = true;

  const sharedDir = path.dirname(fileURLToPath(import.meta.url));
  const pluginRoot = path.resolve(sharedDir, "../../../");
  const candidatePaths = [
    path.resolve(pluginRoot, ".env"),
    path.resolve(pluginRoot, ".env.secret.pinata"),
  ];

  for (const candidatePath of candidatePaths) {
    if (existsSync(candidatePath)) {
      loadEnvFile(candidatePath);
    }
  }
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/$/, "");
}

function ensureV1Path(baseUrl: string): string {
  return baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
}

function parseProvider(value: string | undefined): DemoModelProvider {
  const normalized = value?.trim();
  if (!normalized) {
    return "ollama";
  }

  if (
    normalized === "ollama" ||
    normalized === "openai" ||
    normalized === "openai-compatible"
  ) {
    return normalized;
  }

  throw new Error(
    `Unsupported DEMO_MODEL_PROVIDER "${normalized}". Expected ollama, openai, or openai-compatible.`
  );
}

function getOptionalEnv(key: string): string | undefined {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
}

export function getDemoModelConfig(): DemoModelConfig {
  loadPluginEnv();

  const provider = parseProvider(process.env.DEMO_MODEL_PROVIDER);
  const model = getOptionalEnv("DEMO_MODEL") ?? "qwen2.5";
  const ollamaBaseUrl = normalizeBaseUrl(
    getOptionalEnv("OLLAMA_BASE_URL") ?? "http://127.0.0.1:11434"
  );

  return {
    provider,
    model,
    providerBaseUrl:
      provider === "ollama"
        ? ensureV1Path(ollamaBaseUrl)
        : provider === "openai-compatible"
          ? normalizeBaseUrl(
              getOptionalEnv("OPENAI_COMPATIBLE_BASE_URL") ?? ensureV1Path(ollamaBaseUrl)
            )
          : normalizeBaseUrl(getOptionalEnv("OPENAI_BASE_URL") ?? "https://api.openai.com/v1"),
    providerApiKey:
      provider === "ollama"
        ? getOptionalEnv("OPENAI_COMPATIBLE_API_KEY") ?? "ollama"
        : provider === "openai-compatible"
          ? getOptionalEnv("OPENAI_COMPATIBLE_API_KEY")
          : getOptionalEnv("OPENAI_API_KEY"),
  };
}

export function getReadyDemoModelConfig(): DemoModelConfig {
  const config = getDemoModelConfig();

  if (config.provider === "openai" && !config.providerApiKey) {
    throw new Error(
      "OPENAI_API_KEY is missing. Set OPENAI_API_KEY or switch DEMO_MODEL_PROVIDER=ollama."
    );
  }

  if (config.provider === "openai-compatible" && !config.providerBaseUrl) {
    throw new Error("OPENAI_COMPATIBLE_BASE_URL is missing.");
  }

  return config;
}
