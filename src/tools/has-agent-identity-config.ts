/**
 * Purpose: Hedera Agent Kit tool for validating agent identity configuration files
 * Scope:   Checks existence and validity of identity config file specified by AGENT_IDENTITY_CONFIG_PATH
 * Inputs:  Context from hedera-agent-kit (no parameters)
 * Outputs: Success/failure result with human-readable message
 */

import { z } from "zod";

import type { Tool, Context } from "hedera-agent-kit";

import {
  readAgentIdentityConfig,
  resolveAgentIdentityConfigPath,
  validateAgentIdentityConfig,
} from "../utils/agent-identity-config.js";
import { buildErrorResult, type ToolResult } from "../utils/tool-result.js";

export const hasAgentIdentityConfigTool = (_context: Context): Tool => ({
  method: "has_agent_identity_config",
  name: "HAS_AGENT_IDENTITY_CONFIG",
  description:
    "Check if the agent identity configuration file exists and is valid. Validates the file specified by AGENT_IDENTITY_CONFIG_PATH environment variable.",
  parameters: z.object({}), // No parameters needed - uses environment variable
  outputParser: (rawOutput: string): ToolResult => {
    const trimmed = rawOutput?.trim() ?? "";
    if (!trimmed || trimmed.startsWith("Error:") || trimmed.startsWith("error:")) {
      return buildErrorResult(trimmed || rawOutput);
    }
    try {
      const parsed = JSON.parse(rawOutput) as unknown;
      if (parsed === null || typeof parsed !== "object") {
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
  },
  execute: async (
    _client: unknown,
    _context: Context,
    _params: unknown
  ): Promise<ToolResult> => {
    const resolvedPathResult = resolveAgentIdentityConfigPath();
    if (!resolvedPathResult.ok) {
      return buildErrorResult(resolvedPathResult.error, resolvedPathResult.humanMessage);
    }

    const readResult = await readAgentIdentityConfig(resolvedPathResult.path);
    if (!readResult.ok) {
      return buildErrorResult(readResult.error, readResult.humanMessage, {
        ...(readResult.path ? { path: readResult.path } : {}),
        ...(readResult.details ? { details: readResult.details } : {}),
      });
    }

    const validateResult = validateAgentIdentityConfig(readResult.data, readResult.path);
    if (!validateResult.ok) {
      return buildErrorResult(validateResult.error, validateResult.humanMessage, {
        ...(validateResult.path ? { path: validateResult.path } : {}),
        ...(validateResult.details ? { details: validateResult.details } : {}),
      });
    }

    return {
      raw: {
        success: true,
        path: validateResult.path,
      },
      humanMessage: "Your agent identity is ready.",
    };
  },
});
