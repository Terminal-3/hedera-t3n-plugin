import { streamText, stepCountIs, type UIMessage } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";

import { buildSystemPrompt } from "@/lib/ai/system-prompt";
import { getAiSdkTools } from "@/lib/ai/tools";
import { toValidatedModelMessages } from "@/lib/ai/model-messages";
import { getChatModel } from "@/lib/ai/provider";
import {
  buildGuidedContext,
  clearChatMessages,
  loadChatSession,
  saveChatMessages,
} from "@/lib/chat-store";
import { redactError } from "@/lib/redaction";

export const runtime = "nodejs";

const chatRequestSchema = z.object({
  id: z.string().trim().min(1),
  messages: z.array(z.custom<UIMessage>()),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const chatId = url.searchParams.get("chatId");

  if (!chatId) {
    return NextResponse.json({ error: "chatId is required." }, { status: 400 });
  }

  const session = await loadChatSession(chatId);
  return NextResponse.json(session);
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const chatId = url.searchParams.get("chatId");

  if (!chatId) {
    return NextResponse.json({ error: "chatId is required." }, { status: 400 });
  }

  try {
    await clearChatMessages(chatId);
    const session = await loadChatSession(chatId);
    return NextResponse.json(session);
  } catch (error) {
    return NextResponse.json(
      {
        error: redactError(error),
      },
      { status: 400 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const payload = chatRequestSchema.parse(await request.json());
    const session = await loadChatSession(payload.id);
    const tools = await getAiSdkTools();
    const { validated, modelMessages } = await toValidatedModelMessages(
      payload.messages,
      tools
    );
    const result = streamText({
      model: getChatModel(),
      system: buildSystemPrompt(buildGuidedContext(session.guidedActions)),
      messages: modelMessages,
      tools,
      stopWhen: stepCountIs(8),
    });

    return result.toUIMessageStreamResponse({
      originalMessages: validated,
      onFinish: async ({ messages }) => {
        await saveChatMessages(payload.id, messages);
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: redactError(error),
      },
      { status: 400 }
    );
  }
}
