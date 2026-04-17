import {
  readAgentIdentityConfig,
  resolveAgentIdentityConfigPath,
  validateAgentIdentityConfig,
} from "./agent-identity-config.js";
import {
  readCurrentAgentRegistration,
} from "./agent-registration.js";
import {
  createOrReuseT3nSessionFromIdentity,
  getValidatedT3nSessionState,
} from "./t3n-session.js";
import { messageFromError, sanitizeSessionError } from "./error-utils.js";

export type RegistrationSummary = "full" | "partial" | "none" | "error" | "not_checked";

export interface AuthAgentContextResult {
  identity: {
    available: boolean;
    valid: boolean;
    path: string | null;
    error: string | null;
  };
  session: {
    available: boolean;
    authenticated: boolean;
    did: string | null;
    reused: boolean | null;
    network: string | null;
    baseUrl: string | null;
    error: string | null;
  };
  registration: {
    status: RegistrationSummary;
    network: string | null;
    error: string | null;
  };
  ready: boolean;
  nextSteps: string[];
}

function createBaseResult(): AuthAgentContextResult {
  return {
    identity: {
      available: false,
      valid: false,
      path: null,
      error: null,
    },
    session: {
      available: false,
      authenticated: false,
      did: null,
      reused: null,
      network: null,
      baseUrl: null,
      error: null,
    },
    registration: {
      status: "not_checked",
      network: null,
      error: null,
    },
    ready: false,
    nextSteps: [],
  };
}


export async function buildAuthAgentContext(): Promise<AuthAgentContextResult> {
  const result = createBaseResult();

  const resolvedPathResult = resolveAgentIdentityConfigPath();
  if (!resolvedPathResult.ok) {
    result.identity.error = "IDENTITY_CONFIG_MISSING";
    result.nextSteps.push(
      "Set `AGENT_IDENTITY_CONFIG_PATH` to a valid identity file path in the host runtime."
    );
    result.nextSteps.push(
      "If no identity exists yet, run `pnpm create-identity` first."
    );
    return result;
  }
  result.identity.path = resolvedPathResult.path;

  const readResult = await readAgentIdentityConfig(resolvedPathResult.path);
  if (!readResult.ok) {
    result.identity.error =
      readResult.error === "Invalid JSON" ? "IDENTITY_CONFIG_INVALID" : "IDENTITY_CONFIG_MISSING";
    result.nextSteps.push(
      readResult.error === "Invalid JSON"
        ? "Fix or regenerate the local agent identity file before retrying."
        : "Create or restore the local agent identity file, then retry."
    );
    return result;
  }

  const validateResult = validateAgentIdentityConfig(readResult.data, resolvedPathResult.path);
  if (!validateResult.ok) {
    result.identity.error = "IDENTITY_CONFIG_INVALID";
    result.nextSteps.push("Regenerate the agent identity file with `pnpm create-identity`.");
    return result;
  }

  result.identity.available = true;
  result.identity.valid = true;

  try {
    const session = await createOrReuseT3nSessionFromIdentity();
    result.session.available = true;
    result.session.authenticated = true;
    result.session.did = session.did;
    result.session.reused = session.reused;
    result.session.network = session.networkTier;
    result.session.baseUrl = session.baseUrl;
  } catch (error) {
    const sanitized = sanitizeSessionError(error);
    result.session.error = sanitized.code;
    result.nextSteps.push(sanitized.step);
    return result;
  }

  const validatedSession = getValidatedT3nSessionState();
  if (!validatedSession.isValid) {
    result.session.error = "NO_T3N_AUTH_SESSION";
    result.nextSteps.push("Recreate the T3N auth session before continuing.");
    return result;
  }

  result.ready = true;

  try {
    const registrationState = await readCurrentAgentRegistration();
    const hasAnyRegistration =
      registrationState.t3n.status === "registered" ||
      registrationState.hedera.status === "registered";

    const registrationStatus: RegistrationSummary = registrationState.fullyRegistered
      ? "full"
      : hasAnyRegistration
        ? "partial"
        : "none";

    result.registration = {
      status: registrationStatus,
      network: registrationState.network,
      error: null,
    };

    if (!registrationState.fullyRegistered) {
      if (registrationState.t3n.status !== "registered") {
        result.nextSteps.push(
          "Register the agent on T3N if your workflow depends on agent discoverability."
        );
      }
      if (registrationState.hedera.status !== "registered") {
        result.nextSteps.push(
          "Complete or verify the Hedera ERC-8004 registration if on-chain registration matters for this workflow."
        );
      }
    }
  } catch (error) {
    const message = messageFromError(error).toLowerCase();
    result.registration.status = "error";
    result.registration.error = message.includes("does not support hedera_network=local")
      ? "NETWORK_UNSUPPORTED"
      : "REGISTRATION_LOOKUP_FAILED";

    if (result.registration.error === "NETWORK_UNSUPPORTED") {
      result.nextSteps.push(
        "Registration lookup is skipped in local mode. Use testnet or mainnet when you need registration verification."
      );
    } else {
      result.nextSteps.push(
        "Registration status could not be confirmed. Check network connectivity if registration data is required."
      );
    }
  }

  return result;
}
