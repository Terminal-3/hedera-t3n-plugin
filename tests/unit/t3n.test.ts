import { describe, expect, it } from "vitest";

import {
  deriveDeterministicT3nDid,
  resolveRegistrationConfirmationTimeoutMs,
} from "../../src/utils/t3n";

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
      deriveDeterministicT3nDid("0x1234567890abcdef1234567890abcdef12345678", {
        networkTier: "testnet",
        baseUrl: "http://127.0.0.1:3000",
      })
    ).toBe("did:t3:a:1234567890abcdef");
  });

  it("uses the canonical T3N DID prefix for remote tiers", () => {
    expect(
      deriveDeterministicT3nDid("0x1234567890abcdef1234567890abcdef12345678", {
        networkTier: "testnet",
        baseUrl: "https://cn-api.sg.staging.t3n.terminal3.io",
      })
    ).toBe("did:t3n:a:1234567890abcdef");
  });
});
