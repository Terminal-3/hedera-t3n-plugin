/**
 * Purpose: Integration tests for create-identity CLI argument parsing
 * Scope:   Tests argument parsing, path resolution, overwrite decision logic
 * Inputs:  Command-line argument arrays, environment objects
 * Outputs: Test assertions for CLI behavior
 */

import { describe, expect, it } from "vitest";

import {
  getOverwriteDecision,
  parseCreateIdentityArgs,
  resolveOutputTarget,
} from "../../src/cli/identity-args.js";

describe("create-identity CLI args", () => {
  it("prefers --path over AGENT_IDENTITY_CONFIG_PATH", () => {
    const parsed = parseCreateIdentityArgs(["--path", "cli.json"], {});
    const target = resolveOutputTarget(parsed.pathArg, "env.json");
    expect(target.kind).toBe("file");
    if (target.kind === "file") {
      expect(target.path.endsWith("cli.json")).toBe(true);
    }
  });

  it("supports --path=<path>", () => {
    const parsed = parseCreateIdentityArgs(["--path=./output/identities/agent.json"], {});
    expect(parsed.pathArg).toBe("./output/identities/agent.json");
  });

  it("supports -p <path>", () => {
    const parsed = parseCreateIdentityArgs(["-p", "./output/identities"], {});
    expect(parsed.pathArg).toBe("./output/identities");
  });

  it("supports --env=<network>", () => {
    const parsed = parseCreateIdentityArgs(["--env=mainnet"], {});
    expect(parsed.networkTier).toBe("mainnet");
  });

  it("rejects --agent-uri <uri> with migration guidance", () => {
    expect(() =>
      parseCreateIdentityArgs(
        ["--agent-uri", "https://agent.example/.well-known/agent_card.json"],
        {}
      )
    ).toThrow("register-agent-erc8004");
  });

  it("rejects --agent-uri=<uri> with migration guidance", () => {
    expect(() =>
      parseCreateIdentityArgs(
        ["--agent-uri=https://agent.example/.well-known/agent_card.json"],
        {}
      )
    ).toThrow("register-agent-erc8004");
  });

  it("treats .json paths as files and others as directories", () => {
    const fileTarget = resolveOutputTarget("./output/identities/agent.json", undefined);
    const dirTarget = resolveOutputTarget("./output/identities", undefined);
    expect(fileTarget.kind).toBe("file");
    expect(dirTarget.kind).toBe("dir");
  });

  it("fails in non-interactive mode when file already exists", () => {
    const decision = getOverwriteDecision({
      targetPath: "/tmp/agent.json",
      fileExists: true,
      isTTY: false,
    });
    expect(decision.action).toBe("fail");
  });

  it("prompts in interactive mode when file already exists", () => {
    const decision = getOverwriteDecision({
      targetPath: "/tmp/agent.json",
      fileExists: true,
      isTTY: true,
    });
    expect(decision.action).toBe("prompt");
  });

  it("throws on missing --path value", () => {
    expect(() => parseCreateIdentityArgs(["--path"], {})).toThrow("Missing value for --path");
  });

  it("throws on deprecated --agent-uri without value", () => {
    expect(() => parseCreateIdentityArgs(["--agent-uri"], {})).toThrow(
      "--agent-uri is no longer supported"
    );
  });

  describe("HEDERA_NETWORK environment variable", () => {
    it("sets networkTier=local when HEDERA_NETWORK=local", () => {
      const parsed = parseCreateIdentityArgs([], { HEDERA_NETWORK: "local" });
      expect(parsed.networkTier).toBe("local");
    });

    it("sets networkTier=testnet when HEDERA_NETWORK=testnet", () => {
      const parsed = parseCreateIdentityArgs([], { HEDERA_NETWORK: "testnet" });
      expect(parsed.networkTier).toBe("testnet");
    });

    it("sets networkTier=mainnet when HEDERA_NETWORK=mainnet", () => {
      const parsed = parseCreateIdentityArgs([], { HEDERA_NETWORK: "mainnet" });
      expect(parsed.networkTier).toBe("mainnet");
    });

    it("sets networkTier=testnet when HEDERA_NETWORK is unset (defaults to testnet)", () => {
      const parsed = parseCreateIdentityArgs([], {});
      expect(parsed.networkTier).toBe("testnet");
    });
  });
});
