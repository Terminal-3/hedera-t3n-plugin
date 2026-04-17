import { existsSync } from "fs";

import { it } from "vitest";

import { getValidatedT3nSessionState } from "../../src/utils/t3n-session.js";
import { registerE2eSuiteContext } from "./helpers/e2e-suite-context.js";
import { formatFailureDiagnostics, summarizeT3nSessionState } from "./helpers/e2e-diagnostics.js";
import {
  IDEMPOTENT_SIDE_EFFECT_INVOCATION,
  LLM_MODEL,
  LLM_PROVIDER,
  LLM_PROVIDER_DISPLAY,
  LLM_MODEL_DISPLAY,
  PRIVATE_DATA_PROCESSING_FOLLOW_UP_PROMPT,
  PRIVATE_DATA_PROCESSING_USER_PROMPT,
  describeE2e,
  type PrivateDataProcessingToolParsedRaw,
} from "./helpers/e2e-suite-config.js";
import { createTempIdentityPath } from "./helpers/test-identity.js";
import { invokeAgentTool } from "./helpers/tool-invocation.js";

const suite = registerE2eSuiteContext();
const REQUIRE_EXACT_SINGLE_PRIVATE_DATA_CALL = LLM_PROVIDER !== "ollama";

describeE2e(`E2E: ${LLM_PROVIDER_DISPLAY} (${LLM_MODEL_DISPLAY}) -> Private data processing (negative)`, () => {
  it("Phase E — private-data: no identity -> AUTH_AGENT_CONTEXT_NOT_READY", async () => {
    const agentSetup = suite.getAgentSetup();
    const threadId = "e2e-private-data-missing-identity";
    const testConfigPath = createTempIdentityPath("e2e-private-data-missing-identity");
    suite.setTestConfigPath(testConfigPath);
    process.env.AGENT_IDENTITY_CONFIG_PATH = testConfigPath;

    if (existsSync(testConfigPath)) {
      throw new Error(`Expected no identity file at ${testConfigPath}`);
    }

    const sessionBefore = summarizeT3nSessionState(getValidatedT3nSessionState());
    if (sessionBefore.valid) {
      throw new Error(`Expected no pre-existing T3N session. ${JSON.stringify(sessionBefore)}`);
    }

    const identityFileExistedBefore = existsSync(testConfigPath);
    const { toolCall, diagnostics } = await invokeAgentTool({
      agent: agentSetup.agent,
      cleanup: agentSetup.cleanup,
      responseParser: agentSetup.responseParser,
      threadId,
      userPrompt: PRIVATE_DATA_PROCESSING_USER_PROMPT,
      followUpPrompt: PRIVATE_DATA_PROCESSING_FOLLOW_UP_PROMPT,
      expectedToolNames: ["PRIVATE_DATA_PROCESSING", "private_data_processing"],
      expectedToolLabel: "PRIVATE_DATA_PROCESSING",
      allowedToolNames: ["AUTH_AGENT_CONTEXT", "auth_agent_context"],
      requireExactlyOneMatchingToolCall: REQUIRE_EXACT_SINGLE_PRIVATE_DATA_CALL,
      ...IDEMPOTENT_SIDE_EFFECT_INVOCATION,
    });

    const parsedData = toolCall.parsedData?.raw as PrivateDataProcessingToolParsedRaw | undefined;
    const sessionAfter = summarizeT3nSessionState(getValidatedT3nSessionState());
    const failureDiagnostics = formatFailureDiagnostics({
      provider: LLM_PROVIDER,
      model: LLM_MODEL,
      threadId,
      identityPath: testConfigPath,
      identityFileExistedBefore,
      sessionBefore,
      sessionAfter,
      parsedToolNames: diagnostics.parsedToolNames,
      rawPayload: parsedData,
    });

    if (parsedData?.success !== false) {
      throw new Error(
        `Expected PRIVATE_DATA_PROCESSING failure. ${JSON.stringify(parsedData)}\n${failureDiagnostics}`
      );
    }
    if (parsedData.error !== "AUTH_AGENT_CONTEXT_NOT_READY") {
      throw new Error(
        `Expected AUTH_AGENT_CONTEXT_NOT_READY. ${JSON.stringify(parsedData)}\n${failureDiagnostics}`
      );
    }
    if (parsedData.authReady !== false || parsedData.authError !== "AUTH_AGENT_CONTEXT_NOT_READY") {
      throw new Error(
        `Expected auth readiness failure metadata. ${JSON.stringify(parsedData)}\n${failureDiagnostics}`
      );
    }
  });
});
