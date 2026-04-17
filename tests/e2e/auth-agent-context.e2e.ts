import { existsSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname } from "path";

import { it } from "vitest";

import { validateStoredCredentials } from "../../src/utils/validation.js";
import { registerE2eSuiteContext } from "./helpers/e2e-suite-context.js";
import {
  AUTH_AGENT_CONTEXT_FOLLOW_UP_PROMPT,
  AUTH_AGENT_CONTEXT_USER_PROMPT,
  IDEMPOTENT_SIDE_EFFECT_INVOCATION,
  assertNonEmptyString,
  assertPathsMatch,
  describeE2e,
  healthCheckResult,
  LLM_PROVIDER_DISPLAY,
  LLM_MODEL_DISPLAY,
  type AuthAgentContextToolParsedRaw,
} from "./helpers/e2e-suite-config.js";
import { createTempIdentityPath } from "./helpers/test-identity.js";
import { invokeAgentTool } from "./helpers/tool-invocation.js";

const suite = registerE2eSuiteContext();

describeE2e(`E2E: ${LLM_PROVIDER_DISPLAY} (${LLM_MODEL_DISPLAY}) -> Auth context`, () => {
  it(`Phase A — health: ${LLM_PROVIDER_DISPLAY} model is reachable`, () => {
    if (!healthCheckResult?.ok) {
      throw new Error(`Health check failed: ${healthCheckResult?.reason ?? "unknown"}`);
    }
  });

  it("Phase B — auth-context: missing identity -> IDENTITY_CONFIG_MISSING", async () => {
    const agentSetup = suite.getAgentSetup();

    const testConfigPath = createTempIdentityPath("e2e-missing-identity");
    suite.setTestConfigPath(testConfigPath);
    process.env.AGENT_IDENTITY_CONFIG_PATH = testConfigPath;

    if (existsSync(testConfigPath)) {
      throw new Error(`Expected no identity file at ${testConfigPath}`);
    }

    const { toolCall } = await invokeAgentTool({
      agent: agentSetup.agent,
      cleanup: agentSetup.cleanup,
      responseParser: agentSetup.responseParser,
      threadId: "e2e-auth-context-missing-identity",
      userPrompt: AUTH_AGENT_CONTEXT_USER_PROMPT,
      followUpPrompt: AUTH_AGENT_CONTEXT_FOLLOW_UP_PROMPT,
      expectedToolNames: ["AUTH_AGENT_CONTEXT", "auth_agent_context"],
      expectedToolLabel: "AUTH_AGENT_CONTEXT",
      ...IDEMPOTENT_SIDE_EFFECT_INVOCATION,
    });

    const parsedData = toolCall.parsedData?.raw as AuthAgentContextToolParsedRaw | undefined;
    if (!parsedData?.success) {
      throw new Error(`Expected successful tool execution envelope. ${JSON.stringify(parsedData)}`);
    }
    if (parsedData.ready !== false) {
      throw new Error(`Expected ready=false. ${JSON.stringify(parsedData)}`);
    }
    if (parsedData.identity?.error !== "IDENTITY_CONFIG_MISSING") {
      throw new Error(`Expected IDENTITY_CONFIG_MISSING. ${JSON.stringify(parsedData)}`);
    }
    if (!Array.isArray(parsedData.nextSteps) || parsedData.nextSteps.length === 0) {
      throw new Error(`Expected non-empty nextSteps. ${JSON.stringify(parsedData)}`);
    }
  });

  it("Phase C — auth-context: invalid identity -> IDENTITY_CONFIG_INVALID", async () => {
    const agentSetup = suite.getAgentSetup();

    const validIdentityPath = await suite.ensureReusableIdentityFile();
    const raw = await readFile(validIdentityPath, "utf8");
    const identity = JSON.parse(raw) as Record<string, unknown>;
    delete identity.private_key;

    const testConfigPath = createTempIdentityPath("e2e-invalid-identity");
    suite.setTestConfigPath(testConfigPath);
    process.env.AGENT_IDENTITY_CONFIG_PATH = testConfigPath;
    await mkdir(dirname(testConfigPath), { recursive: true });
    await writeFile(testConfigPath, JSON.stringify(identity, null, 2), "utf8");

    const { toolCall } = await invokeAgentTool({
      agent: agentSetup.agent,
      cleanup: agentSetup.cleanup,
      responseParser: agentSetup.responseParser,
      threadId: "e2e-auth-context-invalid-identity",
      userPrompt: AUTH_AGENT_CONTEXT_USER_PROMPT,
      followUpPrompt: AUTH_AGENT_CONTEXT_FOLLOW_UP_PROMPT,
      expectedToolNames: ["AUTH_AGENT_CONTEXT", "auth_agent_context"],
      expectedToolLabel: "AUTH_AGENT_CONTEXT",
      ...IDEMPOTENT_SIDE_EFFECT_INVOCATION,
    });

    const parsedData = toolCall.parsedData?.raw as AuthAgentContextToolParsedRaw | undefined;
    if (!parsedData?.success) {
      throw new Error(`Expected successful tool execution envelope. ${JSON.stringify(parsedData)}`);
    }
    if (parsedData.ready !== false) {
      throw new Error(`Expected ready=false. ${JSON.stringify(parsedData)}`);
    }
    if (parsedData.identity?.error !== "IDENTITY_CONFIG_INVALID") {
      throw new Error(`Expected IDENTITY_CONFIG_INVALID. ${JSON.stringify(parsedData)}`);
    }
  });

  it("Phase D — auth-context: valid identity -> readiness snapshot", async () => {
    const agentSetup = suite.getAgentSetup();

    const testConfigPath = await suite.ensureReusableIdentityFile();
    suite.setTestConfigPath(testConfigPath);
    process.env.AGENT_IDENTITY_CONFIG_PATH = testConfigPath;

    const { toolCall } = await invokeAgentTool({
      agent: agentSetup.agent,
      cleanup: agentSetup.cleanup,
      responseParser: agentSetup.responseParser,
      threadId: "e2e-auth-context-valid",
      userPrompt: AUTH_AGENT_CONTEXT_USER_PROMPT,
      followUpPrompt: AUTH_AGENT_CONTEXT_FOLLOW_UP_PROMPT,
      expectedToolNames: ["AUTH_AGENT_CONTEXT", "auth_agent_context"],
      expectedToolLabel: "AUTH_AGENT_CONTEXT",
      ...IDEMPOTENT_SIDE_EFFECT_INVOCATION,
    });

    const parsedData = toolCall.parsedData?.raw as AuthAgentContextToolParsedRaw | undefined;
    if (!parsedData?.success) {
      throw new Error(`AUTH_AGENT_CONTEXT did not report success. ${JSON.stringify(parsedData)}`);
    }
    if (!parsedData.identity?.available || !parsedData.identity.valid) {
      throw new Error(`Expected valid identity context. ${JSON.stringify(parsedData)}`);
    }
    assertPathsMatch(
      testConfigPath,
      assertNonEmptyString(parsedData.identity.path, "identity path"),
      "AUTH_AGENT_CONTEXT"
    );

    const fileContent = await readFile(testConfigPath, "utf8");
    validateStoredCredentials(JSON.parse(fileContent) as Record<string, unknown>);

    if (typeof parsedData.ready !== "boolean") {
      throw new Error(`Expected boolean ready flag. ${JSON.stringify(parsedData)}`);
    }
    if (!Array.isArray(parsedData.nextSteps)) {
      throw new Error(`Expected nextSteps array. ${JSON.stringify(parsedData)}`);
    }
  });
});
