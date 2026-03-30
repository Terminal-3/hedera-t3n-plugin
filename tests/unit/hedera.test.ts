/**
 * Purpose: Unit tests for Hedera wallet address utilities
 * Scope:   Tests address derivation from private keys, address format validation
 * Inputs:  Test private keys and addresses
 * Outputs: Test assertions for Hedera utility behavior
 */

import { describe, expect, it } from "vitest";

import {
  deriveHederaAddress,
  resolveHederaIdentityRegistryConfig,
  validateHederaAddress,
} from "../../src/utils/hedera";

const PRIVATE_KEY = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
const TEST_IDENTITY_REGISTRY_ADDRESS = "0x1111111111111111111111111111111111111111";

describe("hedera utils", () => {
  it("derives a lowercase EVM address", () => {
    const address = deriveHederaAddress(PRIVATE_KEY);
    expect(address).toMatch(/^0x[0-9a-f]{40}$/);
  });

  it("validates address format", () => {
    expect(validateHederaAddress("0x" + "a".repeat(40))).toBe(true);
    expect(validateHederaAddress("0x1234")).toBe(false);
  });

  it("resolves Hedera testnet identity registry config from env override", async () => {
    const config = await resolveHederaIdentityRegistryConfig("testnet", {
      env: {
        HEDERA_NETWORK: "testnet",
        HEDERA_IDENTITY_REGISTRY_ADDRESS: TEST_IDENTITY_REGISTRY_ADDRESS,
      },
    });

    expect(config.chainId).toBe(296);
    expect(config.jsonRpcUrl).toBe("https://testnet.hashio.io/api");
    expect(config.identityRegistryAddress.toLowerCase()).toBe(TEST_IDENTITY_REGISTRY_ADDRESS);
  });

  it("supports the legacy misspelled env alias for the registry address", async () => {
    const config = await resolveHederaIdentityRegistryConfig("testnet", {
      env: {
        HEDERA_NETWORK: "testnet",
        HEDERA_IDENTITY_REGISTRY_ADDRES: TEST_IDENTITY_REGISTRY_ADDRESS,
      },
    });

    expect(config.identityRegistryAddress.toLowerCase()).toBe(TEST_IDENTITY_REGISTRY_ADDRESS);
  });

  it("uses the requested network tier even when ambient HEDERA_NETWORK points elsewhere", async () => {
    const config = await resolveHederaIdentityRegistryConfig("mainnet", {
      env: { HEDERA_NETWORK: "testnet" },
    });

    expect(config.chainId).toBe(295);
    expect(config.jsonRpcUrl).toBe("https://mainnet.hashio.io/api");
    expect(config.identityRegistryAddress.toLowerCase()).toBe(
      "0x8004a169fb4a3325136eb29fa0ceb6d2e539a432"
    );
    expect(config.explorerUrl).toBe("https://hashscan.io/mainnet");
  });

  it("still honors explicit registry env overrides on top of the requested network tier", async () => {
    const config = await resolveHederaIdentityRegistryConfig("mainnet", {
      env: {
        HEDERA_NETWORK: "testnet",
        HEDERA_IDENTITY_REGISTRY_ADDRESS: TEST_IDENTITY_REGISTRY_ADDRESS,
      },
    });

    expect(config.chainId).toBe(295);
    expect(config.jsonRpcUrl).toBe("https://mainnet.hashio.io/api");
    expect(config.identityRegistryAddress.toLowerCase()).toBe(TEST_IDENTITY_REGISTRY_ADDRESS);
  });

  it("resolves packaged mainnet registry defaults when no override is provided", async () => {
    const config = await resolveHederaIdentityRegistryConfig("mainnet", {
      env: { HEDERA_NETWORK: "mainnet" },
    });

    expect(config.chainId).toBe(295);
    expect(config.jsonRpcUrl).toBe("https://mainnet.hashio.io/api");
    expect(config.identityRegistryAddress.toLowerCase()).toBe(
      "0x8004a169fb4a3325136eb29fa0ceb6d2e539a432"
    );
  });
});
