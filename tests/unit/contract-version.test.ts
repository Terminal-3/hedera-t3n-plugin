import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getContractVersion,
  isScriptNotRegisteredError,
  resetContractVersionsCacheForTests,
  SCRIPT_NAMES,
} from "../../src/utils/contract-version.js";

describe("contract version resolution", () => {
  afterEach(() => {
    resetContractVersionsCacheForTests();
    vi.unstubAllGlobals();
    delete process.env.T3N_AGENT_REGISTRY_SCRIPT_VERSION;
    delete process.env.T3N_USER_SCRIPT_VERSION;
  });

  it("prefers explicit environment overrides", async () => {
    process.env.T3N_AGENT_REGISTRY_SCRIPT_VERSION = "9.9.9";
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      getContractVersion("https://example.invalid", SCRIPT_NAMES.AGENT_REGISTRY)
    ).resolves.toBe("9.9.9");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("detects script-not-registered responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: `No registered version for script: ${SCRIPT_NAMES.AGENT_REGISTRY}`,
          }),
          {
            status: 404,
            statusText: "Not Found",
            headers: { "content-type": "application/json" },
          }
        )
      )
    );

    try {
      await getContractVersion("https://example.invalid", SCRIPT_NAMES.AGENT_REGISTRY);
      throw new Error("Expected getContractVersion to throw.");
    } catch (error) {
      expect(isScriptNotRegisteredError(error, SCRIPT_NAMES.AGENT_REGISTRY)).toBe(true);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("No registered version for script");
    }
  });
});
