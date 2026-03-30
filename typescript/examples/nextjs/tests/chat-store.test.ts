import { mkdtemp, rm } from "fs/promises";
import os from "os";
import path from "path";

import { afterEach, describe, expect, it } from "vitest";

import {
  appendGuidedAction,
  loadChatSession,
  saveChatMessages,
} from "@/lib/chat-store";

const originalCwd = process.cwd();
let tempDir: string | null = null;

afterEach(async () => {
  process.chdir(originalCwd);
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

async function switchToTempDir() {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "hedera-demo-"));
  process.chdir(tempDir);
}

describe("chat store", () => {
  it("saves and reloads chat messages", async () => {
    await switchToTempDir();

    await saveChatMessages("chat-a", [
      {
        id: "m1",
        role: "assistant",
        parts: [{ type: "text", text: "hello" }],
      },
    ]);

    const session = await loadChatSession("chat-a");
    expect(session.messages).toHaveLength(1);
    expect(session.messages[0]?.parts[0]).toMatchObject({ type: "text", text: "hello" });
  });

  it("appends guided actions", async () => {
    await switchToTempDir();

    await appendGuidedAction("chat-b", {
      action: "HAS_AGENT_IDENTITY_CONFIG",
      params: {},
      result: { success: true },
      humanMessage: "ready",
      timestamp: new Date().toISOString(),
    });

    const session = await loadChatSession("chat-b");
    expect(session.guidedActions).toHaveLength(1);
    expect(session.guidedActions[0]?.action).toBe("HAS_AGENT_IDENTITY_CONFIG");
  });
});
