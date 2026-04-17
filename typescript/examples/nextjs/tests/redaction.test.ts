import { describe, expect, it } from "vitest";

import { redactValue } from "@/lib/redaction";

describe("redaction", () => {
  it("redacts absolute paths and private key fields", () => {
    const result = redactValue({
      path: "/tmp/identity.json",
      private_key: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      did_t3n: "did:t3n:649f4f8d0e0916b6f5e7d06ce100821557c8445f",
    }) as Record<string, unknown>;

    expect(result.path).toBe("[redacted]");
    expect(result.private_key).toBe("[redacted]");
    expect(result.did_t3n).toBe("did:t3n:649f4f8d0e0916b6f5e7d06ce100821557c8445f");
  });

  it("keeps transaction hashes visible", () => {
    const txHash = "0x2f3d12721f84a64c7293c610327e54a7cb0c40360d43e652c629aee6d813dc6f";
    const result = redactValue({
      t3nTxHash: txHash,
      hederaTxHash: txHash,
    }) as Record<string, unknown>;

    expect(result.t3nTxHash).toBe(txHash);
    expect(result.hederaTxHash).toBe(txHash);
  });
});
