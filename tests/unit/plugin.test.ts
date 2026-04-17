import { describe, expect, it } from "vitest";

import { hederaT3nPlugin } from "../../src/plugin.js";

describe("hederaT3nPlugin", () => {
  it("exposes only the contracted public plugin tools", () => {
    const tools = hederaT3nPlugin.tools({} as never);
    const toolNames = tools.map((tool) => tool.name);

    expect(toolNames).toEqual(["PRIVATE_DATA_PROCESSING", "AUTH_AGENT_CONTEXT"]);
    expect(toolNames).not.toContain("ADD_USER_DID");
    expect(toolNames).not.toContain("CREATE_T3N_AUTH_SESSION");
    expect(toolNames).not.toContain("HAS_AGENT_IDENTITY_CONFIG");
    expect(toolNames).not.toContain("VALIDATE_T3N_AUTH_SESSION");
  });
});
