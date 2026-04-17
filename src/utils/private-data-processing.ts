import { getHederaNetwork } from "./env.js";
import {
  buildProfileExecuteRequest,
  checkMappedFieldsExistence,
  parseProfileKeysResult,
} from "./profile-check.js";
import {
  isProfileAuthorizationErrorMessage,
  isProfileMissingErrorMessage,
  loadDashboardUrls,
} from "./profile-guidance.js";
import { mapFieldNames } from "./profile-field-mapping.js";
import { getValidatedT3nSessionState } from "./t3n-session.js";
import { messageFromError } from "./tool-result.js";

import { buildAuthAgentContext, type AuthAgentContextResult } from "./auth-agent-context.js";

export interface PrivateDataProcessingGuidance {
  profileUrl: string | null;
  onboardingUrl: string | null;
  steps: string[];
}

export interface PrivateDataProcessingResult {
  success: boolean;
  error?: string;
  userDid: string;
  fieldExistence: Record<string, boolean>;
  missingFields: string[];
  unsupportedFields: Array<{ field: string; reason: string }>;
  guidance: PrivateDataProcessingGuidance;
  authReady: boolean;
  authError?: string;
}

function createGuidance(
  urls: { profileUrl?: string; onboardingUrl?: string },
  steps: string[] = []
): PrivateDataProcessingGuidance {
  return {
    profileUrl: urls.profileUrl ?? null,
    onboardingUrl: urls.onboardingUrl ?? null,
    steps,
  };
}

function createUnsupportedFields(fields: string[]): Array<{ field: string; reason: string }> {
  return fields.map((field) => ({
    field,
    reason: "T3N does not support this field yet",
  }));
}

function buildReadinessGuidance(authContext: AuthAgentContextResult): string[] {
  if (authContext.nextSteps.length > 0) {
    return authContext.nextSteps;
  }

  return ["Establish a valid agent identity and authenticated T3N session before retrying."];
}

export async function buildPrivateDataProcessingResult(input: {
  userDid: string;
  fields: string[];
}): Promise<PrivateDataProcessingResult> {
  const authContext = await buildAuthAgentContext();
  const initialUrls = await loadDashboardUrls(getHederaNetwork());
  const mappingResults = mapFieldNames(input.fields);
  const supportedMappingResults = mappingResults.filter(
    (result): result is typeof result & { mapped: string } =>
      result.supported && result.mapped !== null
  );
  const unsupportedFields = createUnsupportedFields(
    mappingResults.filter((result) => !result.supported).map((result) => result.original)
  );

  const baseResult = {
    userDid: input.userDid,
    fieldExistence: {},
    missingFields: [],
    unsupportedFields,
  };

  if (supportedMappingResults.length === 0) {
    return {
      success: false,
      error: "NO_SUPPORTED_FIELDS",
      ...baseResult,
      guidance: createGuidance(initialUrls, [
        "Retry with at least one supported T3N profile field.",
      ]),
      authReady: authContext.ready,
      authError: authContext.ready ? undefined : "AUTH_AGENT_CONTEXT_NOT_READY",
    };
  }

  if (!authContext.ready) {
    return {
      success: false,
      error: "AUTH_AGENT_CONTEXT_NOT_READY",
      ...baseResult,
      guidance: createGuidance(initialUrls, buildReadinessGuidance(authContext)),
      authReady: false,
      authError: "AUTH_AGENT_CONTEXT_NOT_READY",
    };
  }

  const sessionState = getValidatedT3nSessionState();
  if (!sessionState.isValid) {
    return {
      success: false,
      error: "NO_T3N_AUTH_SESSION",
      ...baseResult,
      guidance: createGuidance(initialUrls, [
        "Create and validate a T3N auth session before retrying.",
      ]),
      authReady: true,
      authError: "NO_T3N_AUTH_SESSION",
    };
  }

  const urls = await loadDashboardUrls(sessionState.networkTier);

  try {
    const executeRequest = await buildProfileExecuteRequest(
      "get-profile-fields-name-only",
      input.userDid,
      sessionState.baseUrl
    );
    const rawResult = await sessionState.client.execute(executeRequest);
    const profileKeys = parseProfileKeysResult(rawResult);

    if (profileKeys.length === 0) {
      return {
        success: false,
        error: "PROFILE_NOT_FOUND",
        ...baseResult,
        guidance: createGuidance(urls, [
          urls.profileUrl
            ? `Visit ${urls.profileUrl} to create or complete the user profile.`
            : "Create or complete the user profile.",
          urls.onboardingUrl
            ? `If the user still needs a DID or onboarding help, visit ${urls.onboardingUrl}.`
            : "If the user still needs a DID, complete T3N onboarding first.",
          "Retry private data processing after the profile is complete.",
        ]),
        authReady: true,
      };
    }

    const { fieldExistence, missingFields } = checkMappedFieldsExistence(
      profileKeys,
      supportedMappingResults
    );

    const guidanceSteps: string[] = [];
    if (missingFields.length > 0) {
      guidanceSteps.push(
        urls.profileUrl
          ? `Ask the user to update the missing profile fields at ${urls.profileUrl}.`
          : "Ask the user to update the missing profile fields in their T3N profile."
      );
    }
    if (unsupportedFields.length > 0) {
      guidanceSteps.push(
        "Unsupported fields were ignored. Retry with supported T3N profile fields only if those fields are required."
      );
    }

    return {
      success: true,
      ...baseResult,
      fieldExistence,
      missingFields,
      guidance: createGuidance(urls, guidanceSteps),
      authReady: true,
    };
  } catch (error) {
    const message = messageFromError(error);

    if (isProfileMissingErrorMessage(message)) {
      return {
        success: false,
        error: "PROFILE_NOT_FOUND",
        ...baseResult,
        guidance: createGuidance(urls, [
          urls.profileUrl
            ? `Visit ${urls.profileUrl} to create or complete the user profile.`
            : "Create or complete the user profile.",
          urls.onboardingUrl
            ? `If the user still needs a DID or onboarding help, visit ${urls.onboardingUrl}.`
            : "If the user still needs a DID, complete T3N onboarding first.",
          "Retry private data processing after the profile is complete.",
        ]),
        authReady: true,
      };
    }

    if (isProfileAuthorizationErrorMessage(message)) {
      return {
        success: false,
        error: "AUTHORIZATION_REQUIRED",
        ...baseResult,
        guidance: createGuidance(urls, [
          "Grant the authenticated agent permission to verify profile fields in T3N.",
          "Retry private data processing after the authorization change is applied.",
        ]),
        authReady: true,
      };
    }

    return {
      success: false,
      error: "PROFILE_CHECK_FAILED",
      ...baseResult,
      guidance: createGuidance(urls, [
        "The profile field availability check failed unexpectedly. Retry after confirming T3N connectivity.",
      ]),
      authReady: true,
    };
  }
}
