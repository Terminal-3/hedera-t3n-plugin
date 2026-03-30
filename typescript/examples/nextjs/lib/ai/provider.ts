import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

import { getDemoConfig } from "@/lib/config";

export function getChatModel() {
  const config = getDemoConfig();

  if (config.provider === "openai") {
    return createOpenAI({
      apiKey: config.providerApiKey,
      baseURL: config.providerBaseUrl,
    }).chat(config.model);
  }

  return createOpenAICompatible({
    name: config.provider,
    apiKey: config.providerApiKey,
    baseURL: config.providerBaseUrl,
  }).chatModel(config.model);
}
