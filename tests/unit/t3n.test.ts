import { describe, expect, it, vi } from "vitest";

import {
  authenticateT3nClientWithEthDidSuffix,
  deriveDeterministicT3nDid,
  normalizeT3nDid,
  resolveRegistrationConfirmationTimeoutMs,
} from "../../src/utils/t3n";

const TEST_ETH_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";
const TEST_ETH_HEX = TEST_ETH_ADDRESS.slice(2);

describe("t3n timeout helpers", () => {
  it("defaults runtime verification to the broader registration timeout budget", () => {
    expect(resolveRegistrationConfirmationTimeoutMs({}, 90000)).toBe(90000);
    expect(resolveRegistrationConfirmationTimeoutMs({}, 25000)).toBe(25000);
  });

  it("inherits an explicit request timeout when no confirmation override is provided", () => {
    expect(resolveRegistrationConfirmationTimeoutMs({ timeoutMs: 45000 }, 90000)).toBe(45000);
  });

  it("preserves explicit confirmation timeout overrides", () => {
    expect(
      resolveRegistrationConfirmationTimeoutMs(
        {
          timeoutMs: 45000,
          registrationConfirmationTimeoutMs: 120000,
        },
        90000
      )
    ).toBe(120000);
  });
});

describe("deriveDeterministicT3nDid", () => {
  it("uses the local CCF DID prefix for localhost overrides", () => {
    expect(
      deriveDeterministicT3nDid(TEST_ETH_ADDRESS, {
        networkTier: "testnet",
        baseUrl: "http://127.0.0.1:3000",
      })
    ).toBe(`did:t3n:${TEST_ETH_HEX}`);
  });

  it("uses the canonical T3N DID prefix for remote tiers", () => {
    expect(
      deriveDeterministicT3nDid(TEST_ETH_ADDRESS, {
        networkTier: "testnet",
        baseUrl: "https://cn-api.sg.staging.t3n.terminal3.io",
      })
    ).toBe(`did:t3n:${TEST_ETH_HEX}`);
  });

  it("keeps the full 40-hex address suffix without truncation", () => {
    const did = deriveDeterministicT3nDid(TEST_ETH_ADDRESS, {
      networkTier: "testnet",
      baseUrl: "https://cn-api.sg.staging.t3n.terminal3.io",
    });

    const suffix = did.split(":").pop();
    expect(suffix).toBe(TEST_ETH_HEX);
    expect(suffix).toHaveLength(40);
  });
});

describe("authenticateT3nClientWithEthDidSuffix", () => {
  it("falls back to legacy runFlow auth payload when authenticate is unavailable", async () => {
    const runFlow = vi.fn(async (_method: string, payload: Uint8Array) => {
      const authAction = JSON.parse(new TextDecoder().decode(payload)) as {
        did: string;
      };
      expect(authAction.did).toBe(TEST_ETH_HEX);

      return new TextEncoder().encode(`"did:t3n:${TEST_ETH_HEX}"`);
    });

    const client = { runFlow } as unknown as Parameters<
      typeof authenticateT3nClientWithEthDidSuffix
    >[0];

    const did = await authenticateT3nClientWithEthDidSuffix(client, TEST_ETH_ADDRESS);

    expect(runFlow).toHaveBeenCalledTimes(1);
    expect(did).toBe(`did:t3n:${TEST_ETH_HEX}`);
  });
});

describe("normalizeT3nDid", () => {
  it("normalizes legacy did:t3n:a format to canonical format", () => {
    expect(normalizeT3nDid(`did:t3n:a:${TEST_ETH_HEX}`)).toBe(`did:t3n:${TEST_ETH_HEX}`);
  });

  it("normalizes nested did:t3:did:t3n format to canonical format", () => {
    expect(normalizeT3nDid(`did:t3:did:t3n:${TEST_ETH_HEX}`)).toBe(`did:t3n:${TEST_ETH_HEX}`);
  });
});
