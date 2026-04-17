/**
 * Purpose: Public CCF readback lookup for agent registry records
 */

import {
  type AgentRegistryRecord,
} from "./validation.js";
import { resolveT3nBaseUrl } from "./t3n-urls.js";
import { DEFAULT_AGENT_RECORD_TIMEOUT_MS } from "./constants.js";
import { type Environment } from "./environment.js";
import { assertJsonObjectShape } from "./agentCard.js";
import { agentRegistryRecordSchema } from "./validation.js";
import { messageFromError } from "./error-utils.js";

export interface FetchAgentRecordOptions {
  networkTier: Environment;
  timeoutMs?: number;
  t3nRequestHeaders?: Record<string, string>;
  env?: NodeJS.ProcessEnv;
}

interface PublicKvResponse {
  found: boolean;
  encoding: "json" | "utf8" | "base64" | null;
  value: unknown;
}

function parsePublicKvResponse(payload: unknown): PublicKvResponse {
  assertJsonObjectShape(
    payload,
    `Unexpected /api/public-kv response: ${JSON.stringify(payload)}`
  );

  const value = payload as Record<string, unknown>;
  if (typeof value.found !== "boolean") {
    throw new Error(`Malformed /api/public-kv response: missing found flag`);
  }

  const encoding = value.encoding;
  if (
    encoding !== null &&
    encoding !== "json" &&
    encoding !== "utf8" &&
    encoding !== "base64"
  ) {
    throw new Error(`Malformed /api/public-kv response: invalid encoding`);
  }

  return {
    found: value.found,
    encoding,
    value: value.value,
  };
}

function buildPublicAgentRegistryUrl(baseUrl: string, did: string): string {
  const url = new URL("/api/public-kv", baseUrl);
  url.searchParams.set("map", "public:agent_registry");
  url.searchParams.set("key", did);
  return url.toString();
}

function encodeOwnerBytesToHex(ownerEthAddress: unknown): string | undefined {
  if (!Array.isArray(ownerEthAddress)) {
    return undefined;
  }
  if (ownerEthAddress.length !== 20) {
    return undefined;
  }
  if (!ownerEthAddress.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)) {
    return undefined;
  }
  return `0x${ownerEthAddress
    .map((byte) => Number(byte).toString(16).padStart(2, "0"))
    .join("")}`;
}

function parseAgentRegistryRecord(payload: unknown): AgentRegistryRecord | null {
  if (payload === null) {
    return null;
  }

  assertJsonObjectShape(payload, "Agent registry record must be an object");
  const record = payload as Record<string, unknown>;
  const ownerFromBytes = encodeOwnerBytesToHex(record.owner_eth_address);

  const dataToValidate = {
    ...record,
    owner: (typeof record.owner === "string" ? record.owner.trim() : "") || ownerFromBytes || "",
  };

  try {
    const validated = agentRegistryRecordSchema.parse(dataToValidate);
    return {
      ...validated,
      owner: validated.owner.toLowerCase(),
    };
  } catch (error) {
    throw new Error(
      `Malformed agent registry record: ${messageFromError(error)}`
    );
  }
}

/**
 * Fetches an agent registry record via unauthenticated public HTTP readback endpoint.
 */
export async function fetchAgentViaCcfAction(
  did: string,
  options: FetchAgentRecordOptions
): Promise<AgentRegistryRecord | null> {
  const baseUrl = await resolveT3nBaseUrl(options.networkTier, { env: options.env });
  const timeoutMs = options.timeoutMs ?? DEFAULT_AGENT_RECORD_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(buildPublicAgentRegistryUrl(baseUrl, did), {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(options.t3nRequestHeaders ?? {}),
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const bodySuffix = body ? ` (${body.trim()})` : "";
      throw new Error(
        `Public CCF readback HTTP ${response.status}: ${response.statusText}${bodySuffix}`
      );
    }

    const payload = (await response.json()) as unknown;
    const publicKv = parsePublicKvResponse(payload);
    if (!publicKv.found) {
      return null;
    }

    return parseAgentRegistryRecord(publicKv.value);
  } finally {
    clearTimeout(timeout);
  }
}
