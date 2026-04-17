import { z } from "zod";

import type { Context, Tool } from "hedera-agent-kit";

import { buildPrivateDataProcessingResult } from "../utils/private-data-processing.js";
import {
  buildErrorResult,
  parseToolOutput,
  type ToolResult,
} from "../utils/tool-result.js";

const privateDataProcessingParamsSchema = z
  .object({
    userDid: z.string(),
    fields: z.array(z.string()),
  })
  .strict();

function buildHumanMessage(result: Awaited<ReturnType<typeof buildPrivateDataProcessingResult>>): string {
  if (!result.success && result.error === "AUTH_AGENT_CONTEXT_NOT_READY") {
    return "Private data processing could not start because auth agent context is not ready.";
  }

  if (!result.success && result.error === "PROFILE_NOT_FOUND") {
    return "Private data processing could not find a complete user profile yet.";
  }

  if (!result.success && result.error === "AUTHORIZATION_REQUIRED") {
    return "Private data processing requires additional T3N authorization before it can continue.";
  }

  if (!result.success) {
    return "Private data processing could not complete.";
  }

  return result.missingFields.length === 0
    ? "Private data processing completed successfully."
    : "Private data processing completed with guidance for missing fields.";
}

export const privateDataProcessingTool = (_context: Context): Tool => ({
  method: "private_data_processing",
  name: "PRIVATE_DATA_PROCESSING",
  description:
    "Run the primary T3N private-data-processing workflow for a user DID by checking requested profile-field availability without returning profile values.",
  parameters: privateDataProcessingParamsSchema,
  outputParser: parseToolOutput,
  execute: async (
    _client: unknown,
    _context: Context,
    params: unknown
  ): Promise<ToolResult> => {
    const parsedParams = privateDataProcessingParamsSchema.safeParse(params ?? {});
    if (!parsedParams.success) {
      return buildErrorResult(
        "INVALID_PARAMETERS",
        "Invalid parameters. Provide required `userDid` and `fields` values only."
      );
    }

    const userDid = parsedParams.data.userDid.trim();
    const fields = parsedParams.data.fields;

    if (userDid === "") {
      return buildErrorResult("INVALID_USER_DID", "The `userDid` value cannot be empty.");
    }

    if (fields.length === 0) {
      return buildErrorResult(
        "INVALID_FIELDS",
        "Provide at least one requested field for private data processing."
      );
    }

    const result = await buildPrivateDataProcessingResult({ userDid, fields });

    return {
      raw: result as unknown as Record<string, unknown>,
      humanMessage: buildHumanMessage(result),
    };
  },
});
