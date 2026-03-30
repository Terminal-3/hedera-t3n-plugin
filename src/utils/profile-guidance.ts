import {
  getNetworkTierConfigFilename,
  loadPluginNetworkConfig,
} from "./network-config.js";
import { buildErrorResult, type ToolResult } from "./tool-result.js";

type NetworkTier = "local" | "testnet" | "mainnet";

type UnsupportedField = {
  field: string;
  reason: string;
};

type GuidanceExtra = {
  allSupportedFields?: string[];
  did?: string;
  targetDid?: string;
  unsupportedFields: UnsupportedField[];
};

type DashboardUrls = {
  profileUrl?: string;
  onboardingUrl?: string;
  agentsUrl?: string;
};

const PROFILE_MISSING_PATTERNS = [
  "profile is required",
  "profile is missing",
  "profile does not exist",
  "user profile is required",
];

const PROFILE_AUTHORIZATION_PATTERNS = [
  "authorization error",
  "authorization denied",
  "unauthorized to access pii",
  "not authorized to access",
];

function buildDashboardUrl(baseUrl: string, path: string): string {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBaseUrl}${normalizedPath}`;
}

function resolveConfiguredUrl(
  baseUrl: string | undefined,
  configuredValue: string | undefined
): string | undefined {
  const trimmedValue = configuredValue?.trim();
  if (!trimmedValue) {
    return undefined;
  }

  if (/^https?:\/\//i.test(trimmedValue)) {
    return trimmedValue;
  }

  if (!baseUrl) {
    return undefined;
  }

  return buildDashboardUrl(baseUrl, trimmedValue);
}

export async function loadDashboardUrls(
  networkTier: NetworkTier
): Promise<DashboardUrls> {
  try {
    const config = await loadPluginNetworkConfig(
      getNetworkTierConfigFilename(networkTier)
    );
    const baseUrl = config.dashboardUrl?.trim();
    const profileUrl = resolveConfiguredUrl(baseUrl, config.findUserDid);
    const onboardingUrl = resolveConfiguredUrl(baseUrl, config.registerUserDid);
    const agentsUrl = resolveConfiguredUrl(baseUrl, config.agentsUrl);

    if (profileUrl || onboardingUrl || agentsUrl) {
      return {
        ...(profileUrl ? { profileUrl } : {}),
        ...(onboardingUrl ? { onboardingUrl } : {}),
        ...(agentsUrl ? { agentsUrl } : {}),
      };
    }

    if (!baseUrl) {
      return {};
    }

    return {
      profileUrl: buildDashboardUrl(baseUrl, "/profile"),
      onboardingUrl: buildDashboardUrl(baseUrl, "/onboarding"),
      agentsUrl: buildDashboardUrl(baseUrl, "/agents"),
    };
  } catch {
    return {};
  }
}

export function isProfileMissingErrorMessage(message: string): boolean {
  const normalizedMessage = message.trim().toLowerCase();
  return PROFILE_MISSING_PATTERNS.some((pattern) =>
    normalizedMessage.includes(pattern)
  );
}

export function isProfileAuthorizationErrorMessage(message: string): boolean {
  const normalizedMessage = message.trim().toLowerCase();
  return PROFILE_AUTHORIZATION_PATTERNS.some((pattern) =>
    normalizedMessage.includes(pattern)
  );
}

export function buildProfileNotFoundResult({
  extra,
  isOwnProfile,
  urls,
}: {
  extra: GuidanceExtra;
  isOwnProfile: boolean;
  urls: DashboardUrls;
}): ToolResult {
  const details = isOwnProfile
    ? "Your profile does not exist yet or is incomplete."
    : `The profile for user DID \`${extra.targetDid ?? "unknown"}\` does not exist yet or is incomplete.`;

  const nextSteps =
    urls.profileUrl && urls.onboardingUrl
      ? ` Visit ${urls.profileUrl} to create or update the profile. If you are new to T3N or need to recover your DID, visit ${urls.onboardingUrl} first.`
      : "";

  const instructions =
    urls.profileUrl && urls.onboardingUrl
      ? {
          type: "steps",
          step1: `Visit ${urls.profileUrl} to create or update the profile.`,
          step2: `If you need a DID or need to recover one, visit ${urls.onboardingUrl}.`,
          step3: "Retry the profile check after the profile is complete.",
        }
      : undefined;

  return buildErrorResult(
    "PROFILE_NOT_FOUND",
    `${details}${nextSteps}`,
    {
      ...extra,
      ...(urls.profileUrl ? { profileUrl: urls.profileUrl } : {}),
      ...(urls.onboardingUrl ? { onboardingUrl: urls.onboardingUrl } : {}),
      ...(instructions ? { instructions } : {}),
    }
  );
}

export function buildProfileAuthorizationRequiredResult({
  agentDid,
  extra,
  isOwnProfile,
  urls,
}: {
  agentDid?: string;
  extra: GuidanceExtra;
  isOwnProfile: boolean;
  urls: DashboardUrls;
}): ToolResult {
  const targetLabel = isOwnProfile
    ? "your profile information"
    : `the profile information for user DID \`${extra.targetDid ?? "unknown"}\``;
  const agentLabel = agentDid
    ? `The authenticated agent DID (\`${agentDid}\`) is not authorized to access ${targetLabel}.`
    : `The authenticated agent is not authorized to access ${targetLabel}.`;
  const steps =
    urls.agentsUrl
      ? ` Visit ${urls.agentsUrl}, find the agent${agentDid ? ` DID \`${agentDid}\`` : ""}, and grant the "Profile Verification" permission.`
      : "";
  const instructions = urls.agentsUrl
    ? {
        type: "authorization",
        agentsUrl: urls.agentsUrl,
        permission: "Profile Verification",
        agentDid: agentDid ?? "unknown",
      }
    : undefined;

  return buildErrorResult(
    "AUTHORIZATION_REQUIRED",
    `${agentLabel}${steps}`,
    {
      ...extra,
      ...(agentDid ? { agentDid } : {}),
      ...(urls.agentsUrl ? { agentsUrl: urls.agentsUrl } : {}),
      ...(instructions ? { instructions } : {}),
    }
  );
}
