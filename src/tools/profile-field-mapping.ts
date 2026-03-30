import { z } from "zod";

import type { Context, Tool } from "hedera-agent-kit";

import { buildErrorResult, type ToolResult } from "../utils/tool-result.js";
import {
  getAllSupportedFieldNames,
  mapFieldNames,
} from "../utils/profile-field-mapping.js";

const profileFieldMappingParamsSchema = z
  .object({
    fields: z.array(z.string()),
  })
  .strict();

function parseToolOutput(rawOutput: string): ToolResult {
  const trimmed = rawOutput?.trim() ?? "";
  if (!trimmed || trimmed.startsWith("Error:") || trimmed.startsWith("error:")) {
    return buildErrorResult(trimmed || rawOutput);
  }
  try {
    const parsed = JSON.parse(rawOutput) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return buildErrorResult(rawOutput);
    }
    const obj = parsed as { raw?: Record<string, unknown>; humanMessage?: string };
    return {
      raw: obj.raw ?? {},
      humanMessage: obj.humanMessage ?? "",
    };
  } catch {
    return buildErrorResult(rawOutput);
  }
}

export const profileFieldMappingTool = (_context: Context): Tool => ({
  method: "profile_field_mapping",
  name: "PROFILE_FIELD_MAPPING",
  description:
    "Map user-friendly profile field names to the T3N JSONPath selectors used for profile lookup filters.",
  parameters: profileFieldMappingParamsSchema,
  outputParser: parseToolOutput,
  execute: async (
    _client: unknown,
    _context: Context,
    params: unknown
  ): Promise<ToolResult> => {
    await Promise.resolve();

    const parsedParams = profileFieldMappingParamsSchema.safeParse(params ?? {});
    if (!parsedParams.success) {
      return buildErrorResult(
        "INVALID_PARAMETERS",
        "Invalid parameters. Provide a `fields` array of strings only."
      );
    }

    const mappingResults = mapFieldNames(parsedParams.data.fields);
    const mappedFields = mappingResults
      .filter((result) => result.supported && result.mapped !== null)
      .map((result) => ({
        field: result.original.includes("_")
          ? result.mapped!.replace(/^\$\./, "")
          : result.original,
        jsonPath: result.mapped!,
        tsonPath: result.mapped!,
      }));

    const unsupportedFields = mappingResults
      .filter((result) => !result.supported)
      .map((result) => ({
        field: result.original,
        reason: "T3N does not support this field yet",
      }));

    return {
      raw: {
        success: true,
        mappedFields,
        unsupportedFields,
        allSupportedFields: getAllSupportedFieldNames(),
      },
      humanMessage: "Profile field mapping completed.",
    };
  },
});
