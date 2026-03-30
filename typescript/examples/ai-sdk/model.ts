import { createOpenAI } from "@ai-sdk/openai";

import {
  getReadyDemoModelConfig,
  type DemoModelConfig,
} from "../shared/demo-model-config.js";

export function getChatModelConfig(): DemoModelConfig {
  return getReadyDemoModelConfig();
}

export function getChatModel() {
  const config = getChatModelConfig();

  return createOpenAI({
    name: config.provider,
    apiKey: config.providerApiKey,
    baseURL: config.providerBaseUrl,
  }).chat(config.model as any);
}
