import { ChatPromptTemplate } from "@langchain/core/prompts";
import { Client, PrivateKey } from "@hashgraph/sdk";
import { AgentExecutor, createToolCallingAgent } from "@langchain/classic/agents";
import { BufferMemory } from "@langchain/classic/memory";
import { AgentMode, HederaLangchainToolkit } from "hedera-agent-kit";
import dotenv from "dotenv";
import { hederaT3nPlugin } from "@terminal3/hedera-t3n-plugin";
import prompts from "prompts";

import { createChatModel, getChatModelConfig } from "./model.js";
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
  const llm = createChatModel();

  const client = createHederaClient();
  const hederaAgentToolkit = new HederaLangchainToolkit({
    client,
    configuration: {
      tools: [...GUIDED_ACTION_TOOL_METHODS],
      plugins: [hederaT3nPlugin],
      context: {
        mode: AgentMode.AUTONOMOUS,
      },
    },
  });

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", "You are a helpful assistant with access to curated Hedera T3N tools."],
    ["placeholder", "{chat_history}"],
    ["human", "{input}"],
    ["placeholder", "{agent_scratchpad}"],
  ]);

  // LangChain's tool typing can recurse deeply with zod-heavy tool definitions.
  const tools = hederaAgentToolkit.getTools() as any;
  const agent = createToolCallingAgent({
    llm,
    tools,
    prompt,
  });

  const memory = new BufferMemory({
    memoryKey: "chat_history",
    inputKey: "input",
    outputKey: "output",
    returnMessages: true,
  });

  const agentExecutor = new AgentExecutor({
    agent,
    tools,
    memory,
    returnIntermediateSteps: false,
  });

  console.log("Hedera T3N LangChain Chatbot — type \"exit\" to quit");
  console.log(
    `Model: ${modelConfig.provider}:${modelConfig.model} (${modelConfig.providerBaseUrl})`
  );
  console.log("Loaded Guided Actions tool set:");
  for (const tool of tools) {
    console.log(`- ${tool.name}`);
  }
  console.log("");

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

    try {
      const response = await agentExecutor.invoke({ input: userInput });
      console.log(`AI: ${response?.output ?? response}`);
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
