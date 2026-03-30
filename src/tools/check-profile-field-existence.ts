import { z } from "zod";

import type { Context, Tool } from "hedera-agent-kit";

import { getHederaNetwork } from "../utils/env.js";
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
import { mapFieldNames } from "../utils/profile-field-mapping.js";
import { getValidatedT3nSessionState } from "../utils/t3n-session.js";
import { buildErrorResult, type ToolResult } from "../utils/tool-result.js";
import { getAllTrackedUserDids } from "../utils/user-did-store.js";

const checkProfileFieldExistenceParamsSchema = z
  .object({
    targetDid: z.string().optional(),
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

async function buildLookupInstructions(): Promise<Record<string, unknown>> {
  const note =
    "Provide `targetDid`, or store a user DID first with ADD_USER_DID / GET_USER_DID before checking profile fields.";

  const dashboardUrls = await loadDashboardUrls(getHederaNetwork());
  if (!dashboardUrls.profileUrl || !dashboardUrls.onboardingUrl) {
    return { note };
  }

  return {
    findUserDid: dashboardUrls.profileUrl,
    registerUserDid: dashboardUrls.onboardingUrl,
    note,
  };
}

export const checkProfileFieldExistenceTool = (_context: Context): Tool => ({
  method: "check_profile_field_existence",
  name: "CHECK_PROFILE_FIELD_EXISTENCE",
  description:
    "Check whether requested profile fields exist for another user's T3N profile without returning field values.",
  parameters: checkProfileFieldExistenceParamsSchema,
  outputParser: parseToolOutput,
  execute: async (
    _client: unknown,
    _context: Context,
    params: unknown
  ): Promise<ToolResult> => {
    const parsedParams = checkProfileFieldExistenceParamsSchema.safeParse(params ?? {});
    if (!parsedParams.success) {
      return buildErrorResult(
        "INVALID_PARAMETERS",
        "Invalid parameters. Provide a `fields` array and an optional `targetDid` string only."
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
        { unsupportedFields }
      );
    }

    const targetDidInput =
      parsedParams.data.targetDid === undefined
        ? undefined
        : parsedParams.data.targetDid.trim();
    if (parsedParams.data.targetDid !== undefined && targetDidInput === "") {
      return buildErrorResult(
        "INVALID_TARGET_DID",
        "The optional `targetDid` value cannot be empty."
      );
    }

    let targetDid = targetDidInput;
    if (!targetDid) {
      const storedUserDids = getAllTrackedUserDids();
      if (storedUserDids.length === 0) {
        return {
          raw: {
            success: false,
            error: "NO_TARGET_DID",
            unsupportedFields,
            instructions: await buildLookupInstructions(),
          },
          humanMessage:
            "No target DID was provided and no stored user DIDs are available.",
        };
      }

      if (storedUserDids.length > 1) {
        return {
          raw: {
            success: false,
            error: "MULTIPLE_USER_DIDS",
            unsupportedFields,
            availableDids: storedUserDids.map((entry, index) => ({
              index,
              did: entry.did,
              remark: entry.remark,
              timestamp: entry.timestamp.toISOString(),
            })),
          },
          humanMessage:
            "Multiple stored user DIDs are available. Provide `targetDid` to choose which profile to check.",
        };
      }

      targetDid = storedUserDids[0]?.did;
    }

    const sessionState = getValidatedT3nSessionState();
    if (!sessionState.isValid) {
      return buildErrorResult(
        "NO_T3N_AUTH_SESSION",
        "Create and validate a T3N auth session before checking profile fields.",
        { unsupportedFields }
      );
    }

    if (sessionState.did === targetDid) {
      return buildErrorResult(
        "CANNOT_CHECK_OWN_PROFILE",
        "This tool is for checking another user's profile. Use CHECK_MY_PROFILE_FIELDS for your own DID instead.",
        {
          targetDid,
          unsupportedFields,
        }
      );
    }

    const dashboardUrls = await loadDashboardUrls(sessionState.networkTier);

    try {
      const executeRequest = await buildProfileExecuteRequest(
        "get-profile-fields-name-only",
        targetDid!,
        sessionState.baseUrl
      );
      const rawResult = await sessionState.client.execute(executeRequest);
      const profileKeys = parseProfileKeysResult(rawResult);
      if (profileKeys.length === 0) {
        return buildErrorResult(
          "PROFILE_NOT_FOUND",
          "No profile fields were returned for the target DID.",
          {
            targetDid,
            unsupportedFields,
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
          targetDid,
          fieldExistence,
          unsupportedFields,
          missingFields,
        },
        humanMessage:
          missingFields.length === 0
            ? "All requested supported fields exist for the target profile."
            : "Profile field existence check completed.",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const extra = {
        targetDid,
        unsupportedFields,
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
