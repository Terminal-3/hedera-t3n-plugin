import { readFile, writeFile } from "fs/promises";
import { dirname, join, resolve } from "path";
import {
  agentCardRecordSchema,
  type AgentCardEndpoint,
  type AgentCardRecord,
  type VerificationMethod,
} from "./validation.js";
import { jwkFromSecp256k1PublicKey } from "./jwk.js";

export {
  agentCardRecordSchema,
  type AgentCardEndpoint,
  type AgentCardRecord,
};

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
  did_t3n: string;
  hedera_wallet: string;
  public_key: string;
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

export function assertJsonObjectShape(
  data: unknown,
  errorMessage: string
): asserts data is Record<string, unknown> {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(errorMessage);
  }
}

export function parseJsonObject(raw: string, context: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${context} contains invalid JSON`);
  }

  assertJsonObjectShape(parsed, `${context} must contain a JSON object`);
  return parsed as Record<string, unknown>;
}

export function createDefaultAgentCard(
  identity: AgentIdentityRecord
): AgentCardRecord {
  const didT3n = String(identity.did_t3n ?? "").trim();
  const hederaWallet = String(identity.hedera_wallet ?? "").trim();
  const publicKey = String(identity.public_key ?? "").trim();

  if (!didT3n || !hederaWallet || !publicKey) {
    throw new Error(
      "Identity JSON is missing required fields for agent card generation: did_t3n, hedera_wallet, public_key"
    );
  }

  const didFragment = didT3n.split(":").pop() ?? "agent";

  const verificationMethod = buildVerificationMethod(didT3n, publicKey);

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
        name: "Hedera Wallet",
        endpoint: hederaWallet,
        version: "v1",
      },
    ],
    x402Support: false,
    active: true,
    supportedTrust: ["tee-attestation"],
    verificationMethod: [verificationMethod],
    authentication: [verificationMethod.id],
  };
}

function buildVerificationMethod(
  didT3n: string,
  publicKey: string
): VerificationMethod {
  return {
    id: `${didT3n}#keys-1`,
    type: "JsonWebKey2020",
    controller: didT3n,
    publicKeyJwk: jwkFromSecp256k1PublicKey(publicKey),
  };
}

export async function loadOrCreateAgentCard(params: {
  identityPath: string;
  identity: AgentIdentityRecord;
}): Promise<{ agentCardPath: string; agentCard: AgentCardRecord; created: boolean }> {
  const agentCardPath = getAgentCardPath(params.identityPath, params.identity);

  try {
    const existing = await readFile(agentCardPath, "utf8");
    const parsed = JSON.parse(existing);
    return {
      agentCardPath,
      agentCard: agentCardRecordSchema.parse(parsed),
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
