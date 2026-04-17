import { ChatPromptTemplate } from "@langchain/core/prompts";
import {
  Client,
  PrivateKey,
  Transaction,
} from "@hiero-ledger/sdk";
import { AgentExecutor, createToolCallingAgent } from "@langchain/classic/agents";
import { BufferMemory } from "@langchain/classic/memory";
import { AgentMode } from "@hashgraph/hedera-agent-kit";
import {
  HederaLangchainToolkit,
} from "@hashgraph/hedera-agent-kit-langchain";
import dotenv from "dotenv";
import { hederaT3nPlugin } from "@terminal3/hedera-t3n-plugin";
import prompts from "prompts";

import { createChatModel, getChatModelConfig } from "./model.js";
import { GUIDED_ACTION_TOOL_METHODS } from "../shared/guided-action-tools.js";
import { coreAccountPlugin } from "@hashgraph/hedera-agent-kit/plugins";

dotenv.config();

const RETURN_BYTES_TOOLS = [
  ...GUIDED_ACTION_TOOL_METHODS,
  "transfer_hbar_tool",
] as const;

function getRequiredEnv(...keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }

  throw new Error(`Missing required environment variable. Expected one of: ${keys.join(", ")}`);
}

function getOperatorAccountId(): string {
  return getRequiredEnv("HEDERA_ACCOUNT_ID");
}

function getOperatorPrivateKey(): string {
  return getRequiredEnv("HEDERA_PRIVATE_KEY");
}

function createHumanClient(): Client {
  return Client.forTestnet().setOperator(
    getOperatorAccountId(),
    PrivateKey.fromStringECDSA(getOperatorPrivateKey())
  );
}

export async function bootstrap(): Promise<void> {
  const modelConfig = getChatModelConfig();
  const llm = createChatModel();

  const operatorAccountId = getOperatorAccountId();
  const humanInTheLoopClient = createHumanClient();
  const agentClient = Client.forTestnet();

  const hederaAgentToolkit = new HederaLangchainToolkit({
    client: agentClient,
    configuration: {
      tools: [...RETURN_BYTES_TOOLS],
      plugins: [coreAccountPlugin, hederaT3nPlugin],
      context: {
        mode: AgentMode.RETURN_BYTES,
        accountId: operatorAccountId,
      },
    },
  });

  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      "You are a helpful assistant. T3N plugin tools return standard results, while transfer_hbar_tool can return raw transaction bytes in this mode.",
    ],
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
    returnIntermediateSteps: true,
  });

  console.log("Hedera T3N RETURN_BYTES Chatbot — type \"exit\" to quit");
  console.log(
    `Model: ${modelConfig.provider}:${modelConfig.model} (${modelConfig.providerBaseUrl})`
  );
  console.log("Loaded tools:");
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

      const bytes = extractBytesFromAgentResponse(response);
      if (bytes !== undefined && bytes !== null) {
        const realBytes = toBuffer(bytes);
        const transaction = Transaction.fromBytes(realBytes);
        const result = await transaction.execute(humanInTheLoopClient);
        const receipt = await result.getReceipt(humanInTheLoopClient);
        console.log("Transaction receipt:", receipt.status.toString());
        console.log("Transaction result:", result.transactionId.toString());
      } else {
        console.log("No transaction bytes found. This is expected for pure T3N plugin tool calls.");
      }
    } catch (error) {
      console.error("Error:", error);
    }
  }
}

function extractBytesFromAgentResponse(response: {
  intermediateSteps?: Array<{ observation?: unknown }>;
}): unknown {
  const observation = response.intermediateSteps?.[0]?.observation;
  if (!observation) {
    return undefined;
  }

  try {
    const parsed = typeof observation === "string" ? JSON.parse(observation) : observation;
    if (parsed && typeof parsed === "object" && "bytes" in parsed) {
      return (parsed as { bytes?: unknown }).bytes;
    }
  } catch (error) {
    console.error("Error parsing observation:", error);
  }

  return undefined;
}

function toBuffer(bytes: unknown): Buffer {
  if (Buffer.isBuffer(bytes)) {
    return bytes;
  }

  if (
    bytes &&
    typeof bytes === "object" &&
    "data" in bytes &&
    Array.isArray((bytes as { data?: unknown }).data)
  ) {
    return Buffer.from((bytes as { data: number[] }).data);
  }

  throw new Error("Tool result did not contain a Buffer-compatible byte payload.");
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  bootstrap().catch((error: unknown) => {
    console.error("Fatal error during CLI bootstrap:", error);
    process.exitCode = 1;
  });
}
