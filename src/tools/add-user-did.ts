import { z } from "zod";

import type { Context, Tool } from "hedera-agent-kit";

import { getValidatedT3nSessionState } from "../utils/t3n-session.js";
import { buildErrorResult, type ToolResult } from "../utils/tool-result.js";
import { replaceTrackedUserDid } from "../utils/user-did-store.js";

const addUserDidParamsSchema = z
  .object({
    userDid: z.string(),
    remark: z.string(),
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

export const addUserDidTool = (_context: Context): Tool => ({
  method: "add_user_did",
  name: "ADD_USER_DID",
  description:
    "Store a single user DID with a remark for later profile and lookup operations in the current agent runtime. Re-running this tool replaces the previously stored DID.",
  parameters: addUserDidParamsSchema,
  outputParser: parseToolOutput,
  execute: async (
    _client: unknown,
    _context: Context,
    params: unknown
  ): Promise<ToolResult> => {
    await Promise.resolve();

    const parsedParams = addUserDidParamsSchema.safeParse(params ?? {});
    if (!parsedParams.success) {
      return buildErrorResult(
        "INVALID_PARAMETERS",
        "Invalid parameters. Provide required `userDid` and `remark` string values."
      );
    }

    const userDid = parsedParams.data.userDid.trim();
    const remark = parsedParams.data.remark.trim();

    if (userDid === "") {
      return buildErrorResult("INVALID_USER_DID", "The `userDid` value cannot be empty.");
    }

    if (remark === "") {
      return buildErrorResult("INVALID_REMARK", "The `remark` value cannot be empty.");
    }

    const sessionState = getValidatedT3nSessionState();
    if (sessionState.isValid && sessionState.did === userDid) {
      return buildErrorResult(
        "AGENT_DID_NOT_ALLOWED",
        "The provided user DID matches the authenticated agent DID. Store a separate user DID instead."
      );
    }

    replaceTrackedUserDid(userDid, remark);

    return {
      raw: {
        success: true,
        userDid,
        remark,
      },
      humanMessage: "User DID stored successfully.",
    };
  },
});
