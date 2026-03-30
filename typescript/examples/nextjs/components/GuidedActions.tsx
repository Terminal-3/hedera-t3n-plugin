"use client";

import { useState } from "react";

import { GUIDED_ACTIONS } from "@/lib/guided-actions";

export type GuidedActionResponse = {
  action: string;
  params: Record<string, unknown>;
  result: Record<string, unknown>;
  humanMessage: string;
  timeoutMs: number;
};

export function GuidedActions({
  chatId,
  onCompleted,
}: {
  chatId: string;
  onCompleted: (result: GuidedActionResponse) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>(
    Object.fromEntries(
      GUIDED_ACTIONS.map((action) => [action.action, JSON.stringify(action.defaultInput, null, 2)])
    )
  );
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runAction(action: string) {
    setRunningAction(action);
    setError(null);

    try {
      const rawDraft = drafts[action] ?? "{}";
      const input = rawDraft.trim() === "" ? {} : (JSON.parse(rawDraft) as Record<string, unknown>);
      const response = await fetch(`/api/actions/${action}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ chatId, input }),
      });
      const data = (await response.json()) as GuidedActionResponse & { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Guided action failed.");
      }

      onCompleted(data);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
      setError(message);
    } finally {
      setRunningAction(null);
    }
  }

  return (
    <section className="panel stack-lg">
      <div className="section-header">
        <div>
          <p className="eyebrow">Workflow</p>
          <h2>Guided Actions</h2>
        </div>
      </div>

      <div className="actions-grid">
        {GUIDED_ACTIONS.map((action) => (
          <article className="action-card" key={action.action}>
            <p className="eyebrow">{action.phase}</p>
            <h3>{action.title}</h3>
            <p>{action.description}</p>
            <textarea
              className="code-area"
              value={drafts[action.action] ?? "{}"}
              onChange={(event) =>
                setDrafts((current) => ({
                  ...current,
                  [action.action]: event.target.value,
                }))
              }
              spellCheck={false}
            />
            <div className="button-row">
              <span className="muted-copy">{Math.round(action.timeoutMs / 1000)}s timeout</span>
              <button
                className="primary-button"
                onClick={() => runAction(action.action)}
                disabled={runningAction !== null}
              >
                {runningAction === action.action ? "Running..." : "Run"}
              </button>
            </div>
          </article>
        ))}
      </div>

      {error ? <p className="error-copy">{error}</p> : null}
    </section>
  );
}
