/**
 * Purpose: Integration tests for register-agent-erc8004 CLI parsing and registration flow
 * Scope:   Covers required args, path precedence, validation failures, and output shape
 * Inputs:  CLI arg arrays, env vars, temporary identity files
 * Outputs: Assertions for registration behavior
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createIdentity } from "../../src/createIdentity.js";
import {
  formatRegisterAgentErc8004Message,
  registerAgentErc8004,
} from "../../src/registerAgentErc8004.js";
import {
  parseRegisterAgentErc8004Args,
  resolveRegistrationAgentUri,
  resolveRegistrationIdentityPath,
} from "../../src/cli/register-agent-erc8004-args.js";
import { captureEnv, restoreEnv } from "../helpers/env.js";
import { cleanupTempFile, createTempFilePath } from "../helpers/temp-files.js";

const envSnapshot = captureEnv([
  "HEDERA_NETWORK",
  "AGENT_IDENTITY_CONFIG_PATH",
  "T3N_LOCAL_BACKEND",
]);
const TEST_IDENTITY_REGISTRY_ADDRESS = "0x1111111111111111111111111111111111111111";

describe("register-agent-erc8004 CLI args", () => {
  afterEach(() => {
    restoreEnv(envSnapshot);
  });

  it("supports --agent-uri <uri>", () => {
    const parsed = parseRegisterAgentErc8004Args(
      ["--agent-uri", "https://agent.example/.well-known/agent_card.json"],
      {}
    );
    expect(parsed.agentUriArg).toBe("https://agent.example/.well-known/agent_card.json");
  });

  it("supports --agent-uri=<uri>", () => {
    const parsed = parseRegisterAgentErc8004Args(
      ["--agent-uri=https://agent.example/.well-known/agent_card.json"],
      {}
    );
    expect(parsed.agentUriArg).toBe("https://agent.example/.well-known/agent_card.json");
  });

  it("supports --path and --env", () => {
    const parsed = parseRegisterAgentErc8004Args(
      ["--env", "mainnet", "--path", "./output/identities/agent_identity.json"],
      {}
    );
    expect(parsed.networkTier).toBe("mainnet");
    expect(parsed.pathArg).toBe("./output/identities/agent_identity.json");
  });

  it("supports --env=<network>", () => {
    const parsed = parseRegisterAgentErc8004Args(["--env=mainnet"], {});
    expect(parsed.networkTier).toBe("mainnet");
  });

  it("resolves agent URI from CLI argument only", () => {
    const selected = resolveRegistrationAgentUri(
      "https://agent.cli/.well-known/agent_card.json"
    );
    expect(selected).toBe("https://agent.cli/.well-known/agent_card.json");
  });

  it("returns undefined when CLI agent URI is absent", () => {
    const selected = resolveRegistrationAgentUri(undefined);
    expect(selected).toBeUndefined();
  });

  it("throws on missing --agent-uri value", () => {
    expect(() => parseRegisterAgentErc8004Args(["--agent-uri"], {})).toThrow(
      "Missing value for --agent-uri"
    );
  });

  it("throws on unknown flags", () => {
    expect(() =>
      parseRegisterAgentErc8004Args(
        ["--env", "mainnet", "--agent-url", "https://agent.example/agent-card.json"],
        {}
      )
    ).toThrow('Unknown argument: "--agent-url"');
  });

  it("throws on unexpected positional arguments", () => {
    expect(() => parseRegisterAgentErc8004Args(["unexpected-token"], {})).toThrow(
      'Unexpected positional argument: "unexpected-token"'
    );
  });
});

describe("registerAgentErc8004", () => {
  let identityPath: string | undefined;

  beforeEach(() => {
    process.env.T3N_LOCAL_BACKEND = "mock";
  });

  afterEach(async () => {
    restoreEnv(envSnapshot);
    await cleanupTempFile(identityPath);
    identityPath = undefined;
  });

  it("rejects local registration mode", async () => {
    identityPath = createTempFilePath("register-agent-erc8004");
    await createIdentity({ networkTier: "local", outputPath: identityPath });

    await expect(
      registerAgentErc8004({
        networkTier: "local",
        identityConfigPath: identityPath,
        agentUri: "https://agent.example/.well-known/agent_card.json",
      })
    ).rejects.toThrow("does not support HEDERA_NETWORK=local");
  });

  it("uses AGENT_IDENTITY_CONFIG_PATH when --path is not provided", async () => {
    identityPath = createTempFilePath("register-agent-erc8004-env");
    await createIdentity({ networkTier: "local", outputPath: identityPath });
    process.env.AGENT_IDENTITY_CONFIG_PATH = identityPath;

    const resolvedPath = resolveRegistrationIdentityPath(
      undefined,
      process.env.AGENT_IDENTITY_CONFIG_PATH
    );
    expect(resolvedPath).toBe(identityPath);

    await expect(
      registerAgentErc8004({
        networkTier: "local",
        agentUri: "https://agent.example/.well-known/agent_card.json",
      })
    ).rejects.toThrow("does not support HEDERA_NETWORK=local");
  });

  it("fails when identity path is missing", async () => {
    delete process.env.AGENT_IDENTITY_CONFIG_PATH;

    await expect(
      registerAgentErc8004({
        agentUri: "https://agent.example/.well-known/agent_card.json",
      })
    ).rejects.toThrow("Agent identity configuration path not set");
  });

  it("fails when identity file does not exist", async () => {
    identityPath = createTempFilePath("register-agent-erc8004-missing");

    await expect(
      registerAgentErc8004({
        identityConfigPath: identityPath,
        agentUri: "https://agent.example/.well-known/agent_card.json",
      })
    ).rejects.toThrow("Agent identity configuration file not found");
  });

  it("fails when agent URI is empty", async () => {
    identityPath = createTempFilePath("register-agent-erc8004-empty-uri");
    await createIdentity({ networkTier: "local", outputPath: identityPath });

    await expect(
      registerAgentErc8004({
        networkTier: "testnet",
        identityConfigPath: identityPath,
        agentUri: "   ",
      })
    ).rejects.toThrow("Agent URI is required");
  });

  it("formats dual-registration output clearly", () => {
    const message = formatRegisterAgentErc8004Message({
      did: "did:t3n:06d8e43f337652f8effac7f5218cb8fdab5cd286",
      agentUri: "https://agent.example/.well-known/agent_card.json",
      verified: true,
      network: "testnet",
      identityConfigPath: "/tmp/agent_identity.json",
      t3n: {
        txHash: "0x" + "a".repeat(64),
        verified: true,
        runtimeAgentUri: "https://agent.example/.well-known/agent_card.json",
        tier: "staging",
        endpointMode: "local CCF override (Hedera remains non-local)",
        apiUrl: "http://127.0.0.1:3002",
        runtimeApiUrl: "http://127.0.0.1:3002/api/rpc",
      },
      hedera: {
        agentId: "9",
        owner: "0x" + "b".repeat(40),
        tokenUri: "https://agent.example/.well-known/agent_card.json",
        txHash: "0x" + "c".repeat(64),
        chainId: 296,
        identityRegistryAddress: TEST_IDENTITY_REGISTRY_ADDRESS,
        operatorAccountId: "0.0.12345",
        operatorAddress: "0x" + "d".repeat(40),
        explorerTxUrl:
          "https://hashscan.io/testnet/transaction/0x" + "c".repeat(64),
        verified: true,
        created: true,
        updated: false,
        balanceHbar: "12.5",
      },
    });

    expect(message).toContain("ERC-8004 dual registration completed.");
    expect(message).toContain("T3N tx hash:");
    expect(message).toContain("Hedera tx hash:");
    expect(message).toContain("Hedera agent ID: 9");
    expect(message).toContain("Hedera operator account used: 0.0.12345");
    expect(message).toContain("T3N tier: staging");
    expect(message).toContain("T3N endpoint mode: local CCF override (Hedera remains non-local)");
    expect(message).toContain("T3N API URL: http://127.0.0.1:3002");
    expect(message).toContain("T3N runtime API URL: http://127.0.0.1:3002/api/rpc");
    expect(message).toContain(
      "Hedera explorer: https://hashscan.io/testnet/transaction/0x" + "c".repeat(64)
    );
  });
});
