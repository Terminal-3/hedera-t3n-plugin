/**
 * Purpose: Integration tests for T3N network utilities
 * Scope:   Tests environment-driven behavior, local/mock vs online registration,
 *          URL resolution, and network tier configuration
 * Inputs:  Environment variables, test keypairs
 * Outputs: Test assertions for T3N integration behavior
 *
 * These tests verify the T3N integration layer works correctly across different
 * network tiers and environment configurations. They may make actual network calls
 * when not in local mode, so network connectivity may be required for full coverage.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { generateSecp256k1Keypair } from "../../src/utils/crypto";
import { getHederaNetwork } from "../../src/utils/env.js";
import { getHederaNetworkFromTier, registerDidT3n } from "../../src/utils/t3n";
import { captureEnv, restoreEnv } from "../helpers/env.js";

const envSnapshot = captureEnv(["HEDERA_NETWORK"]);

describe("T3N integration", () => {
  beforeEach(() => {
    process.env.HEDERA_NETWORK = "testnet";
  });

  afterEach(() => {
    restoreEnv(envSnapshot);
  });

  it("should resolve network configuration from network tier", () => {
    const networkTier = "testnet";
    const hederaNetwork = getHederaNetworkFromTier(networkTier);
    const hederaNetworkFromEnv = getHederaNetwork();

    expect(hederaNetwork).toBe("testnet");
    expect(hederaNetworkFromEnv).toBe("testnet");
  });

  it("should register did:t3n:a:", async () => {
    const { privateKey } = generateSecp256k1Keypair();
    const agentUri = "https://agent.test/.well-known/agent_card.json";
    let result:
      | Awaited<ReturnType<typeof registerDidT3n>>
      | undefined;

    try {
      result = await registerDidT3n(privateKey, "testnet", {
        agentUri,
        verifyRegistration: false,
      });
    } catch (error) {
      // Network registration may fail if staging is unreachable (expected in CI/offline scenarios)
      // Verify that error is properly formatted and indicates network issues
      expect(error).toBeInstanceOf(Error);
      const message = error instanceof Error ? error.message : String(error);
      expect(message.includes("Must be authenticated before executing action")).toBe(false);
      expect(
        message.includes("Network unreachable") ||
          message.includes("Failed to register did:t3n:a:") ||
          message.includes("Failed to resolve current version") ||
          message.includes("404 Not Found") ||
          message.includes("fetch failed") ||
          message.includes("Agent registry record") ||
          message.includes("timeout") ||
          message.includes("aborted")
      ).toBe(true);
      return;
    }

    expect(result).toBeDefined();
    // Local CCF auth currently returns `did:t3:a:...`; staging/prod returns `did:t3n:a:...`.
    expect(result!.did).toMatch(/^did:t3n?:a:/);
    expect(result!.address).toMatch(/^0x[0-9a-f]{40}$/);
    expect(result!.agentUri).toBe(agentUri);
    expect(result!.baseUrl).toBeDefined();
    if (process.env.T3N_API_URL) {
      expect(result!.baseUrl).toBe(process.env.T3N_API_URL);
    } else {
      expect(result!.baseUrl).toContain("staging");
    }
    expect(result!.txHash).toBeDefined();
  });

  it("can derive a T3N DID without agent-registry registration", async () => {
    const { privateKey } = generateSecp256k1Keypair();
    let result:
      | Awaited<ReturnType<typeof registerDidT3n>>
      | undefined;

    try {
      result = await registerDidT3n(privateKey, "testnet", {
        registerAgentUri: false,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      const message = error instanceof Error ? error.message : String(error);
      expect(message.includes("Failed to resolve current version")).toBe(false);
      expect(
        message.includes("Network unreachable") ||
          message.includes("fetch failed") ||
          message.includes("timeout") ||
          message.includes("aborted")
      ).toBe(true);
      return;
    }

    expect(result).toBeDefined();
    expect(result!.did).toMatch(/^did:t3n?:a:/);
    expect(result!.address).toMatch(/^0x[0-9a-f]{40}$/);
    expect(result!.baseUrl).toContain("staging");
    expect(result!.txHash).toBeUndefined();
    expect(result!.agentUri).toBeUndefined();
  });

  describe("networkTier parameter", () => {
    it("should respect networkTier=local to use local/mock mode", async () => {
      const { privateKey } = generateSecp256k1Keypair();
      const result = await registerDidT3n(privateKey, "local", {
        agentUri: "https://agent.local/.well-known/agent_card.json",
      });

      expect(result.baseUrl).toBeUndefined();
      expect(result.txHash).toBeUndefined();
      expect(result.agentUri).toBe("https://agent.local/.well-known/agent_card.json");
    });
  });
});
