"use client";

import { DefaultChatTransport, type UIMessage } from "ai";
import { useChat } from "@ai-sdk/react";
import { useRef, useState } from "react";

import type { GuidedActionEvent } from "@/lib/chat-types";
import { getGuidedActionDefinition } from "@/lib/guided-actions";

function renderMessageText(message: UIMessage): string {
  return message.parts
    .map((part) => {
      if (part.type === "text") {
        return part.text;
      }

      if (part.type.startsWith("tool-")) {
        return `${part.type}: ${"output" in part ? JSON.stringify(part.output) : "pending"}`;
      }

      return "";
    })
    .filter(Boolean)
    .join("\n");
}

export function ChatPanel({
  chatId,
  initialMessages,
  guidedActions,
  onCleared,
}: {
  chatId: string;
  initialMessages: UIMessage[];
  guidedActions: GuidedActionEvent[];
  onCleared: () => void;
}) {
  const [input, setInput] = useState("");
  const [clearing, setClearing] = useState(false);
  const [resetting, setResetting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const { messages, sendMessage, setMessages, status, error } = useChat({
    id: chatId,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { id: chatId },
    }),
  });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!input.trim() || status !== "ready") {
      return;
    }

    await sendMessage({ text: input });
    setInput("");
  }

  async function handleClear() {
    if (clearing || status !== "ready") {
      return;
    }

    setClearing(true);
    try {
      const response = await fetch(`/api/chat?chatId=${encodeURIComponent(chatId)}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to clear chat history.");
      }

      setMessages([]);
      setInput("");
      onCleared();
    } finally {
      setClearing(false);
    }
  }

  async function handleReset() {
    if (resetting || status !== "ready") {
      return;
    }

    setResetting(true);
    try {
      const resetResponse = await fetch("/api/reset-server-state", { method: "POST" });
      if (!resetResponse.ok) {
        const body = await resetResponse.json().catch(() => ({}));
        throw new Error(
          body?.error ?? `Reset failed (${resetResponse.status})`
        );
      }

      const clearResponse = await fetch(`/api/chat?chatId=${encodeURIComponent(chatId)}`, {
        method: "DELETE",
      });
      if (!clearResponse.ok) {
        throw new Error("Failed to clear chat history.");
      }

      setMessages([]);
      setInput("");
      onCleared();
    } finally {
      setResetting(false);
    }
  }

  const showStreamingIndicator = status !== "ready";

  return (
    <section className="panel stack-lg">
      <div className="section-header">
        <div>
          <p className="eyebrow">Conversation</p>
          <h2>Freeform Chat</h2>
        </div>
        <div className="button-row">
          <span className={`status-pill ${status === "ready" ? "ok" : "idle"}`}>{status}</span>
          <button
            className="ghost-button"
            type="button"
            onClick={handleClear}
            disabled={status !== "ready" || clearing || resetting}
          >
            {clearing ? "Clearing..." : "Clear"}
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={handleReset}
            disabled={status !== "ready" || clearing || resetting}
            title="Reset server state (user DIDs, session) and clear chat"
          >
            {resetting ? "Resetting..." : "Reset"}
          </button>
        </div>
      </div>

      <div className="timeline">
        {guidedActions.map((event) => {
          const definition = getGuidedActionDefinition(event.action);
          const phase = definition?.phase ?? "Guided Action";
          const title = definition?.title ?? event.action;

          return (
            <article className="timeline-card action-log" key={`${event.timestamp}-${event.action}`}>
              <header>
                <span className="eyebrow">{phase}</span>
                <time>{new Date(event.timestamp).toLocaleString()}</time>
              </header>
              <p>
                <strong>{title}</strong> <span className="muted-copy">({event.action})</span>
              </p>
              <p>{event.humanMessage}</p>
              <pre>{JSON.stringify(event.result, null, 2)}</pre>
            </article>
          );
        })}

        {messages.map((message, index) => {
          const isLast = index === messages.length - 1;
          const isStreaming = status !== "ready" && isLast && message.role === "assistant";
          const text = renderMessageText(message);
          return (
            <article className={`timeline-card ${message.role}`} key={message.id}>
              <header>
                <span className="eyebrow">{message.role}</span>
              </header>
              <pre>
                {text}
                {isStreaming ? <span className="streaming-cursor" aria-hidden /> : null}
              </pre>
            </article>
          );
        })}

        {showStreamingIndicator ? (
          <div className="timeline-streaming" aria-label="Streaming response">
            <span className="chat-spinner" aria-hidden />
            <span className="muted-copy">Streaming…</span>
          </div>
        ) : null}
      </div>

      <form ref={formRef} className="chat-form chat-form-inline" onSubmit={handleSubmit}>
        <div className="chat-input-wrapper">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                formRef.current?.requestSubmit();
              }
            }}
            placeholder="Ask anything"
            disabled={status !== "ready"}
          />
          <button
            className="chat-send-button"
            type="submit"
            disabled={status !== "ready"}
            aria-label="Send"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </button>
        </div>
      </form>

      {error ? <p className="error-copy">{error.message}</p> : null}
    </section>
  );
}
