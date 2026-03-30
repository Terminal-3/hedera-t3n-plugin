import { z } from "zod";

import type { Context, Tool } from "hedera-agent-kit";

import {
  buildProfileExecuteRequest,
  checkMappedFieldsExistence,
  parseProfileKeysResult,
} from "../utils/profile-check.js";
import {
  buildProfileAuthorizationRequiredResult,
  buildProfileNotFoundResult,
  isProfileAuthorizationErrorMessage,
  isProfileMissingErrorMessage,
  loadDashboardUrls,
} from "../utils/profile-guidance.js";
import {
  getAllSupportedFieldNames,
  mapFieldNames,
} from "../utils/profile-field-mapping.js";
import { getValidatedT3nSessionState } from "../utils/t3n-session.js";
import { buildErrorResult, type ToolResult } from "../utils/tool-result.js";
import { getAllTrackedUserDids } from "../utils/user-did-store.js";

const checkMyProfileFieldsParamsSchema = z
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

export const checkMyProfileFieldsTool = (_context: Context): Tool => ({
  method: "check_my_profile_fields",
  name: "CHECK_MY_PROFILE_FIELDS",
  description:
    "Check whether requested profile fields exist for the currently stored user DID without returning field values.",
  parameters: checkMyProfileFieldsParamsSchema,
  outputParser: parseToolOutput,
  execute: async (
    _client: unknown,
    _context: Context,
    params: unknown
  ): Promise<ToolResult> => {
    const parsedParams = checkMyProfileFieldsParamsSchema.safeParse(params ?? {});
    if (!parsedParams.success) {
      return buildErrorResult(
        "INVALID_PARAMETERS",
        "Invalid parameters. Provide a `fields` array of strings only."
      );
    }

    const mappingResults = mapFieldNames(parsedParams.data.fields);
    const mappedFields = mappingResults.filter(
      (result): result is typeof result & { mapped: string } =>
        result.supported && result.mapped !== null
    );
    const unsupportedFields = mappingResults
      .filter((result) => !result.supported)
      .map((result) => ({
        field: result.original,
        reason: "T3N does not support this field yet",
      }));

    if (mappedFields.length === 0) {
      return buildErrorResult(
        "NO_SUPPORTED_FIELDS",
        "No supported profile fields were provided.",
        {
          unsupportedFields,
          allSupportedFields: getAllSupportedFieldNames(),
        }
      );
    }

    const sessionState = getValidatedT3nSessionState();
    if (!sessionState.isValid) {
      return buildErrorResult(
        "NO_T3N_AUTH_SESSION",
        "Create and validate a T3N auth session before checking stored user profile fields.",
        {
          unsupportedFields,
          allSupportedFields: getAllSupportedFieldNames(),
        }
      );
    }

    const storedUserDids = getAllTrackedUserDids();
    if (storedUserDids.length === 0) {
      return buildErrorResult(
        "NO_STORED_USER_DID",
        "Store a user DID with ADD_USER_DID before checking profile fields.",
        {
          unsupportedFields,
          allSupportedFields: getAllSupportedFieldNames(),
        }
      );
    }

    if (storedUserDids.length > 1) {
      return buildErrorResult(
        "MULTIPLE_USER_DIDS",
        "Multiple stored user DIDs are available. Re-run ADD_USER_DID to keep only the DID you want to check.",
        {
          unsupportedFields,
          allSupportedFields: getAllSupportedFieldNames(),
          availableDids: storedUserDids.map((entry, index) => ({
            index,
            did: entry.did,
            remark: entry.remark,
            timestamp: entry.timestamp.toISOString(),
          })),
        }
      );
    }

    const targetDid = storedUserDids[0]!.did;

    const dashboardUrls = await loadDashboardUrls(sessionState.networkTier);

    try {
      const executeRequest = await buildProfileExecuteRequest(
        "get-profile-fields-name-only",
        targetDid,
        sessionState.baseUrl
      );
      const rawResult = await sessionState.client.execute(executeRequest);
      const profileKeys = parseProfileKeysResult(rawResult);
      if (profileKeys.length === 0) {
        return buildErrorResult(
          "PROFILE_NOT_FOUND",
          "No profile fields were returned for the stored user DID.",
          {
            did: targetDid,
            unsupportedFields,
            allSupportedFields: getAllSupportedFieldNames(),
            ...(dashboardUrls.profileUrl
              ? { profileUrl: dashboardUrls.profileUrl }
              : {}),
            ...(dashboardUrls.onboardingUrl
              ? { onboardingUrl: dashboardUrls.onboardingUrl }
              : {}),
          }
        );
      }

      const { fieldExistence, missingFields } = checkMappedFieldsExistence(
        profileKeys,
        mappedFields
      );

      return {
        raw: {
          success: true,
          did: targetDid,
          fieldExistence,
          unsupportedFields,
          missingFields,
          allSupportedFields: getAllSupportedFieldNames(),
          ...(missingFields.length > 0 && dashboardUrls.profileUrl
            ? { profileUrl: dashboardUrls.profileUrl }
            : {}),
        },
        humanMessage:
          missingFields.length === 0
            ? "All requested supported fields exist for the stored user DID."
            : "Stored user profile field existence check completed.",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const extra = {
        did: targetDid,
        targetDid,
        unsupportedFields,
        allSupportedFields: getAllSupportedFieldNames(),
      };

      if (isProfileMissingErrorMessage(message)) {
        return buildProfileNotFoundResult({
          extra,
          isOwnProfile: false,
          urls: dashboardUrls,
        });
      }

      if (isProfileAuthorizationErrorMessage(message)) {
        return buildProfileAuthorizationRequiredResult({
          agentDid: sessionState.did,
          extra,
          isOwnProfile: false,
          urls: dashboardUrls,
        });
      }

      return buildErrorResult("PROFILE_CHECK_FAILED", message, {
        ...extra,
        ...(dashboardUrls.profileUrl
          ? { profileUrl: dashboardUrls.profileUrl }
          : {}),
        ...(dashboardUrls.onboardingUrl
          ? { onboardingUrl: dashboardUrls.onboardingUrl }
          : {}),
        ...(dashboardUrls.agentsUrl ? { agentsUrl: dashboardUrls.agentsUrl } : {}),
      });
    }
  },
});
