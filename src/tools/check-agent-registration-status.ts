import { z } from "zod";

import type { Context, Tool } from "hedera-agent-kit";

import {
  readCurrentAgentRegistration,
  type CurrentAgentRegistrationState,
} from "../utils/agent-registration.js";
import { buildErrorResult, messageFromError, type ToolResult } from "../utils/tool-result.js";

const checkAgentRegistrationStatusParamsSchema = z.object({}).strict();

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

function buildHumanMessage(state: CurrentAgentRegistrationState): string {
  if (state.fullyRegistered) {
    return "Agent registration is verified on both T3N and Hedera.";
  }
  if (state.t3n.status === "registered" && state.hedera.status === "unknown") {
    return "Agent registration is present on T3N, but Hedera status could not be confirmed.";
  }
  if (state.t3n.status === "registered" && state.hedera.status === "not_registered") {
    return "Agent registration is present on T3N but not on Hedera.";
  }
  if (state.t3n.status === "not_registered" && state.hedera.status === "registered") {
    return "Agent registration is present on Hedera but not on T3N.";
  }
  if (state.t3n.status === "not_registered" && state.hedera.status === "unknown") {
    return "Agent registration was not found on T3N, and Hedera status could not be confirmed.";
  }
  if (state.t3n.status === "not_registered" && state.hedera.status === "not_registered") {
    return "Agent registration was not found on either T3N or Hedera.";
  }
  return "Agent registration status is partially known. Review the per-network status fields.";
}

function buildSuccessResult(state: CurrentAgentRegistrationState): ToolResult {
  const hasAnyRegistration =
    state.t3n.status === "registered" || state.hedera.status === "registered";

  return {
    raw: {
      success: true,
      network: state.network,
      fullyRegistered: state.fullyRegistered,
      hasAnyRegistration,
      canFetchRecord: hasAnyRegistration,
      t3nStatus: state.t3n.status,
      t3nVerified: state.t3n.verified,
      hederaStatus: state.hedera.status,
      hederaVerified: state.hedera.verified,
    },
    humanMessage: buildHumanMessage(state),
  };
}

function sanitizeLookupError(error: unknown): ToolResult {
  const message = messageFromError(error).toLowerCase();

  if (
    message.includes("agent identity configuration path not set") ||
    message.includes("agent identity configuration file not found") ||
    message.includes("identity configuration at ") && message.includes(" is empty")
  ) {
    return buildErrorResult(
      "IDENTITY_CONFIG_MISSING",
      "Agent identity configuration is not available. Run `pnpm create-identity` and set `AGENT_IDENTITY_CONFIG_PATH`, then retry."
    );
  }

  if (
    message.includes("invalid json") ||
    message.includes("valid identity configuration format") ||
    message.includes("must be a json object") ||
    message.includes("is not a file") ||
    message.includes("cannot access the file") ||
    message.includes("cannot read the file")
  ) {
    return buildErrorResult(
      "IDENTITY_CONFIG_INVALID",
      "Agent identity configuration is invalid. Regenerate or fix the local identity file before retrying."
    );
  }

  if (message.includes("does not support hedera_network=local")) {
    return buildErrorResult(
      "NETWORK_UNSUPPORTED",
      "Agent registration lookup only supports testnet or mainnet identities."
    );
  }

  return buildErrorResult(
    "REGISTRATION_LOOKUP_FAILED",
    "Agent registration status could not be determined. Check local configuration and network connectivity, then retry."
  );
}

export const checkAgentRegistrationStatusTool = (_context: Context): Tool => ({
  method: "check_agent_registration_status",
  name: "CHECK_AGENT_REGISTRATION_STATUS",
  description:
    "Check whether the current agent is registered on T3N and Hedera ERC-8004 using the local identity file in the host runtime.",
  parameters: checkAgentRegistrationStatusParamsSchema,
  outputParser: parseToolOutput,
  execute: async (
    _client: unknown,
    _context: Context,
    params: unknown
  ): Promise<ToolResult> => {
    const parsedParams = checkAgentRegistrationStatusParamsSchema.safeParse(params ?? {});
    if (!parsedParams.success) {
      return buildErrorResult(
        "INVALID_PARAMETERS",
        "Invalid parameters. This tool does not accept any parameters."
      );
    }

    try {
      const state = await readCurrentAgentRegistration();
      return buildSuccessResult(state);
    } catch (error) {
      return sanitizeLookupError(error);
    }
  },
});
