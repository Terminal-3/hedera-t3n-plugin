import { z } from "zod";

import type { Context, Tool } from "@hashgraph/hedera-agent-kit";

import { buildAuthAgentContext } from "../utils/auth-agent-context.js";
import {
  buildErrorResult,
  parseToolOutput,
  type ToolResult,
} from "../utils/tool-result.js";

const authAgentContextParamsSchema = z.object({}).strict();

function buildHumanMessage(context: Awaited<ReturnType<typeof buildAuthAgentContext>>): string {
  if (context.ready && context.registration.status === "full") {
    return "Auth agent context is ready and registration is verified.";
  }

  if (context.ready) {
    return "Auth agent context is ready, but registration is incomplete or unavailable.";
  }

  return "Auth agent context is not ready yet. Review nextSteps and retry.";
}

export const authAgentContextTool = (_context: Context): Tool => ({
  method: "auth_agent_context",
  name: "AUTH_AGENT_CONTEXT",
  description:
    "Build an orchestration-focused readiness snapshot covering local identity availability, T3N auth session state, and current T3N/Hedera registration status.",
  parameters: authAgentContextParamsSchema,
  outputParser: parseToolOutput,
  execute: async (
    _client: unknown,
    _context: Context,
    params: unknown
  ): Promise<ToolResult> => {
    const parsedParams = authAgentContextParamsSchema.safeParse(params ?? {});
    if (!parsedParams.success) {
      return buildErrorResult(
        "INVALID_PARAMETERS",
        "Invalid parameters. This tool does not accept any parameters."
      );
    }

    const authContext = await buildAuthAgentContext();

    return {
      raw: {
        success: true,
        ...authContext,
      },
      humanMessage: buildHumanMessage(authContext),
    };
  },
});
