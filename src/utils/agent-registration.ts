import {
  readAgentIdentityConfig,
  resolveAgentIdentityConfigPath,
  validateAgentIdentityConfig,
} from "./agent-identity-config.js";
import {
  readHederaAgentRegistrationByAgentId,
  verifyHederaAgentRegistrationByTxHash,
  type ReadHederaRegistrationResult,
  type VerifyHederaRegistrationResult,
} from "./hedera.js";
import {
  fetchAgentViaCcfAction,
  type AgentRegistryRecord,
} from "./t3n.js";
import { validateStoredCredentials } from "./validation.js";

import type {
  StoredCredentials,
  StoredHederaRegistrationMetadata,
} from "./storage.js";
import type { Environment } from "./environment.js";

export type RegistrationStatus = "registered" | "not_registered" | "unknown";
export type T3nRegistrationReason = "record_found" | "record_not_found" | "lookup_failed";
export type HederaRegistrationReason =
  | "record_found"
  | "record_not_found"
  | "metadata_missing"
  | "metadata_invalid"
  | "verification_failed";

export interface CurrentAgentRegistrationState {
  did: string;
  hederaWallet: string;
  network: Exclude<Environment, "local">;
  fullyRegistered: boolean;
  t3n: {
    status: RegistrationStatus;
    reason: T3nRegistrationReason;
    verified: boolean;
    record: AgentRegistryRecord | null;
  };
  hedera: {
    status: RegistrationStatus;
    reason: HederaRegistrationReason;
    verified: boolean;
    record: (ReadHederaRegistrationResult | VerifyHederaRegistrationResult) | null;
    agentId?: string;
    txHash?: string;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readNonEmptyString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized === "" ? undefined : normalized;
}

function readPositiveInteger(
  record: Record<string, unknown>,
  key: string
): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : undefined;
}

function readHederaRegistrationMetadata(data: unknown):
  | { status: "missing" }
  | { status: "invalid" }
  | { status: "ok"; metadata: StoredHederaRegistrationMetadata } {
  if (!isRecord(data)) {
    return { status: "missing" };
  }

  const rawMetadata = data.hedera_registration;
  if (rawMetadata === undefined) {
    return { status: "missing" };
  }
  if (!isRecord(rawMetadata)) {
    return { status: "invalid" };
  }

  const txHash = readNonEmptyString(rawMetadata, "tx_hash");
  const agentId = readNonEmptyString(rawMetadata, "agent_id");
  const owner = readNonEmptyString(rawMetadata, "owner");
  const tokenUri = readNonEmptyString(rawMetadata, "token_uri");
  const chainId = readPositiveInteger(rawMetadata, "chain_id");
  const identityRegistryAddress = readNonEmptyString(
    rawMetadata,
    "identity_registry_address"
  );
  const network = rawMetadata.network;

  if (
    !txHash ||
    !agentId ||
    !owner ||
    !tokenUri ||
    !chainId ||
    !identityRegistryAddress ||
    (network !== "testnet" && network !== "mainnet")
  ) {
    return { status: "invalid" };
  }

  return {
    status: "ok",
    metadata: {
      tx_hash: txHash,
      agent_id: agentId,
      owner,
      token_uri: tokenUri,
      chain_id: chainId,
      identity_registry_address: identityRegistryAddress,
      network,
    },
  };
}

function messageFromError(error: unknown): string {
  return error instanceof Error && error.message ? error.message : String(error);
}

function isHederaRecordNotFoundError(error: unknown): boolean {
  const message = messageFromError(error).toLowerCase();

  return (
    message.includes("transaction receipt not found") ||
    message.includes("registered or uriupdated event not found") ||
    message.includes("registered event not found") ||
    message.includes("nonexistent token") ||
    message.includes("owner query for nonexistent token") ||
    message.includes("erc721nonexistenttoken") ||
    message.includes("invalid token id")
  );
}

