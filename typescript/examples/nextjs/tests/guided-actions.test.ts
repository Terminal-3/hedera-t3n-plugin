import { describe, expect, it } from "vitest";

import {
  getGuidedActionDefinition,
  parseGuidedActionBody,
} from "@/lib/guided-actions";

describe("guided actions", () => {
  it("does not expose the removed registration tool action", () => {
    const definition = getGuidedActionDefinition("REGISTER_AGENT_ERC8004");
    expect(definition).toBeUndefined();
  });

  it("parses request bodies with optional input", () => {
    const parsed = parseGuidedActionBody({
      chatId: "chat-1",
      input: { fields: ["email"] },
    });

    expect(parsed.chatId).toBe("chat-1");
    expect(parsed.input).toMatchObject({ fields: ["email"] });
  });
});
