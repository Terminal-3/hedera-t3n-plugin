"use client";

import { startTransition, useEffect, useState, type ComponentProps } from "react";
import type { UIMessage } from "ai";

import { ChatPanel } from "@/components/ChatPanel";
import { GuidedActions, type GuidedActionResponse } from "@/components/GuidedActions";
import { StatusCards } from "@/components/StatusCards";
import type { GuidedActionEvent } from "@/lib/chat-types";

type StatusResponse = ComponentProps<typeof StatusCards>["status"];

type ChatSessionResponse = {
  id: string;
  messages: UIMessage[];
  guidedActions: GuidedActionEvent[];
};

function createChatId(): string {
  return `hedera-demo-${crypto.randomUUID()}`;
}

export default function Page() {
  const [chatId, setChatId] = useState<string>("");
  const [status, setStatus] = useState<StatusResponse>(null);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [guidedActions, setGuidedActions] = useState<GuidedActionEvent[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const storedId = window.localStorage.getItem("hedera-demo-chat-id") ?? createChatId();
    window.localStorage.setItem("hedera-demo-chat-id", storedId);
    setChatId(storedId);
  }, []);

  useEffect(() => {
    if (!chatId) {
      return;
    }

    void fetch(`/api/chat?chatId=${encodeURIComponent(chatId)}`)
      .then((response) => response.json())
      .then((data: ChatSessionResponse) => {
        startTransition(() => {
          setMessages(data.messages ?? []);
          setGuidedActions(data.guidedActions ?? []);
        });
      });
  }, [chatId]);

  useEffect(() => {
    void refreshStatus();
  }, []);

  async function refreshStatus(attemptUpload = false) {
    setBusy(true);

    try {
      const response = await fetch(
        attemptUpload ? "/api/bootstrap/refresh" : "/api/status",
        attemptUpload
          ? {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ attemptUpload }),
            }
          : undefined
      );
      const data = (await response.json()) as StatusResponse;
      startTransition(() => setStatus(data));
    } finally {
      setBusy(false);
    }
  }

  function handleCompletedAction(result: GuidedActionResponse) {
    setGuidedActions((current) => [
      ...current,
      {
        action: result.action,
        params: result.params,
        result: result.result,
        humanMessage: result.humanMessage,
        timestamp: new Date().toISOString(),
      },
    ]);
  }

  if (!chatId) {
    return <main className="page-shell">Loading session...</main>;
  }

  return (
    <main className="page-shell page-split">
      <div className="page-left">
        <section className="hero">
          <p className="eyebrow">Hedera T3N Plugin</p>
          <h1>Vercel AI SDK Demo</h1>
          <p className="hero-copy">
            Guided tool execution and streamed chat over the existing Hedera/T3N plugin tools,
            with server-only identity and registration handling.
          </p>
        </section>

        <StatusCards
          status={status}
          onRefresh={() => {
            void refreshStatus();
          }}
          onBootstrap={(attemptUpload) => {
            void refreshStatus(attemptUpload);
          }}
          busy={busy}
        />

        <GuidedActions chatId={chatId} onCompleted={handleCompletedAction} />
      </div>

      <aside className="page-right">
        <ChatPanel
          chatId={chatId}
          initialMessages={messages}
          guidedActions={guidedActions}
          onCleared={() => {
            setMessages([]);
            setGuidedActions([]);
          }}
        />
      </aside>
    </main>
  );
}
