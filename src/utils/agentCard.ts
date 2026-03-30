import { readFile, writeFile } from "fs/promises";
import { dirname, join, resolve } from "path";

function getAgentCardDid(identity: AgentIdentityRecord): string | undefined {
  const didT3n = String(identity.did_t3n ?? "").trim();
  return didT3n || undefined;
}

function sanitizeAgentCardFilename(filename: string): string {
  const sanitized = Array.from(filename, (character) => {
    const isControlCharacter = character.charCodeAt(0) < 32;
    return isControlCharacter || /[<>:"/\\|?*]/.test(character) ? "_" : character;
  }).join("");

  return sanitized || "agent_card.json";
}

export interface AgentIdentityRecord {
  did_key: string;
  did_t3n: string;
  hedera_wallet: string;
  [key: string]: unknown;
}

export interface AgentCardEndpoint {
  name: string;
  endpoint: string;
  version: string;
}

export interface AgentCardRecord {
  type: string;
  name: string;
  description: string;
  endpoints: AgentCardEndpoint[];
  x402Support: boolean;
  active: boolean;
  supportedTrust: string[];
  [key: string]: unknown;
}

export function getAgentCardFilename(identity: AgentIdentityRecord): string {
  const didT3n = getAgentCardDid(identity);
  return didT3n ? `${sanitizeAgentCardFilename(didT3n)}.json` : "agent_card.json";
}

export function getAgentCardUploadFilename(identity: AgentIdentityRecord): string {
  const didT3n = getAgentCardDid(identity);
  return didT3n ? `${didT3n}.json` : "agent_card.json";
}

export function getAgentCardPath(
  identityPath: string,
  identity: AgentIdentityRecord
): string {
  return join(dirname(resolve(identityPath)), getAgentCardFilename(identity));
}

export function parseJsonObject(raw: string, context: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${context} contains invalid JSON`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${context} must contain a JSON object`);
  }

  return parsed as Record<string, unknown>;
}

export function createDefaultAgentCard(
  identity: AgentIdentityRecord
): AgentCardRecord {
  const didT3n = String(identity.did_t3n ?? "").trim();
  const didKey = String(identity.did_key ?? "").trim();
  const hederaWallet = String(identity.hedera_wallet ?? "").trim();

  if (!didT3n || !didKey || !hederaWallet) {
    throw new Error(
      "Identity JSON is missing required fields for agent card generation: did_t3n, did_key, hedera_wallet"
    );
  }

  const didFragment = didT3n.split(":").pop() ?? "agent";

  return {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: `T3N Agent ${didFragment}`,
    description: `Public ERC-8004 agent card for ${didT3n}.`,
    endpoints: [
      {
        name: "DID T3N",
        endpoint: didT3n,
        version: "v1",
      },
      {
        name: "DID Key",
        endpoint: didKey,
        version: "v1",
      },
      {
        name: "Hedera Wallet",
        endpoint: hederaWallet,
        version: "v1",
      },
    ],
    x402Support: false,
    active: true,
    supportedTrust: ["tee-attestation"],
  };
}

export async function loadOrCreateAgentCard(params: {
  identityPath: string;
  identity: AgentIdentityRecord;
}): Promise<{ agentCardPath: string; agentCard: AgentCardRecord; created: boolean }> {
  const agentCardPath = getAgentCardPath(params.identityPath, params.identity);

  try {
    const existing = await readFile(agentCardPath, "utf8");
    return {
      agentCardPath,
      agentCard: parseJsonObject(existing, "Agent card file") as AgentCardRecord,
      created: false,
    };
  } catch (error) {
    const errno = error as NodeJS.ErrnoException;
    if (errno.code !== "ENOENT") {
      throw error;
    }
  }

  const agentCard = createDefaultAgentCard(params.identity);
  await writeFile(agentCardPath, JSON.stringify(agentCard, null, 2), "utf8");

  return {
    agentCardPath,
    agentCard,
    created: true,
  };
}
