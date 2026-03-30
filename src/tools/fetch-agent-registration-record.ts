import { z } from "zod";

import type { Context, Tool } from "hedera-agent-kit";

import {
  readCurrentAgentRegistration,
  type CurrentAgentRegistrationState,
} from "../utils/agent-registration.js";
import { buildErrorResult, messageFromError, type ToolResult } from "../utils/tool-result.js";

const fetchAgentRegistrationRecordParamsSchema = z.object({}).strict();

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
    return "Fetched the current agent registration records from T3N and Hedera.";
  }
  if (state.t3n.status === "registered" || state.hedera.status === "registered") {
    return "Fetched the available registration records for the current agent.";
  }
  return "No registration records were found for the current agent.";
}

function buildSuccessResult(state: CurrentAgentRegistrationState): ToolResult {
  return {
    raw: {
      success: true,
      did: state.did,
      network: state.network,
      fullyRegistered: state.fullyRegistered,
      t3n: {
        status: state.t3n.status,
        verified: state.t3n.verified,
        reason: state.t3n.reason,
        record: state.t3n.record
          ? {
              agentUri: state.t3n.record.agent_uri,
              registeredAt: state.t3n.record.registered_at,
              updatedAt: state.t3n.record.updated_at,
              owner: state.t3n.record.owner,
            }
          : null,
      },
      hedera: {
        status: state.hedera.status,
        verified: state.hedera.verified,
        reason: state.hedera.reason,
        record: state.hedera.record
          ? {
              agentId: state.hedera.record.agentId,
              owner: state.hedera.record.owner,
              tokenUri: state.hedera.record.tokenUri,
              chainId: state.hedera.record.chainId,
              identityRegistryAddress: state.hedera.record.identityRegistryAddress,
              ...(state.hedera.txHash ? { txHash: state.hedera.txHash } : {}),
            }
          : null,
      },
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
    "Agent registration record could not be fetched. Check local configuration and network connectivity, then retry."
  );
}

export const fetchAgentRegistrationRecordTool = (_context: Context): Tool => ({
  method: "fetch_agent_registration_record",
  name: "FETCH_AGENT_REGISTRATION_RECORD",
  description:
    "Fetch the current agent's registration records from T3N and Hedera ERC-8004 using the local identity file in the host runtime.",
  parameters: fetchAgentRegistrationRecordParamsSchema,
  outputParser: parseToolOutput,
  execute: async (
    _client: unknown,
    _context: Context,
    params: unknown
  ): Promise<ToolResult> => {
    const parsedParams = fetchAgentRegistrationRecordParamsSchema.safeParse(params ?? {});
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
