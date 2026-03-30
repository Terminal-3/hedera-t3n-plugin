/**
 * Purpose: Unit tests for environment variable management utilities
 * Scope:   Tests env var parsing, defaults, validation, preservation across dotenv.config()
 * Inputs:  Environment objects with various configurations
 * Outputs: Test assertions for env utility behavior
 */

import { describe, expect, it } from "vitest";

import {
  capturePreservedEnvKeys,
  getAgentIdentityConfigPath,
  getHederaIdentityRegistryAddress,
  getHederaNetwork,
  getHederaNetworkExplicit,
  getIdentityEnvironment,
  getT3nApiUrlOverride,
  getT3nRuntimeApiUrlOverride,
  getT3nLocalBackend,
  getT3nMlKemPublicKeyFileOverride,
  getT3nMlKemPublicKeyOverride,
  isTestEnvironment,
  isT3nLocal,
  preserveEnvKeysBeforeDotenv,
  restorePreservedEnvKeys,
  shouldUseLiveLocalT3nBackend,
} from "../../src/utils/env.js";

describe("env manager", () => {
  describe("isT3nLocal", () => {
    it("returns true when HEDERA_NETWORK=local", () => {
      expect(isT3nLocal({ HEDERA_NETWORK: "local" })).toBe(true);
    });
    it("returns false when HEDERA_NETWORK=testnet", () => {
      expect(isT3nLocal({ HEDERA_NETWORK: "testnet" })).toBe(false);
    });
    it("returns false when HEDERA_NETWORK=mainnet", () => {
      expect(isT3nLocal({ HEDERA_NETWORK: "mainnet" })).toBe(false);
    });
    it("returns false when unset (defaults to testnet)", () => {
      expect(isT3nLocal({})).toBe(false);
    });
    it("is case-insensitive", () => {
      expect(isT3nLocal({ HEDERA_NETWORK: "LOCAL" })).toBe(true);
    });
  });

  describe("getHederaNetworkExplicit / getHederaNetwork", () => {
    it("returns mainnet when HEDERA_NETWORK=mainnet", () => {
      expect(getHederaNetworkExplicit({ HEDERA_NETWORK: "mainnet" })).toBe("mainnet");
      expect(getHederaNetwork({ HEDERA_NETWORK: "mainnet" })).toBe("mainnet");
    });
    it("returns testnet when HEDERA_NETWORK=testnet", () => {
      expect(getHederaNetworkExplicit({ HEDERA_NETWORK: "testnet" })).toBe("testnet");
      expect(getHederaNetwork({ HEDERA_NETWORK: "testnet" })).toBe("testnet");
    });
    it("returns local when HEDERA_NETWORK=local", () => {
      expect(getHederaNetworkExplicit({ HEDERA_NETWORK: "local" })).toBe("local");
      expect(getHederaNetwork({ HEDERA_NETWORK: "local" })).toBe("local");
    });
    it("returns undefined when unset (explicit), testnet (getter default)", () => {
      expect(getHederaNetworkExplicit({})).toBeUndefined();
      expect(getHederaNetwork({})).toBe("testnet");
    });
    it("is case-insensitive", () => {
      expect(getHederaNetwork({ HEDERA_NETWORK: "LOCAL" })).toBe("local");
      expect(getHederaNetwork({ HEDERA_NETWORK: "TESTNET" })).toBe("testnet");
      expect(getHederaNetwork({ HEDERA_NETWORK: "MAINNET" })).toBe("mainnet");
    });
  });

  describe("getIdentityEnvironment", () => {
    it("returns testnet when unset (default, derives from HEDERA_NETWORK)", () => {
      expect(getIdentityEnvironment({})).toBe("testnet");
    });
    it("derives from HEDERA_NETWORK", () => {
      expect(getIdentityEnvironment({ HEDERA_NETWORK: "local" })).toBe("local");
      expect(getIdentityEnvironment({ HEDERA_NETWORK: "testnet" })).toBe("testnet");
      expect(getIdentityEnvironment({ HEDERA_NETWORK: "mainnet" })).toBe("mainnet");
    });
    it("is case-insensitive", () => {
      expect(getIdentityEnvironment({ HEDERA_NETWORK: "LOCAL" })).toBe("local");
      expect(getIdentityEnvironment({ HEDERA_NETWORK: "TESTNET" })).toBe("testnet");
      expect(getIdentityEnvironment({ HEDERA_NETWORK: "MAINNET" })).toBe("mainnet");
    });
  });

  describe("getAgentIdentityConfigPath", () => {
    it("returns path when set", () => {
      expect(getAgentIdentityConfigPath({ AGENT_IDENTITY_CONFIG_PATH: "/foo/bar.json" })).toBe(
        "/foo/bar.json"
      );
    });
    it("returns undefined when unset or empty", () => {
      expect(getAgentIdentityConfigPath({})).toBeUndefined();
      expect(getAgentIdentityConfigPath({ AGENT_IDENTITY_CONFIG_PATH: "" })).toBeUndefined();
      expect(getAgentIdentityConfigPath({ AGENT_IDENTITY_CONFIG_PATH: "   " })).toBeUndefined();
    });
  });

  describe("getHederaIdentityRegistryAddress", () => {
    it("returns the canonical env value when set", () => {
      expect(
        getHederaIdentityRegistryAddress({
          HEDERA_IDENTITY_REGISTRY_ADDRESS: "0x1111111111111111111111111111111111111111",
        })
      ).toBe("0x1111111111111111111111111111111111111111");
    });

    it("falls back to the legacy misspelled env alias", () => {
      expect(
        getHederaIdentityRegistryAddress({
          HEDERA_IDENTITY_REGISTRY_ADDRES: "0x2222222222222222222222222222222222222222",
        })
      ).toBe("0x2222222222222222222222222222222222222222");
    });

    it("returns undefined when unset or empty", () => {
      expect(getHederaIdentityRegistryAddress({})).toBeUndefined();
      expect(
        getHederaIdentityRegistryAddress({
          HEDERA_IDENTITY_REGISTRY_ADDRESS: "   ",
        })
      ).toBeUndefined();
    });
  });

  describe("isTestEnvironment", () => {
    it("returns true when NODE_ENV=test", () => {
      expect(isTestEnvironment({ NODE_ENV: "test" })).toBe(true);
    });
    it("returns true when VITEST is set", () => {
      expect(isTestEnvironment({ VITEST: "true" })).toBe(true);
    });
    it("returns false when neither set", () => {
      expect(isTestEnvironment({})).toBe(false);
    });
  });

  describe("local backend selection", () => {
    it("defaults local backend to mock", () => {
      expect(getT3nLocalBackend({})).toBe("mock");
    });

    it("accepts ccf as explicit local backend", () => {
      expect(getT3nLocalBackend({ T3N_LOCAL_BACKEND: "ccf" })).toBe("ccf");
      expect(getT3nLocalBackend({ T3N_LOCAL_BACKEND: " CCF " })).toBe("ccf");
    });

    it("uses live local backend only for local + ccf", () => {
      expect(
        shouldUseLiveLocalT3nBackend({
          HEDERA_NETWORK: "local",
          T3N_LOCAL_BACKEND: "ccf",
        })
      ).toBe(true);
      expect(
        shouldUseLiveLocalT3nBackend({
          HEDERA_NETWORK: "testnet",
          T3N_LOCAL_BACKEND: "ccf",
        })
      ).toBe(false);
      expect(
        shouldUseLiveLocalT3nBackend({
          HEDERA_NETWORK: "local",
          T3N_LOCAL_BACKEND: "mock",
        })
      ).toBe(false);
    });
  });

  describe("T3N URL overrides", () => {
    it("returns undefined when overrides are unset or blank", () => {
      expect(getT3nApiUrlOverride({})).toBeUndefined();
      expect(getT3nApiUrlOverride({ T3N_API_URL: "   " })).toBeUndefined();
      expect(getT3nRuntimeApiUrlOverride({})).toBeUndefined();
      expect(getT3nRuntimeApiUrlOverride({ T3N_RUNTIME_API_URL: "   " })).toBeUndefined();
    });

    it("returns trimmed override URLs when set", () => {
      expect(getT3nApiUrlOverride({ T3N_API_URL: " http://127.0.0.1:3000 " })).toBe(
        "http://127.0.0.1:3000"
      );
      expect(
        getT3nRuntimeApiUrlOverride({
          T3N_RUNTIME_API_URL: " http://127.0.0.1:3000/api/rpc ",
        })
      ).toBe("http://127.0.0.1:3000/api/rpc");
    });
  });

  describe("T3N ML-KEM public key overrides", () => {
    it("returns undefined when overrides are unset or blank", () => {
      expect(getT3nMlKemPublicKeyOverride({})).toBeUndefined();
      expect(getT3nMlKemPublicKeyOverride({ T3N_ML_KEM_PUBLIC_KEY: "   " })).toBeUndefined();
      expect(getT3nMlKemPublicKeyFileOverride({})).toBeUndefined();
      expect(
        getT3nMlKemPublicKeyFileOverride({ T3N_ML_KEM_PUBLIC_KEY_FILE: "   " })
      ).toBeUndefined();
    });

    it("returns trimmed ML-KEM overrides when set", () => {
      expect(
        getT3nMlKemPublicKeyOverride({
          T3N_ML_KEM_PUBLIC_KEY: " abc123== ",
        })
      ).toBe("abc123==");
      expect(
        getT3nMlKemPublicKeyFileOverride({
          T3N_ML_KEM_PUBLIC_KEY_FILE: " /tmp/node-1-keys.json ",
        })
      ).toBe("/tmp/node-1-keys.json");
    });
  });

  describe("preserveEnvKeysBeforeDotenv", () => {
    it("restores captured keys after restore", () => {
      process.env.HEDERA_NETWORK = "local";
      const restore = preserveEnvKeysBeforeDotenv();
      process.env.HEDERA_NETWORK = "overwritten";
      restore();
      expect(process.env.HEDERA_NETWORK).toBe("local");
      delete process.env.HEDERA_NETWORK;
    });
    it("capturePreservedEnvKeys / restorePreservedEnvKeys round-trip", () => {
      process.env.HEDERA_NETWORK = "local";
      const snapshot = capturePreservedEnvKeys(["HEDERA_NETWORK"]);
      process.env.HEDERA_NETWORK = "testnet";
      restorePreservedEnvKeys(snapshot);
      expect(process.env.HEDERA_NETWORK).toBe("local");
      delete process.env.HEDERA_NETWORK;
    });

    it("preserves local backend targeting overrides", () => {
      process.env.T3N_LOCAL_BACKEND = "ccf";
      process.env.T3N_API_URL = "http://127.0.0.1:3000";
      process.env.T3N_RUNTIME_API_URL = "http://127.0.0.1:3000/api/rpc";
      process.env.T3N_ML_KEM_PUBLIC_KEY = "abc123==";
      process.env.T3N_ML_KEM_PUBLIC_KEY_FILE = "/tmp/node-1-keys.json";
      const snapshot = capturePreservedEnvKeys([
        "T3N_LOCAL_BACKEND",
        "T3N_API_URL",
        "T3N_RUNTIME_API_URL",
        "T3N_ML_KEM_PUBLIC_KEY",
        "T3N_ML_KEM_PUBLIC_KEY_FILE",
      ]);
      process.env.T3N_LOCAL_BACKEND = "mock";
      process.env.T3N_API_URL = "https://example.invalid";
      process.env.T3N_RUNTIME_API_URL = "https://example.invalid/api/rpc";
      process.env.T3N_ML_KEM_PUBLIC_KEY = "def456==";
      process.env.T3N_ML_KEM_PUBLIC_KEY_FILE = "/tmp/node-2-keys.json";
      restorePreservedEnvKeys(snapshot);
      expect(process.env.T3N_LOCAL_BACKEND).toBe("ccf");
      expect(process.env.T3N_API_URL).toBe("http://127.0.0.1:3000");
      expect(process.env.T3N_RUNTIME_API_URL).toBe("http://127.0.0.1:3000/api/rpc");
      expect(process.env.T3N_ML_KEM_PUBLIC_KEY).toBe("abc123==");
      expect(process.env.T3N_ML_KEM_PUBLIC_KEY_FILE).toBe("/tmp/node-1-keys.json");
      delete process.env.T3N_LOCAL_BACKEND;
      delete process.env.T3N_API_URL;
      delete process.env.T3N_RUNTIME_API_URL;
      delete process.env.T3N_ML_KEM_PUBLIC_KEY;
      delete process.env.T3N_ML_KEM_PUBLIC_KEY_FILE;
    });
  });
});
