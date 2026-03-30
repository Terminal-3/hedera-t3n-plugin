import { Client, PrivateKey } from "@hashgraph/sdk";
import { generateText, stepCountIs, wrapLanguageModel } from "ai";
import { AgentMode, HederaAIToolkit } from "hedera-agent-kit";
import dotenv from "dotenv";
import { hederaT3nPlugin } from "@terminal3/hedera-t3n-plugin";
import prompts from "prompts";

import { getChatModel, getChatModelConfig } from "./model.js";
import { GUIDED_ACTION_TOOL_METHODS } from "../shared/guided-action-tools.js";

dotenv.config();

function getRequiredEnv(...keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }

  throw new Error(`Missing required environment variable. Expected one of: ${keys.join(", ")}`);
}

function createHederaClient(): Client {
  const network = (process.env.HEDERA_NETWORK ?? "testnet").toLowerCase();
  const client = network === "mainnet" ? Client.forMainnet() : Client.forTestnet();

  return client.setOperator(
    getRequiredEnv("HEDERA_ACCOUNT_ID"),
    PrivateKey.fromStringECDSA(getRequiredEnv("HEDERA_PRIVATE_KEY"))
  );
}

export async function bootstrap(): Promise<void> {
  const modelConfig = getChatModelConfig();
  const client = createHederaClient();
  const hederaAgentToolkit = new HederaAIToolkit({
    client,
    configuration: {
      tools: [...GUIDED_ACTION_TOOL_METHODS],
      plugins: [hederaT3nPlugin],
      context: {
        mode: AgentMode.AUTONOMOUS,
      },
    },
  });

  const model = wrapLanguageModel({
    model: getChatModel(),
    middleware: hederaAgentToolkit.middleware(),
  });
  const tools = hederaAgentToolkit.getTools() as never;
  const stopWhen = stepCountIs(2) as never;

  console.log("Hedera T3N AI SDK Chatbot with Plugin Support — type \"exit\" to quit");
  console.log(
    `Model: ${modelConfig.provider}:${modelConfig.model} (${modelConfig.providerBaseUrl})`
  );
  console.log("Loaded Guided Actions tool set:");
  for (const toolName of Object.keys(hederaAgentToolkit.getTools())) {
    console.log(`- ${toolName}`);
  }
  console.log("");

  const conversationHistory: { role: "user" | "assistant"; content: string }[] = [];

  while (true) {
    const { userInput } = await prompts({
      type: "text",
      name: "userInput",
      message: "You",
    });

    if (!userInput || ["exit", "quit"].includes(userInput.trim().toLowerCase())) {
      console.log("Goodbye!");
      break;
    }

    conversationHistory.push({ role: "user", content: userInput });

    try {
      const response = await generateText({
        model,
        messages: conversationHistory,
        tools,
        stopWhen,
      });

      conversationHistory.push({ role: "assistant", content: response.text });
      console.log(`AI: ${response.text}`);
    } catch (error) {
      console.error("Error:", error);
    }
  }
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  bootstrap().catch((error: unknown) => {
    console.error("Fatal error during CLI bootstrap:", error);
    process.exitCode = 1;
  });
}
