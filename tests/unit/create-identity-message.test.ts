import { describe, expect, it } from "vitest";

import {
  formatCreateIdentityMessage,
  type CreateIdentityResult,
} from "../../src/createIdentity.js";

function buildResult(
  overrides: Partial<CreateIdentityResult> = {}
): CreateIdentityResult {
  return {
    did_t3n: "did:t3n:1234567890abcdef1234567890abcdef12345678",
    hedera_wallet: "0x1234567890abcdef1234567890abcdef12345678",
    credentials_path: "/tmp/agent_identity.json",
    agent_card_path: "/tmp/agent_card.json",
    networkTier: "testnet",
    t3n_api_base_url: "https://cn-api.sg.staging.t3n.terminal3.io",
    t3n_runtime_api_url: "https://node.sg.staging.t3n.terminal3.io",
    registration_tx_hash: "ccf:0:1",
    ...overrides,
  };
}

describe("formatCreateIdentityMessage", () => {
  it("shows public staging mode for default testnet endpoint", () => {
    const message = formatCreateIdentityMessage(buildResult());

    expect(message).toContain("Hedera network tier: testnet");
    expect(message).toContain("T3N tier: staging");
    expect(message).toContain("T3N endpoint mode: public staging");
  });

  it("shows local CCF override when testnet points to localhost", () => {
    const message = formatCreateIdentityMessage(
      buildResult({
        t3n_api_base_url: "http://127.0.0.1:3002",
        t3n_runtime_api_url: "http://127.0.0.1:3002/api/rpc",
      })
    );

    expect(message).toContain(
      "T3N endpoint mode: local CCF override (Hedera remains non-local)"
    );
    expect(message).toContain("T3N API URL: http://127.0.0.1:3002");
  });

  it("shows local/mock mode when local tier does not call network", () => {
    const message = formatCreateIdentityMessage(
      buildResult({
        networkTier: "local",
        t3n_api_base_url: undefined,
        t3n_runtime_api_url: undefined,
      })
    );

    expect(message).toContain("T3N endpoint mode: local/mock (no network call)");
    expect(message).toContain("T3N API URL: (mock/no network call)");
  });

  it("labels non-local DID as authenticated when registration is still explicit", () => {
    const message = formatCreateIdentityMessage(
      buildResult({
        registration_tx_hash: undefined,
      })
    );

    expect(message).toContain(
      "T3N Identity (did:t3n:): did:t3n:1234567890abcdef1234567890abcdef12345678 (authenticated from T3N staging; agent registration remains explicit)"
    );
  });
});
