/**
 * Purpose: Test helper for creating Hedera agent instances for E2E LLM providers
 * Scope:   Sets up LangChain agent with Hedera toolkit and T3N plugin for e2e tests
 * Inputs:  LLM provider config, Hedera credentials, optional system prompt
 * Outputs: Configured agent with response parser and tools
 */

import { PrivateKey, Client } from "@hiero-ledger/sdk";
import { MemorySaver } from "@langchain/langgraph";
import { ChatOllama } from "@langchain/ollama";
import { ChatOpenAI } from "@langchain/openai";
import { createAgent, toolCallLimitMiddleware } from "langchain";

import { AgentMode } from "@hashgraph/hedera-agent-kit";
import { HederaLangchainToolkit, ResponseParserService } from "@hashgraph/hedera-agent-kit-langchain";

import { hederaT3nPlugin } from "../../../src/plugin.js";

const DEFAULT_OLLAMA_REQUEST_TIMEOUT_MS = 60_000;
const OLLAMA_REQUEST_TIMEOUT_ENV = "HEDERA_E2E_OLLAMA_TIMEOUT_MS";
const AUTH_AGENT_CONTEXT_TOOL_NAME = "AUTH_AGENT_CONTEXT";
const PRIVATE_DATA_PROCESSING_TOOL_NAME = "PRIVATE_DATA_PROCESSING";

function readPositiveMsEnv(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw) {
    return defaultValue;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return defaultValue;
  }

  return parsed;
}

export const DEFAULT_SYSTEM_PROMPT =
  "You are a helpful assistant with access to Hedera and T3N identity tools. " +
  "When the user asks for a private-data-processing or profile-field-availability check, you MUST call the PRIVATE_DATA_PROCESSING tool with `userDid` and `fields`. " +
  "When the user asks whether the agent is ready, authenticated, or registered, you MUST call the AUTH_AGENT_CONTEXT tool. " +
  "Do not invent or call hidden internal tools. " +
  "Always use the appropriate public tool when asked - do not just describe what you would do.";

export type AgentSetup = {
  agent: ReturnType<typeof createAgent>;
  cleanup: () => void;
  responseParser: ResponseParserService;
  tools: ReturnType<HederaLangchainToolkit["getTools"]>;
};

function createTimedFetch(timeoutMs: number): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController();
    const upstreamSignal = init?.signal;
    let streamActive = false;
    const forwardAbort = (): void => {
      controller.abort(upstreamSignal?.reason);
    };
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const resetTimeout = (): void => {
      if (timeout) {
        clearTimeout(timeout);
      }
      timeout = setTimeout(() => {
        controller.abort(new Error(`Ollama request timed out after ${timeoutMs}ms.`));
      }, timeoutMs);
    };
    const clearRequestTimeout = (): void => {
      if (timeout) {
        clearTimeout(timeout);
        timeout = undefined;
      }
    };
    const finalizeRequest = (): void => {
      clearRequestTimeout();
      upstreamSignal?.removeEventListener("abort", forwardAbort);
    };

    upstreamSignal?.addEventListener("abort", forwardAbort);
    resetTimeout();

    try {
      const response = await fetch(input, {
        ...init,
        signal: controller.signal,
      });
      clearRequestTimeout();

      if (!response.body) {
        finalizeRequest();
        return response;
      }

      const reader = response.body.getReader();
      streamActive = true;
      resetTimeout();

      const stream = new ReadableStream<Uint8Array>({
        async pull(streamController) {
          try {
            const chunk = await reader.read();
            if (chunk.done) {
              finalizeRequest();
              streamController.close();
              return;
            }

            resetTimeout();
            streamController.enqueue(chunk.value);
          } catch (error) {
            finalizeRequest();
            if (controller.signal.aborted && !upstreamSignal?.aborted) {
              streamController.error(
                new Error(`Ollama request timed out after ${timeoutMs}ms.`)
              );
              return;
            }
            streamController.error(error);
          }
        },
        async cancel(reason) {
          finalizeRequest();
          controller.abort(reason);
          await reader.cancel(reason);
        },
      });

      return new Response(stream, {
        headers: response.headers,
        status: response.status,
        statusText: response.statusText,
      });
    } catch (error) {
      if (controller.signal.aborted && !upstreamSignal?.aborted) {
        throw new Error(`Ollama request timed out after ${timeoutMs}ms.`);
      }
      throw error;
    } finally {
      if (!streamActive) {
        finalizeRequest();
      }
    }
  };
}

type CreateLlmAgentOptions = {
  provider?: "ollama" | "groq" | "openrouter";
  baseUrl: string;
  model: string;
  apiKey?: string;
  accountId: string;
  privateKey: string;
  systemPrompt?: string;
};

export function createLlmAgent({
  provider = "ollama",
  baseUrl,
  model,
  apiKey,
  accountId,
  privateKey,
  systemPrompt = DEFAULT_SYSTEM_PROMPT,
}: CreateLlmAgentOptions): AgentSetup {
  const ollamaRequestTimeoutMs = readPositiveMsEnv(
    OLLAMA_REQUEST_TIMEOUT_ENV,
    DEFAULT_OLLAMA_REQUEST_TIMEOUT_MS
  );

  const client = Client.forTestnet().setOperator(
    accountId,
    PrivateKey.fromStringECDSA(privateKey)
  ) as unknown as Client;

  const toolkit = new HederaLangchainToolkit({
    client: client as any,
    configuration: {
      tools: [],
      plugins: [hederaT3nPlugin],
      context: { mode: AgentMode.AUTONOMOUS },
    },
  });

  const tools = toolkit.getTools() as any;
  const responseParser = new ResponseParserService(tools);
  const llm =
    provider === "groq" || provider === "openrouter"
      ? new ChatOpenAI({
          model,
          apiKey,
          configuration: {
            baseURL: baseUrl,
          },
          temperature: 0,
        })
      : new ChatOllama({
          model,
          baseUrl,
          fetch: createTimedFetch(ollamaRequestTimeoutMs),
          headers: {
            Connection: "close",
          },
          temperature: 0,
          numPredict: 256,
          numCtx: 4096,
          keepAlive: 0,
          think: false,
        });

  const agent = createAgent({
    model: llm,
    tools,
    systemPrompt,
    checkpointer: new MemorySaver(),
    middleware: [
      toolCallLimitMiddleware({
        toolName: AUTH_AGENT_CONTEXT_TOOL_NAME,
        runLimit: 4,
        exitBehavior: "end",
      }),
      toolCallLimitMiddleware({
        toolName: PRIVATE_DATA_PROCESSING_TOOL_NAME,
        runLimit: 8,
        exitBehavior: "end",
      }),
    ],
  });

  const cleanup = (): void => {
    if (provider === "ollama") {
      (llm as ChatOllama).client.abort();
    }
  };

  return { agent, cleanup, responseParser, tools };
}

export const createOllamaAgent = createLlmAgent;
