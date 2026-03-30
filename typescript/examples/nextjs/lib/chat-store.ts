import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

import type { UIMessage } from "ai";

import type { GuidedActionEvent } from "@/lib/chat-types";
import { getDemoConfig } from "@/lib/config";
import { redactValue } from "@/lib/redaction";

export type StoredChatSession = {
  id: string;
  messages: UIMessage[];
  guidedActions: GuidedActionEvent[];
  updatedAt: string;
};

function getChatFilePath(chatId: string): string {
  return path.join(getDemoConfig().storageDir, "chats", `${chatId}.json`);
}

async function ensureChatDir(chatId: string): Promise<void> {
  await mkdir(path.dirname(getChatFilePath(chatId)), { recursive: true });
}

function sanitizeMessages(messages: UIMessage[]): UIMessage[] {
  return redactValue(messages) as UIMessage[];
}

export async function loadChatSession(chatId: string): Promise<StoredChatSession> {
  const filePath = getChatFilePath(chatId);

  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as StoredChatSession;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code !== "ENOENT") {
      throw error;
    }

    return {
      id: chatId,
      messages: [],
      guidedActions: [],
      updatedAt: new Date(0).toISOString(),
    };
  }
}

export async function saveChatMessages(chatId: string, messages: UIMessage[]): Promise<void> {
  const session = await loadChatSession(chatId);
  await ensureChatDir(chatId);

  const nextSession: StoredChatSession = {
    ...session,
    messages: sanitizeMessages(messages),
    updatedAt: new Date().toISOString(),
  };

  await writeFile(getChatFilePath(chatId), JSON.stringify(nextSession, null, 2), "utf8");
}

export async function clearChatMessages(chatId: string): Promise<void> {
  const session = await loadChatSession(chatId);
  await ensureChatDir(chatId);

  const nextSession: StoredChatSession = {
    ...session,
    messages: [],
    guidedActions: [],
    updatedAt: new Date().toISOString(),
  };

  await writeFile(getChatFilePath(chatId), JSON.stringify(nextSession, null, 2), "utf8");
}

export async function appendGuidedAction(
  chatId: string,
  event: GuidedActionEvent
): Promise<void> {
  const session = await loadChatSession(chatId);
  await ensureChatDir(chatId);

  const nextSession: StoredChatSession = {
    ...session,
    guidedActions: [...session.guidedActions, redactValue(event) as GuidedActionEvent],
    updatedAt: new Date().toISOString(),
  };

  await writeFile(getChatFilePath(chatId), JSON.stringify(nextSession, null, 2), "utf8");
}

export function buildGuidedContext(events: GuidedActionEvent[]): string {
  if (events.length === 0) {
    return "";
  }

  return events
    .slice(-8)
    .map(
      (event) =>
        `- ${event.timestamp} ${event.action}: ${event.humanMessage} :: ${JSON.stringify(event.result)}`
    )
    .join("\n");
}
