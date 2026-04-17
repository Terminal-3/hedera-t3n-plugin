import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatOpenAI } from "@langchain/openai";

import {
  getReadyDemoModelConfig,
  type DemoModelConfig,
} from "../shared/demo-model-config.js";

export function getChatModelConfig(): DemoModelConfig {
  return getReadyDemoModelConfig();
}

export function createChatModel(): BaseChatModel {
  const config = getChatModelConfig();

  if (config.provider === "groq") {
    return new ChatOpenAI({
      model: config.model,
      apiKey: config.providerApiKey,
      configuration: {
        baseURL: config.providerBaseUrl,
      },
      temperature: 0,
    });
  }

  return new ChatOpenAI({
    model: config.model,
    apiKey: config.providerApiKey,
    configuration: {
      baseURL: config.providerBaseUrl,
    },
  });
}
