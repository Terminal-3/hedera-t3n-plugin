/**
 * Purpose: Test helper for creating Ollama-based Hedera agent instances
 * Scope:   Sets up LangChain agent with Hedera toolkit and T3N plugin for e2e tests
 * Inputs:  Ollama base URL, model name, Hedera credentials, optional system prompt
 * Outputs: Configured agent with response parser and tools
 */

import { PrivateKey, Client } from "@hashgraph/sdk";
import { MemorySaver } from "@langchain/langgraph";
import { ChatOllama } from "@langchain/ollama";
import { createAgent, toolCallLimitMiddleware } from "langchain";

import { AgentMode, HederaLangchainToolkit, ResponseParserService } from "hedera-agent-kit";

import { hederaT3nPlugin } from "../../../src/plugin.js";

const OLLAMA_REQUEST_TIMEOUT_MS = 60_000;

export const DEFAULT_SYSTEM_PROMPT =
  "You are a helpful assistant with access to Hedera and T3N identity tools. " +
  "When the user asks you to check if their agent identity is ready or validate their identity configuration, you MUST call the HAS_AGENT_IDENTITY_CONFIG tool. " +
  "When the user asks you to create or open an authenticated T3N session for the current agent identity, you MUST call the CREATE_T3N_AUTH_SESSION tool. " +
  "When the user asks you to validate whether the current T3N session is still authenticated, you MUST call the VALIDATE_T3N_AUTH_SESSION tool. " +
  "When the user asks you to store a user DID for later checks, you MUST call the ADD_USER_DID tool with both `userDid` and `remark`. " +
  "When the user asks you to look up stored user DIDs, you MUST call the GET_USER_DID tool with optional `userDid` and/or `remark` filters. " +
  "When the user asks you to map profile field names to T3N profile selectors, you MUST call the PROFILE_FIELD_MAPPING tool with a `fields` array. " +
  "When the user asks whether specific profile fields exist for the currently stored user DID, you MUST call the CHECK_MY_PROFILE_FIELDS tool. " +
  "When the user asks whether specific profile fields exist for another user's DID, you MUST call the CHECK_PROFILE_FIELD_EXISTENCE tool. " +
  "When the user asks if their current agent is registered on T3N or Hedera, you MUST call the CHECK_AGENT_REGISTRATION_STATUS tool. " +
  "When the user asks you to fetch the current agent registration record, you MUST call the FETCH_AGENT_REGISTRATION_RECORD tool. " +
  "Always use the appropriate tool when asked - do not just describe what you would do.";

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

type CreateOllamaAgentOptions = {
  baseUrl: string;
  model: string;
  accountId: string;
  privateKey: string;
  systemPrompt?: string;
};

export function createOllamaAgent({
  baseUrl,
  model,
  accountId,
  privateKey,
  systemPrompt = DEFAULT_SYSTEM_PROMPT,
}: CreateOllamaAgentOptions): AgentSetup {
  const client = Client.forTestnet().setOperator(
    accountId,
    PrivateKey.fromStringECDSA(privateKey)
  ) as unknown as Client;

  const toolkit = new HederaLangchainToolkit({
    client,
    configuration: {
      tools: [],
      plugins: [hederaT3nPlugin],
      context: { mode: AgentMode.AUTONOMOUS },
    },
  });

  const tools = toolkit.getTools();
  const responseParser = new ResponseParserService(tools);
  const llm = new ChatOllama({
    model,
    baseUrl,
    fetch: createTimedFetch(OLLAMA_REQUEST_TIMEOUT_MS),
    headers: {
      Connection: "close",
    },
    temperature: 0,
    numPredict: 128,
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
        toolName: "has_agent_identity_config",
        runLimit: 8,
        exitBehavior: "end",
      }),
    ],
  });

  const cleanup = (): void => {
    llm.client.abort();
  };

  return { agent, cleanup, responseParser, tools };
}
