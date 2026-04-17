import { describe, expect, it } from "vitest";

import {
  E2E_AGENT_CARD_GATEWAY_URL_ENV,
  E2E_IPFS_PINATA_ENV,
  E2E_LOCAL_CCF_DEFAULTS_ENV,
  parseE2eOptions,
  stripE2eOptionArgs,
} from "../e2e/helpers/e2e-options.js";

/** Avoid inheriting HEDERA_E2E_* from the outer process when asserting argv-only parsing. */
const ISOLATED_ARGV_PARSE_ENV = {
  [E2E_AGENT_CARD_GATEWAY_URL_ENV]: "",
  [E2E_IPFS_PINATA_ENV]: "",
  [E2E_LOCAL_CCF_DEFAULTS_ENV]: "",
} as NodeJS.ProcessEnv;

describe("parseE2eOptions", () => {
  it("parses a caller-provided gateway URL from argv", () => {
    expect(
      parseE2eOptions(
        ["--agent-card-gateway-url=https://example.com/agent_card.json"],
        ISOLATED_ARGV_PARSE_ENV
      )
    ).toEqual({
      agentCardGatewayUrl: "https://example.com/agent_card.json",
      ipfsPinata: false,
      localCcfDefaults: false,
    });
  });

  it("parses the Pinata flag from argv", () => {
    expect(parseE2eOptions(["--ipfs-pinata"], ISOLATED_ARGV_PARSE_ENV)).toEqual({
      agentCardGatewayUrl: undefined,
      ipfsPinata: true,
      localCcfDefaults: false,
    });
  });

  it("falls back to dedicated env vars", () => {
    expect(
      parseE2eOptions([], {
        [E2E_AGENT_CARD_GATEWAY_URL_ENV]: "https://example.com/from-env.json",
        [E2E_IPFS_PINATA_ENV]: "",
        [E2E_LOCAL_CCF_DEFAULTS_ENV]: "true",
      })
    ).toEqual({
      agentCardGatewayUrl: "https://example.com/from-env.json",
      ipfsPinata: false,
      localCcfDefaults: true,
    });
  });

  it("parses local CCF defaults toggle from argv", () => {
    expect(parseE2eOptions(["--local-ccf"])).toEqual({
      agentCardGatewayUrl: undefined,
      ipfsPinata: false,
      localCcfDefaults: true,
    });
  });

  it("rejects mutually exclusive registration modes", () => {
    expect(() =>
      parseE2eOptions(
        ["--ipfs-pinata"],
        {
          [E2E_AGENT_CARD_GATEWAY_URL_ENV]: "https://example.com/agent_card.json",
        }
      )
    ).toThrow("Use either --agent-card-gateway-url <url> or --ipfs-pinata, not both.");
  });
});

describe("stripE2eOptionArgs", () => {
  it("removes e2e-only registration flags and preserves vitest args", () => {
    expect(
      stripE2eOptionArgs([
        "--reporter=verbose",
        "--local-ccf",
        "--agent-card-gateway-url",
        "https://example.com/agent_card.json",
        "tests/e2e/auth-agent-context.e2e.ts",
      ])
    ).toEqual([
      "--reporter=verbose",
      "tests/e2e/auth-agent-context.e2e.ts",
    ]);
  });
});
