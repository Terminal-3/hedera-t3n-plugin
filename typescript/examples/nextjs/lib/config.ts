import path from "path";

import { z } from "zod";

import { loadDemoServerEnv } from "@/lib/server/load-env";

const providerSchema = z.enum(["ollama", "openai", "openai-compatible"]);

const envSchema = z.object({
  DEMO_MODEL_PROVIDER: providerSchema.default("ollama"),
  DEMO_MODEL: z.string().trim().min(1).default("qwen2.5"),
  OLLAMA_BASE_URL: z.string().trim().optional(),
  OPENAI_API_KEY: z.string().trim().optional(),
  OPENAI_BASE_URL: z.string().trim().optional(),
  OPENAI_COMPATIBLE_BASE_URL: z.string().trim().optional(),
  OPENAI_COMPATIBLE_API_KEY: z.string().trim().optional(),
  AGENT_IDENTITY_CONFIG_PATH: z.string().trim().optional(),
  HEDERA_NETWORK: z.enum(["local", "testnet", "mainnet"]).default("testnet"),
});

export type DemoConfig = ReturnType<typeof getDemoConfig>;

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/$/, "");
}

function ensureV1Path(baseUrl: string): string {
  return baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
}

export function getDemoConfig() {
  loadDemoServerEnv();
  const parsed = envSchema.parse(process.env);
  const provider = parsed.DEMO_MODEL_PROVIDER;
  const ollamaBaseUrl = normalizeBaseUrl(parsed.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434");

  return {
    provider,
    model: parsed.DEMO_MODEL,
    hederaNetwork: parsed.HEDERA_NETWORK,
    identityConfigPath: parsed.AGENT_IDENTITY_CONFIG_PATH,
    storageDir: path.resolve(process.cwd(), "demo-data"),
    providerBaseUrl:
      provider === "ollama"
        ? ensureV1Path(ollamaBaseUrl)
        : provider === "openai-compatible"
          ? normalizeBaseUrl(
              parsed.OPENAI_COMPATIBLE_BASE_URL ?? ensureV1Path(ollamaBaseUrl)
            )
          : normalizeBaseUrl(parsed.OPENAI_BASE_URL ?? "https://api.openai.com/v1"),
    providerApiKey:
      provider === "ollama"
        ? parsed.OPENAI_COMPATIBLE_API_KEY ?? "ollama"
        : provider === "openai-compatible"
          ? parsed.OPENAI_COMPATIBLE_API_KEY
          : parsed.OPENAI_API_KEY,
  };
}

export function getProviderReadiness() {
  const config = getDemoConfig();
  if (config.provider === "openai" && !config.providerApiKey) {
    return {
      ready: false,
      reason: "OPENAI_API_KEY is missing.",
    };
  }

  if (config.provider === "openai-compatible" && !config.providerBaseUrl) {
    return {
      ready: false,
      reason: "OPENAI_COMPATIBLE_BASE_URL is missing.",
    };
  }

  return {
    ready: true,
    reason: null,
  };
}
