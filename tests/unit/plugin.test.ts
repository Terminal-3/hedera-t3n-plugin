import { describe, expect, it } from "vitest";

import { hederaT3nPlugin } from "../../src/plugin.js";

describe("hederaT3nPlugin", () => {
  it("exposes the supported plugin tools and keeps registration explicit", () => {
    const tools = hederaT3nPlugin.tools({} as never);
    const toolNames = tools.map((tool) => tool.name);

    expect(toolNames).not.toContain("REGISTER_AGENT_ERC8004");
    expect(toolNames).not.toContain("register_agent_erc8004");
    expect(toolNames).toEqual([
      "ADD_USER_DID",
      "CHECK_AGENT_REGISTRATION_STATUS",
      "CHECK_MY_PROFILE_FIELDS",
      "CHECK_PROFILE_FIELD_EXISTENCE",
      "CREATE_T3N_AUTH_SESSION",
      "FETCH_AGENT_REGISTRATION_RECORD",
      "GET_USER_DID",
      "HAS_AGENT_IDENTITY_CONFIG",
      "PROFILE_FIELD_MAPPING",
      "VALIDATE_T3N_AUTH_SESSION",
    ]);
    expect(toolNames).toContain("ADD_USER_DID");
    expect(toolNames).toContain("GET_USER_DID");
    expect(toolNames).toContain("CHECK_AGENT_REGISTRATION_STATUS");
    expect(toolNames).toContain("FETCH_AGENT_REGISTRATION_RECORD");
  });
});
