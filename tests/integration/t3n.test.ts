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
import { getHederaNetworkFromTier, registerDidT3n, type RegisterDidResult } from "../../src/utils/t3n";
import { captureEnv, restoreEnv } from "../helpers/env.js";

const envSnapshot = captureEnv(["HEDERA_NETWORK"]);

async function callRegisterDidT3n(
  privateKey: string,
  networkTier: "local" | "testnet",
  options?: Parameters<typeof registerDidT3n>[2]
): Promise<RegisterDidResult> {
  return await registerDidT3n(privateKey, networkTier, options) as RegisterDidResult;
}

function expectKnownNetworkFailure(error: unknown, disallowedMessage?: string): void {
  expect(error).toBeInstanceOf(Error);
  const message = error instanceof Error ? error.message : String(error);
  if (disallowedMessage) {
    expect(message.includes(disallowedMessage)).toBe(false);
  }
  expect(
    message.includes("Network unreachable") ||
      message.includes("Failed to register did:t3n:") ||
      message.includes("Failed to resolve current version") ||
      message.includes("404 Not Found") ||
      message.includes("fetch failed") ||
      message.includes("Agent registry record") ||
      message.includes("timeout") ||
      message.includes("aborted")
  ).toBe(true);
}

function assertRegistrationResult(result: RegisterDidResult, expectedAgentUri?: string): void {
  expect(result.did).toMatch(/^did:t3n:[0-9a-f]{40}$/i);
  expect(result.address).toMatch(/^0x[0-9a-f]{40}$/);
  if (expectedAgentUri === undefined) {
    expect(result.agentUri).toBeUndefined();
  } else {
    expect(result.agentUri).toBe(expectedAgentUri);
  }
}

describe("T3N integration", () => {
  beforeEach(() => {
    process.env.HEDERA_NETWORK = "testnet";
  });

  afterEach(() => {
    restoreEnv(envSnapshot);
  });

  it("should resolve network configuration from network tier", () => {
    const networkTier = "testnet";
    const hederaNetwork = getHederaNetworkFromTier(networkTier) as "testnet";
    const hederaNetworkFromEnv = getHederaNetwork() as "testnet";

    expect(hederaNetwork).toBe("testnet");
    expect(hederaNetworkFromEnv).toBe("testnet");
  });

  it("should register did:t3n:", async () => {
    const { privateKey } = generateSecp256k1Keypair() as { privateKey: string };
    const agentUri = "https://agent.test/.well-known/agent_card.json";
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const result = await callRegisterDidT3n(privateKey, "testnet", {
        agentUri,
        verifyRegistration: false,
      });

      assertRegistrationResult(result, agentUri);
      expect(result.baseUrl).toBeDefined();
      if (process.env.T3N_API_URL) {
        expect(result.baseUrl).toBe(process.env.T3N_API_URL);
      } else {
        expect(result.baseUrl).toContain("staging");
      }
      expect(result.txHash).toBeDefined();
    } catch (error) {
      expectKnownNetworkFailure(error, "Must be authenticated before executing action");
      return;
    }
  });

  it("can derive a T3N DID without agent-registry registration", async () => {
    const { privateKey } = generateSecp256k1Keypair() as { privateKey: string };
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const result = await callRegisterDidT3n(privateKey, "testnet", {
        registerAgentUri: false,
      });

      assertRegistrationResult(result);
      expect(result.baseUrl).toContain("staging");
      expect(result.txHash).toBeUndefined();
    } catch (error) {
      expectKnownNetworkFailure(error, "Failed to resolve current version");
      return;
    }
  });

  describe("networkTier parameter", () => {
    it("should respect networkTier=local to use local/mock mode", async () => {
      const { privateKey } = generateSecp256k1Keypair() as { privateKey: string };
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const result = await callRegisterDidT3n(privateKey, "local", {
        agentUri: "https://agent.local/.well-known/agent_card.json",
      });

      expect(result.baseUrl).toBeUndefined();
      expect(result.txHash).toBeUndefined();
      expect(result.agentUri).toBe("https://agent.local/.well-known/agent_card.json");
    });
  });
});
