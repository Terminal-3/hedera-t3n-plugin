import { describe, expect, it } from "vitest";

import { getT3nEndpointMode, isLocalhostUrl } from "../../src/utils/t3n-endpoint.js";

describe("t3n-endpoint utils", () => {
  it("detects localhost urls", () => {
    expect(isLocalhostUrl("http://127.0.0.1:3002")).toBe(true);
    expect(isLocalhostUrl("https://localhost:8443/api")).toBe(true);
    expect(isLocalhostUrl("https://cn-api.sg.staging.t3n.terminal3.io")).toBe(false);
  });

  it("classifies endpoint modes consistently", () => {
    expect(getT3nEndpointMode("local", undefined)).toBe("local/mock (no network call)");
    expect(getT3nEndpointMode("testnet", "http://127.0.0.1:3002")).toBe(
      "local CCF override (Hedera remains non-local)"
    );
    expect(
      getT3nEndpointMode("testnet", "https://cn-api.sg.staging.t3n.terminal3.io")
    ).toBe("public staging");
    expect(
      getT3nEndpointMode("mainnet", "https://cn-api.sg.prod.t3n.terminal3.io")
    ).toBe("public production");
  });
});
