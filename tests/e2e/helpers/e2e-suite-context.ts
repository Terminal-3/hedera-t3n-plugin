import { afterAll, afterEach, beforeAll } from "vitest";

import { clearT3nSession } from "../../../src/utils/t3n-session.js";
import { captureEnv, restoreEnv } from "../../helpers/env.js";
import { createLlmAgent, type AgentSetup } from "./agent-setup.js";
import { cleanupIdentityFile, createTestIdentityFile } from "./test-identity.js";
import { type RequiredConfig, getRequiredConfig } from "./e2e-suite-config.js";

type SuiteContext = {
  getAgentSetup: () => AgentSetup;
  getRequiredConfig: () => RequiredConfig;
  ensureReusableIdentityFile: () => Promise<string>;
  setTestConfigPath: (path: string) => void;
};

export function registerE2eSuiteContext(): SuiteContext {
  const envSnapshot = captureEnv(["AGENT_IDENTITY_CONFIG_PATH", "HEDERA_NETWORK"]);

  let agentSetup: AgentSetup | null = null;
  let agentConfig: RequiredConfig | null = null;
  let reusableIdentityPath = "";
  let testConfigPath = "";

  beforeAll(() => {
    process.env.HEDERA_NETWORK = "testnet";
    agentConfig = getRequiredConfig();
    if (agentConfig) {
      agentSetup = createLlmAgent(agentConfig);
    }
  });

  afterEach(async () => {
    agentSetup?.cleanup();
    clearT3nSession();
    if (testConfigPath && testConfigPath !== reusableIdentityPath) {
      await cleanupIdentityFile(testConfigPath);
    }
    testConfigPath = "";
    delete process.env.AGENT_IDENTITY_CONFIG_PATH;
  });

  afterAll(async () => {
    agentSetup?.cleanup();
    clearT3nSession();
    if (reusableIdentityPath) {
      await cleanupIdentityFile(reusableIdentityPath);
    }
    restoreEnv(envSnapshot);
  });

  return {
    getAgentSetup: (): AgentSetup => {
      if (!agentSetup) {
        throw new Error("Agent was not initialized.");
      }
      return agentSetup;
    },
    getRequiredConfig: (): RequiredConfig => {
      if (!agentConfig) {
        throw new Error("E2E configuration is not available.");
      }
      return agentConfig;
    },
    ensureReusableIdentityFile: async (): Promise<string> => {
      if (!reusableIdentityPath) {
        reusableIdentityPath = await createTestIdentityFile();
      }
      return reusableIdentityPath;
    },
    setTestConfigPath: (path: string): void => {
      testConfigPath = path;
    },
  };
}