async function loadCurrentAgentIdentity(): Promise<{
  rawData: Record<string, unknown>;
  credentials: StoredCredentials;
  network: Exclude<Environment, "local">;
}> {
  const resolvedPathResult = resolveAgentIdentityConfigPath();
  if (!resolvedPathResult.ok) {
    throw new Error(resolvedPathResult.humanMessage);
  }

  const readResult = await readAgentIdentityConfig(resolvedPathResult.path);
  if (!readResult.ok) {
    throw new Error(readResult.humanMessage);
  }
  if (!readResult.data) {
    throw new Error(
      `Identity configuration at ${resolvedPathResult.path} is empty. Run \`pnpm create-identity\` first.`
    );
  }
  if (!isRecord(readResult.data)) {
    throw new Error(
      `Identity configuration at ${resolvedPathResult.path} must be a JSON object.`
    );
  }

  const validateResult = validateAgentIdentityConfig(readResult.data, readResult.path);
  if (!validateResult.ok) {
    throw new Error(validateResult.humanMessage);
  }

  const credentials = validateStoredCredentials(readResult.data);
  if (credentials.network_tier === "local") {
    throw new Error(
      "Agent registration lookup does not support HEDERA_NETWORK=local. Use testnet or mainnet."
    );
  }

  return {
    rawData: readResult.data,
    credentials,
    network: credentials.network_tier,
  };
}

async function readT3nRegistrationState(
  options: {
    did: string;
    network: Exclude<Environment, "local">;
  }
): Promise<CurrentAgentRegistrationState["t3n"]> {
  const { did, network } = options;
  try {
    const record = await fetchAgentViaCcfAction(did, {
      networkTier: network,
      env: process.env,
    });

    if (!record) {
      return {
        status: "not_registered",
        reason: "record_not_found",
        verified: false,
        record: null,
      };
    }

    return {
      status: "registered",
      reason: "record_found",
      verified: true,
      record,
    };
  } catch {
    return {
      status: "unknown",
      reason: "lookup_failed",
      verified: false,
      record: null,
    };
  }
}

async function readHederaRegistrationState(options: {
  rawData: Record<string, unknown>;
  network: Exclude<Environment, "local">;
}): Promise<CurrentAgentRegistrationState["hedera"]> {
  const metadata = readHederaRegistrationMetadata(options.rawData);
  if (metadata.status === "missing") {
    return {
      status: "unknown",
      reason: "metadata_missing",
      verified: false,
      record: null,
    };
  }
  if (metadata.status === "invalid") {
    return {
      status: "unknown",
      reason: "metadata_invalid",
      verified: false,
      record: null,
    };
  }

  let lookupByAgentIdError: unknown;
  try {
    const record = await readHederaAgentRegistrationByAgentId(
      options.network,
      metadata.metadata.agent_id,
      {
        env: process.env,
        expectedOwner: metadata.metadata.owner,
        expectedAgentUri: metadata.metadata.token_uri,
      }
    );

    return {
      status: "registered",
      reason: "record_found",
      verified: true,
      record,
      agentId: metadata.metadata.agent_id,
      txHash: metadata.metadata.tx_hash,
    };
  } catch (error) {
    lookupByAgentIdError = error;
  }

  try {
    const record = await verifyHederaAgentRegistrationByTxHash(
      options.network,
      metadata.metadata.tx_hash,
      {
        env: process.env,
        expectedOwner: metadata.metadata.owner,
        expectedAgentUri: metadata.metadata.token_uri,
      }
    );

    return {
      status: "registered",
      reason: "record_found",
      verified: true,
      record,
      agentId: record.agentId,
      txHash: metadata.metadata.tx_hash,
    };
  } catch (error) {
    if (
      isHederaRecordNotFoundError(lookupByAgentIdError) ||
      isHederaRecordNotFoundError(error)
    ) {
      return {
        status: "not_registered",
        reason: "record_not_found",
        verified: false,
        record: null,
        agentId: metadata.metadata.agent_id,
        txHash: metadata.metadata.tx_hash,
      };
    }

    return {
      status: "unknown",
      reason: "verification_failed",
      verified: false,
      record: null,
      agentId: metadata.metadata.agent_id,
      txHash: metadata.metadata.tx_hash,
    };
  }
}

export async function readCurrentAgentRegistration():
  Promise<CurrentAgentRegistrationState> {
  const identity = await loadCurrentAgentIdentity();
  const [t3n, hedera] = await Promise.all([
    readT3nRegistrationState({
      did: identity.credentials.did_t3n,
      network: identity.network,
    }),
    readHederaRegistrationState({
      rawData: identity.rawData,
      network: identity.network,
    }),
  ]);

  return {
    did: identity.credentials.did_t3n,
    hederaWallet: identity.credentials.hedera_wallet,
    network: identity.network,
    fullyRegistered:
      t3n.status === "registered" && hedera.status === "registered",
    t3n,
    hedera,
  };
}
