import { z } from "zod";

import type { Context, Tool } from "hedera-agent-kit";

import { getHederaNetwork } from "../utils/env.js";
import { loadDashboardUrls } from "../utils/profile-guidance.js";
import { buildErrorResult, type ToolResult } from "../utils/tool-result.js";
import {
  getAllTrackedUserDids,
  getTrackedUserDidByDid,
  getTrackedUserDidsByRemark,
} from "../utils/user-did-store.js";

const getUserDidParamsSchema = z
  .object({
    userDid: z.string().optional(),
    remark: z.string().optional(),
  })
  .strict();

type UserDidOutputEntry = {
  did: string;
  remark: string;
  timestamp: string;
};

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

function formatUserDidEntries(
  entries: ReturnType<typeof getAllTrackedUserDids>
): UserDidOutputEntry[] {
  return entries.map((entry) => ({
    did: entry.did,
    remark: entry.remark,
    timestamp: entry.timestamp.toISOString(),
  }));
}

async function buildNoResultsInstructions(): Promise<Record<string, unknown>> {
  const note =
    "No stored user DIDs were found. Store one with ADD_USER_DID or provide a registered user DID before continuing.";

  const urls = await loadDashboardUrls(getHederaNetwork());
  if (!urls.profileUrl || !urls.onboardingUrl) {
    return { note };
  }

  return {
    findUserDid: urls.profileUrl,
    registerUserDid: urls.onboardingUrl,
    note,
  };
}

export const getUserDidTool = (_context: Context): Tool => ({
  method: "get_user_did",
  name: "GET_USER_DID",
  description:
    "Query stored user DIDs in the current agent runtime. Supports exact `userDid` matching, partial `remark` matching, or returning all tracked user DIDs.",
  parameters: getUserDidParamsSchema,
  outputParser: parseToolOutput,
  execute: async (
    _client: unknown,
    _context: Context,
    params: unknown
  ): Promise<ToolResult> => {
    const parsedParams = getUserDidParamsSchema.safeParse(params ?? {});
    if (!parsedParams.success) {
      return buildErrorResult(
        "INVALID_PARAMETERS",
        "Invalid parameters. Provide optional `userDid` and `remark` string values only."
      );
    }

    const userDid =
      parsedParams.data.userDid === undefined
        ? undefined
        : parsedParams.data.userDid.trim();
    const remark =
      parsedParams.data.remark === undefined
        ? undefined
        : parsedParams.data.remark.trim();

    if (parsedParams.data.userDid !== undefined && userDid === "") {
      return buildErrorResult(
        "INVALID_USER_DID_FILTER",
        "The optional `userDid` filter cannot be empty."
      );
    }

    if (parsedParams.data.remark !== undefined && remark === "") {
      return buildErrorResult(
        "INVALID_REMARK_FILTER",
        "The optional `remark` filter cannot be empty."
      );
    }

    let results = getAllTrackedUserDids();

    if (userDid && remark) {
      const matchedByDid = getTrackedUserDidByDid(userDid);
      results = matchedByDid.filter((entry) =>
        entry.remark.toLowerCase().includes(remark.toLowerCase())
      );
    } else if (userDid) {
      results = getTrackedUserDidByDid(userDid);
    } else if (remark) {
      results = getTrackedUserDidsByRemark(remark);
    }

    const userDids = formatUserDidEntries(results);
    if (userDids.length === 0) {
      const instructions = await buildNoResultsInstructions();
      return {
        raw: {
          success: true,
          userDids,
          instructions,
        },
        humanMessage: "No stored user DIDs found.",
      };
    }

    const countLabel = userDids.length === 1 ? "user DID" : "user DIDs";
    return {
      raw: {
        success: true,
        userDids,
      },
      humanMessage: `Found ${userDids.length} stored ${countLabel}.`,
    };
  },
});
