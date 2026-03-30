import { appendGuidedAction } from "@/lib/chat-store";
import type { GuidedActionEvent } from "@/lib/chat-types";
import { getGuidedActionDefinition } from "@/lib/guided-actions";
import { getPluginToolByAction } from "@/lib/ai/tools";
import { redactValue } from "@/lib/redaction";

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`${label} timed out after ${timeoutMs}ms.`));
      }, timeoutMs);

      promise.finally(() => clearTimeout(timeout)).catch(() => undefined);
    }),
  ]);
}

export async function executeGuidedAction(params: {
  action: string;
  chatId?: string;
  input?: Record<string, unknown>;
}) {
  const toolDefinition = await getPluginToolByAction(params.action);
  const guidedDefinition = getGuidedActionDefinition(params.action);

  if (!toolDefinition || !guidedDefinition) {
    throw new Error(`Unknown guided action: ${params.action}`);
  }

  const result = await withTimeout(
    toolDefinition.execute(undefined, {} as never, params.input ?? {}),
    guidedDefinition.timeoutMs,
    params.action
  );

  const response = {
    action: params.action,
    params: redactValue(params.input ?? {}) as Record<string, unknown>,
    result: redactValue(result.raw) as Record<string, unknown>,
    humanMessage: result.humanMessage,
    timeoutMs: guidedDefinition.timeoutMs,
  };

  if (params.chatId) {
    const event: GuidedActionEvent = {
      action: response.action,
      params: response.params,
      result: response.result,
      humanMessage: response.humanMessage,
      timestamp: new Date().toISOString(),
    };
    await appendGuidedAction(params.chatId, event);
  }

  return response;
}
