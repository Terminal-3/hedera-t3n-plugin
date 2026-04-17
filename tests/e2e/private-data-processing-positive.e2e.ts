import { it } from "vitest";

import { registerE2eSuiteContext } from "./helpers/e2e-suite-context.js";
import {
  E2E_USER_DID,
  IDEMPOTENT_SIDE_EFFECT_INVOCATION,
  LLM_PROVIDER_DISPLAY,
  LLM_MODEL_DISPLAY,
  PRIVATE_DATA_PROCESSING_FOLLOW_UP_PROMPT,
  PRIVATE_DATA_PROCESSING_USER_PROMPT,
  describeE2e,
  type PrivateDataProcessingToolParsedRaw,
} from "./helpers/e2e-suite-config.js";
import { invokeAgentTool } from "./helpers/tool-invocation.js";

const suite = registerE2eSuiteContext();
const REQUIRE_PRIVATE_DATA_SUCCESS = process.env.HEDERA_E2E_REQUIRE_PRIVATE_DATA_SUCCESS === "1";

describeE2e(`E2E: ${LLM_PROVIDER_DISPLAY} (${LLM_MODEL_DISPLAY}) -> Private data processing (positive)`, () => {
  it("Phase F — private-data: valid identity -> structured result", async () => {
    const agentSetup = suite.getAgentSetup();

    const testConfigPath = await suite.ensureReusableIdentityFile();
    suite.setTestConfigPath(testConfigPath);
    process.env.AGENT_IDENTITY_CONFIG_PATH = testConfigPath;

    const { toolCall } = await invokeAgentTool({
      agent: agentSetup.agent,
      cleanup: agentSetup.cleanup,
      responseParser: agentSetup.responseParser,
      threadId: "e2e-private-data-processing",
      userPrompt: PRIVATE_DATA_PROCESSING_USER_PROMPT,
      followUpPrompt: PRIVATE_DATA_PROCESSING_FOLLOW_UP_PROMPT,
      expectedToolNames: ["PRIVATE_DATA_PROCESSING", "private_data_processing"],
      expectedToolLabel: "PRIVATE_DATA_PROCESSING",
      allowedToolNames: ["AUTH_AGENT_CONTEXT", "auth_agent_context"],
      ...IDEMPOTENT_SIDE_EFFECT_INVOCATION,
    });

    const parsedData = toolCall.parsedData?.raw as PrivateDataProcessingToolParsedRaw | undefined;
    if (!parsedData) {
      throw new Error("PRIVATE_DATA_PROCESSING did not produce parsed output.");
    }
    if (parsedData.userDid !== E2E_USER_DID) {
      throw new Error(`Expected userDid ${E2E_USER_DID}, got ${String(parsedData.userDid)}`);
    }
    if (!Array.isArray(parsedData.unsupportedFields)) {
      throw new Error(`Expected unsupportedFields array. ${JSON.stringify(parsedData)}`);
    }
    if (!parsedData.guidance || !Array.isArray(parsedData.guidance.steps)) {
      throw new Error(`Expected structured guidance. ${JSON.stringify(parsedData)}`);
    }

    if (REQUIRE_PRIVATE_DATA_SUCCESS) {
      if (parsedData.success !== true) {
        throw new Error(
          `Expected deterministic PRIVATE_DATA_PROCESSING success. ${JSON.stringify(parsedData)}`
        );
      }
      if (!parsedData.fieldExistence || !Array.isArray(parsedData.missingFields)) {
        throw new Error(`Expected success payload shape. ${JSON.stringify(parsedData)}`);
      }
      return;
    }

    if (parsedData.success === true) {
      if (!parsedData.fieldExistence || !Array.isArray(parsedData.missingFields)) {
        throw new Error(`Expected success payload shape. ${JSON.stringify(parsedData)}`);
      }
      return;
    }

    const allowedErrors = new Set([
      "PROFILE_NOT_FOUND",
      "AUTHORIZATION_REQUIRED",
      "PROFILE_CHECK_FAILED",
      "AUTH_AGENT_CONTEXT_NOT_READY",
      "NO_T3N_AUTH_SESSION",
    ]);
    if (!allowedErrors.has(parsedData.error ?? "")) {
      throw new Error(`Unexpected PRIVATE_DATA_PROCESSING error contract. ${JSON.stringify(parsedData)}`);
    }
  });
});
