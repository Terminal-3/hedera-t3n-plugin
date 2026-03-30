import { ChatOpenAI } from "@langchain/openai";

import {
  getReadyDemoModelConfig,
  type DemoModelConfig,
} from "../shared/demo-model-config.js";

export function getChatModelConfig(): DemoModelConfig {
  return getReadyDemoModelConfig();
}

export function createChatModel(): ChatOpenAI {
  const config = getChatModelConfig();

  return new ChatOpenAI({
    model: config.model,
    apiKey: config.providerApiKey,
    configuration: {
      baseURL: config.providerBaseUrl,
    },
  });
}
