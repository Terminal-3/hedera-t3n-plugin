import { describe, expect, it } from "vitest";

import { parseIpfsSubmitAgentCardPinataArgs } from "../../src/cli/ipfs-submit-agent-card-pinata-args.js";

describe("ipfs-submit-agent-card-pinata CLI args", () => {
  it("supports --path and --jwt", () => {
    const parsed = parseIpfsSubmitAgentCardPinataArgs([
      "--path",
      "./output/identities/agent_identity.json",
      "--jwt",
      "token",
    ]);

    expect(parsed.pathArg).toBe("./output/identities/agent_identity.json");
    expect(parsed.jwt).toBe("token");
  });

  it("supports --api-key/--api-secret with equals syntax", () => {
    const parsed = parseIpfsSubmitAgentCardPinataArgs([
      "--path=./output/identities/agent_identity.json",
      "--api-key=key",
      "--api-secret=secret",
    ]);

    expect(parsed.pathArg).toBe("./output/identities/agent_identity.json");
    expect(parsed.apiKey).toBe("key");
    expect(parsed.apiSecret).toBe("secret");
  });

  it("rejects incomplete api key auth", () => {
    expect(() =>
      parseIpfsSubmitAgentCardPinataArgs(["--api-key", "key"])
    ).toThrow("Both --api-key and --api-secret are required");
  });

  it("throws on unknown flags", () => {
    expect(() =>
      parseIpfsSubmitAgentCardPinataArgs(["--path", "agent_identity.json", "--bogus", "x"])
    ).toThrow('Unknown argument: "--bogus"');
  });

  it("throws on unexpected positional arguments", () => {
    expect(() =>
      parseIpfsSubmitAgentCardPinataArgs(["agent_identity.json"])
    ).toThrow('Unexpected positional argument: "agent_identity.json"');
  });
});
