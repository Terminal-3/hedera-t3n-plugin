/**
 * Purpose: Hedera wallet address derivation and validation utilities
 * Scope:   Derives Ethereum-compatible addresses from private keys, validates address format,
 *          and integrates with Hedera ERC-8004 identity registry contracts
 * Inputs:  Private keys (hex strings), address strings
 * Outputs: Hedera wallet addresses, validation booleans, and ERC-8004 registration results
 */

import {
  Contract,
  Interface,
  JsonRpcProvider,
  Wallet,
  formatEther,
  getAddress,
  isAddress,
} from "ethers";

import type { Environment } from "./environment.js";
import {
  getHederaAccountId,
  getHederaIdentityRegistryAddress,
  getHederaPrivateKey,
} from "./env.js";
import {
  getNetworkTierConfigFilename,
  loadPluginNetworkConfig,
} from "./network-config.js";
import type { StoredHederaRegistrationMetadata } from "./storage.js";
import { messageFromError } from "./tool-result.js";

export interface HederaIdentityRegistryConfig {
  jsonRpcUrl: string;
  identityRegistryAddress: string;
  chainId: number;
  explorerUrl?: string;
}

export interface HederaIdentityRecord {
  agentId: string;
  owner: string;
  tokenUri: string;
  registrationTxHash?: string;
}

export interface RegisterHederaAgentOptions {
  env?: NodeJS.ProcessEnv;
  operatorAccountId?: string;
  operatorPrivateKey?: string;
  existingRegistration?: StoredHederaRegistrationMetadata;
}

export interface RegisterHederaAgentResult extends HederaIdentityRecord {
  txHash: string;
  chainId: number;
  identityRegistryAddress: string;
  operatorAccountId: string;
  operatorAddress: string;
  explorerTxUrl?: string;
  verified: boolean;
  created: boolean;
  updated: boolean;
  balanceHbar: string;
}

export interface HederaRegistrationReadiness {
  chainId: number;
  identityRegistryAddress: string;
  operatorAccountId: string;
  operatorAddress: string;
  balanceHbar: string;
}

export interface VerifyHederaRegistrationOptions {
  env?: NodeJS.ProcessEnv;
  expectedAgentUri?: string;
  expectedOwner?: string;
}

export interface VerifyHederaRegistrationResult extends HederaIdentityRecord {
  txHash: string;
  chainId: number;
  identityRegistryAddress: string;
}

export interface ReadHederaRegistrationResult extends HederaIdentityRecord {
  chainId: number;
  identityRegistryAddress: string;
}

interface ContractTransactionLike {
  hash: string;
  wait(): Promise<unknown>;
}

interface ContractReceiptLogLike {
  topics: readonly string[];
  data: string;
  address?: string;
}

interface ContractReceiptLike {
  logs: readonly ContractReceiptLogLike[];
}

interface HederaRegistrationContext {
  config: HederaIdentityRegistryConfig;
  provider: JsonRpcProvider;
  wallet: Wallet;
  contract: Contract;
  operatorAccountId: string;
  balance: bigint;
}

const HEDERA_TESTNET_CHAIN_ID = 296;
const HEDERA_MAINNET_CHAIN_ID = 295;
const DEFAULT_HEDERA_JSON_RPC_URLS: Record<Exclude<Environment, "local">, string> = {
  testnet: "https://testnet.hashio.io/api",
  mainnet: "https://mainnet.hashio.io/api",
};

const IDENTITY_REGISTRY_ABI = [
  "event Registered(uint256 indexed agentId, string tokenURI, address indexed owner)",
  "event UriUpdated(uint256 indexed agentId, string newUri, address indexed updatedBy)",
  "function register(string tokenUri) external returns (uint256 agentId)",
  "function setAgentUri(uint256 agentId, string newUri) external",
  "function ownerOf(uint256 tokenId) external view returns (address)",
  "function tokenURI(uint256 tokenId) external view returns (string)",
] as const;

const identityRegistryInterface = new Interface(IDENTITY_REGISTRY_ABI);

export {
  deriveHederaAddress,
  validateHederaAddress,
} from "./identity-utils.js";

function getDefaultChainId(network: Exclude<Environment, "local">): number {
  return network === "mainnet" ? HEDERA_MAINNET_CHAIN_ID : HEDERA_TESTNET_CHAIN_ID;
}

function buildHederaNetworkName(network: Exclude<Environment, "local">): string {
  return network === "mainnet" ? "hedera-mainnet" : "hedera-testnet";
}

function compareAddresses(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function asContractTransactionLike(value: unknown, context: string): ContractTransactionLike {
  if (!value || typeof value !== "object") {
    throw new Error(`${context} did not return a transaction response object.`);
  }

  const record = value as { hash?: unknown; wait?: unknown };
  if (typeof record.hash !== "string" || typeof record.wait !== "function") {
    throw new Error(`${context} returned an invalid transaction response.`);
  }

  return {
    hash: record.hash,
    wait: () => (record.wait as () => Promise<unknown>).call(value),
  };
}

function asContractReceiptLike(value: unknown, context: string): ContractReceiptLike {
  if (!value || typeof value !== "object") {
    throw new Error(`${context} did not return a transaction receipt.`);
  }

  const record = value as { logs?: unknown };
  if (!Array.isArray(record.logs)) {
    throw new Error(`${context} returned a receipt without logs.`);
  }

  return {
    logs: record.logs as readonly ContractReceiptLogLike[],
  };
}

export async function resolveHederaIdentityRegistryConfig(
  networkTier: Exclude<Environment, "local">,
  options: { env?: NodeJS.ProcessEnv } = {}
): Promise<HederaIdentityRegistryConfig> {
  const env = options.env ?? process.env;
  const tierConfig = await loadPluginNetworkConfig(getNetworkTierConfigFilename(networkTier));

  const jsonRpcUrl =
    tierConfig.hederaJsonRpcUrl ?? DEFAULT_HEDERA_JSON_RPC_URLS[networkTier];
  const identityRegistryAddressFromEnv = getHederaIdentityRegistryAddress(env);
  const identityRegistryAddress =
    identityRegistryAddressFromEnv ??
    tierConfig.hederaErc8004IdentityRegistryAddress;
  const chainId = tierConfig.hederaChainId ?? getDefaultChainId(networkTier);
  const explorerUrl = tierConfig.hederaExplorerUrl;

  if (!jsonRpcUrl) {
    throw new Error(
      `Hedera JSON-RPC URL is not configured for ${networkTier}. Set hederaJsonRpcUrl in ${getNetworkTierConfigFilename(networkTier)}.`
    );
  }
  if (!identityRegistryAddress || !isAddress(identityRegistryAddress)) {
    throw new Error(
      `Hedera ERC-8004 IdentityRegistry address is not configured for ${networkTier}. Set HEDERA_IDENTITY_REGISTRY_ADDRESS or hederaErc8004IdentityRegistryAddress in ${getNetworkTierConfigFilename(networkTier)}.`
    );
  }

  return {
    jsonRpcUrl,
    identityRegistryAddress: getAddress(identityRegistryAddress),
    chainId,
    explorerUrl,
  };
}

async function readVerifiedIdentityRecord(
  contract: Contract,
  agentId: bigint | string
): Promise<HederaIdentityRecord> {
  const owner = String(await contract.ownerOf(agentId)).toLowerCase();
  const tokenUri = String(await contract.tokenURI(agentId));
  return {
    agentId: agentId.toString(),
    owner,
    tokenUri,
  };
}

function getReusableStoredRegistration(
  existingRegistration: StoredHederaRegistrationMetadata | undefined,
  networkTier: Exclude<Environment, "local">,
  config: HederaIdentityRegistryConfig
): StoredHederaRegistrationMetadata | undefined {
  if (!existingRegistration) {
    return undefined;
  }

  if (existingRegistration.network !== networkTier) {
    return undefined;
  }

  if (
    existingRegistration.chain_id !== config.chainId ||
    !compareAddresses(
      existingRegistration.identity_registry_address,
      config.identityRegistryAddress
    )
  ) {
    throw new Error(
      "Stored Hedera registration metadata targets a different chain or registry than " +
        `the active configuration (stored chain ${existingRegistration.chain_id}, active chain ${config.chainId}).`
    );
  }

  return existingRegistration;
}

function buildHederaRegistrationResult(params: {
  verifiedRecord: HederaIdentityRecord;
  txHash: string;
  config: HederaIdentityRegistryConfig;
  operatorAccountId: string;
  operatorAddress: string;
  balance: bigint;
  created: boolean;
  updated: boolean;
}): RegisterHederaAgentResult {
  const {
    balance,
    config,
    created,
    operatorAccountId,
    operatorAddress,
    txHash,
    updated,
    verifiedRecord,
  } = params;

  return {
    ...verifiedRecord,
    txHash,
    chainId: config.chainId,
    identityRegistryAddress: config.identityRegistryAddress,
    operatorAccountId,
    operatorAddress,
    explorerTxUrl: config.explorerUrl ? `${config.explorerUrl}/transaction/${txHash}` : undefined,
    verified: true,
    created,
    updated,
    balanceHbar: formatEther(balance),
  };
}

type HederaIdentityRegistryEventName = "Registered" | "UriUpdated";

const TX_HASH_VERIFICATION_EVENTS: readonly HederaIdentityRegistryEventName[] = [
  "Registered",
  "UriUpdated",
];

function extractAgentIdFromIdentityRegistryReceipt(
  receiptLogs: readonly ContractReceiptLogLike[],
  identityRegistryAddress: string,
  expectedEventNames: readonly HederaIdentityRegistryEventName[] = TX_HASH_VERIFICATION_EVENTS
): bigint {
  for (const log of receiptLogs) {
    if (
      typeof log.address !== "string" ||
      !compareAddresses(log.address, identityRegistryAddress)
    ) {
      continue;
    }

    try {
      const parsed = identityRegistryInterface.parseLog(log);
      if (
        parsed &&
        expectedEventNames.includes(parsed.name as HederaIdentityRegistryEventName) &&
        typeof parsed.args.agentId === "bigint"
      ) {
        return parsed.args.agentId;
      }
    } catch {
      continue;
    }
  }

  throw new Error(
    `${expectedEventNames.join(" or ")} event not found in Hedera ERC-8004 transaction receipt.`
  );
}

export async function verifyHederaAgentRegistrationByTxHash(
  networkTier: Exclude<Environment, "local">,
  txHash: string,
  options: VerifyHederaRegistrationOptions = {}
): Promise<VerifyHederaRegistrationResult> {
  const config = await resolveHederaIdentityRegistryConfig(networkTier, {
    env: options.env,
  });
  const provider = new JsonRpcProvider(
    config.jsonRpcUrl,
    { chainId: config.chainId, name: buildHederaNetworkName(networkTier) },
    { staticNetwork: true }
  );
  const receipt = await provider.getTransactionReceipt(txHash);

  if (!receipt) {
    throw new Error(`Hedera transaction receipt not found for tx hash '${txHash}'.`);
  }

  const contract = new Contract(
    config.identityRegistryAddress,
    IDENTITY_REGISTRY_ABI,
    provider
  );
  const agentId = extractAgentIdFromIdentityRegistryReceipt(
    receipt.logs,
    config.identityRegistryAddress
  );
  const verifiedRecord = await readVerifiedIdentityRecord(contract, agentId);

  if (options.expectedOwner && !compareAddresses(verifiedRecord.owner, options.expectedOwner)) {
    throw new Error(
      `Hedera ERC-8004 verification failed: owner mismatch (expected '${options.expectedOwner.toLowerCase()}', got '${verifiedRecord.owner}').`
    );
  }
  if (
    options.expectedAgentUri &&
    verifiedRecord.tokenUri !== options.expectedAgentUri
  ) {
    throw new Error(
      `Hedera ERC-8004 verification failed: expected '${options.expectedAgentUri}', got '${verifiedRecord.tokenUri}'.`
    );
  }

  return {
    ...verifiedRecord,
    txHash,
    chainId: config.chainId,
    identityRegistryAddress: config.identityRegistryAddress,
  };
}

export async function readHederaAgentRegistrationByAgentId(
  networkTier: Exclude<Environment, "local">,
  agentId: string,
  options: VerifyHederaRegistrationOptions = {}
): Promise<ReadHederaRegistrationResult> {
  const config = await resolveHederaIdentityRegistryConfig(networkTier, {
    env: options.env,
  });
  const provider = new JsonRpcProvider(
    config.jsonRpcUrl,
    { chainId: config.chainId, name: buildHederaNetworkName(networkTier) },
    { staticNetwork: true }
  );
  const contract = new Contract(
    config.identityRegistryAddress,
    IDENTITY_REGISTRY_ABI,
    provider
  );
  const verifiedRecord = await readVerifiedIdentityRecord(contract, agentId);

  if (options.expectedOwner && !compareAddresses(verifiedRecord.owner, options.expectedOwner)) {
    throw new Error(
      `Hedera ERC-8004 verification failed: owner mismatch (expected '${options.expectedOwner.toLowerCase()}', got '${verifiedRecord.owner}').`
    );
  }
  if (
    options.expectedAgentUri &&
    verifiedRecord.tokenUri !== options.expectedAgentUri
  ) {
    throw new Error(
      `Hedera ERC-8004 verification failed: expected '${options.expectedAgentUri}', got '${verifiedRecord.tokenUri}'.`
    );
  }

  return {
    ...verifiedRecord,
    chainId: config.chainId,
    identityRegistryAddress: config.identityRegistryAddress,
  };
}

async function buildHederaRegistrationContext(
  networkTier: Exclude<Environment, "local">,
  options: RegisterHederaAgentOptions = {}
): Promise<HederaRegistrationContext> {
  const config = await resolveHederaIdentityRegistryConfig(networkTier, {
    env: options.env,
  });
  const operatorAccountId =
    options.operatorAccountId?.trim() || getHederaAccountId(options.env);
  const operatorPrivateKey =
    options.operatorPrivateKey?.trim() || getHederaPrivateKey(options.env);

  if (!operatorAccountId) {
    throw new Error(
      "HEDERA_ACCOUNT_ID is required for Hedera ERC-8004 registration."
    );
  }
  if (!operatorPrivateKey) {
    throw new Error(
      "HEDERA_PRIVATE_KEY is required for Hedera ERC-8004 registration."
    );
  }

  const provider = new JsonRpcProvider(
    config.jsonRpcUrl,
    { chainId: config.chainId, name: buildHederaNetworkName(networkTier) },
    { staticNetwork: true }
  );
  const wallet = new Wallet(operatorPrivateKey, provider);
  const contract = new Contract(
    config.identityRegistryAddress,
    IDENTITY_REGISTRY_ABI,
    wallet
  );
  const contractCode = await provider.getCode(config.identityRegistryAddress);
  if (!contractCode || contractCode === "0x") {
    throw new Error(
      `No contract deployed at configured Hedera ERC-8004 IdentityRegistry address '${config.identityRegistryAddress}' for ${networkTier}.`
    );
  }

  const balance = await provider.getBalance(wallet.address);
  if (balance <= 0n) {
    throw new Error(
      `Insufficient HBAR for Hedera ERC-8004 registration. Fund wallet ${wallet.address.toLowerCase()} and retry.`
    );
  }

  return {
    config,
    provider,
    wallet,
    contract,
    operatorAccountId,
    balance,
  };
}

export async function assertHederaRegistrationReady(
  networkTier: Exclude<Environment, "local">,
  options: RegisterHederaAgentOptions = {}
): Promise<HederaRegistrationReadiness> {
  const context = await buildHederaRegistrationContext(networkTier, options);

  return {
    chainId: context.config.chainId,
    identityRegistryAddress: context.config.identityRegistryAddress,
    operatorAccountId: context.operatorAccountId,
    operatorAddress: context.wallet.address.toLowerCase(),
    balanceHbar: formatEther(context.balance),
  };
}

export async function registerHederaAgentIdentity(
  networkTier: Exclude<Environment, "local">,
  agentUri: string,
  options: RegisterHederaAgentOptions = {}
): Promise<RegisterHederaAgentResult> {
  const context = await buildHederaRegistrationContext(networkTier, options);
  const {
    balance,
    config,
    contract,
    operatorAccountId,
    wallet,
  } = context;
  const reusableStoredRegistration = getReusableStoredRegistration(
    options.existingRegistration,
    networkTier,
    config
  );

  if (reusableStoredRegistration) {
    let verifiedRecord: HederaIdentityRecord;
    try {
      verifiedRecord = await readVerifiedIdentityRecord(
        contract,
        reusableStoredRegistration.agent_id
      );
    } catch (error) {
      throw new Error(
        "Stored Hedera ERC-8004 registration could not be verified. " +
          messageFromError(error)
      );
    }

    if (!compareAddresses(verifiedRecord.owner, wallet.address)) {
      throw new Error(
        `Stored Hedera ERC-8004 registration '${reusableStoredRegistration.agent_id}' ` +
          `is owned by '${verifiedRecord.owner}', not active operator '${wallet.address.toLowerCase()}'. ` +
          "Refusing to reuse or update it."
      );
    }

    if (verifiedRecord.tokenUri === agentUri) {
      return buildHederaRegistrationResult({
        verifiedRecord,
        txHash: reusableStoredRegistration.tx_hash,
        config,
        operatorAccountId,
        operatorAddress: wallet.address.toLowerCase(),
        balance,
        created: false,
        updated: false,
      });
    }

    const updateTx = asContractTransactionLike(
      await contract.setAgentUri(reusableStoredRegistration.agent_id, agentUri),
      "Hedera ERC-8004 URI update"
    );
    asContractReceiptLike(await updateTx.wait(), "Hedera ERC-8004 URI update");

    const updatedRecord = await readVerifiedIdentityRecord(
      contract,
      reusableStoredRegistration.agent_id
    );
    if (!compareAddresses(updatedRecord.owner, wallet.address)) {
      throw new Error(
        `Hedera ERC-8004 verification failed after update: owner mismatch (expected '${wallet.address.toLowerCase()}', got '${updatedRecord.owner}').`
      );
    }
    if (updatedRecord.tokenUri !== agentUri) {
      throw new Error(
        `Hedera ERC-8004 verification failed after update: expected '${agentUri}', got '${updatedRecord.tokenUri}'.`
      );
    }

    return buildHederaRegistrationResult({
      verifiedRecord: updatedRecord,
      txHash: updateTx.hash,
      config,
      operatorAccountId,
      operatorAddress: wallet.address.toLowerCase(),
      balance,
      created: false,
      updated: true,
    });
  }

  const tx = asContractTransactionLike(
    await contract.register(agentUri),
    "Hedera ERC-8004 registration"
  );
  const receipt = asContractReceiptLike(
    await tx.wait(),
    "Hedera ERC-8004 registration"
  );

  const agentId = extractAgentIdFromIdentityRegistryReceipt(
    receipt.logs,
    config.identityRegistryAddress,
    ["Registered"]
  );
  const verifiedRecord = await readVerifiedIdentityRecord(contract, agentId);
  if (!compareAddresses(verifiedRecord.owner, wallet.address)) {
    throw new Error(
      `Hedera ERC-8004 verification failed: owner mismatch (expected '${wallet.address.toLowerCase()}', got '${verifiedRecord.owner}').`
    );
  }
  if (verifiedRecord.tokenUri !== agentUri) {
    throw new Error(
      `Hedera ERC-8004 verification failed: expected '${agentUri}', got '${verifiedRecord.tokenUri}'.`
    );
  }

  return buildHederaRegistrationResult({
    verifiedRecord,
    txHash: tx.hash,
    config,
    operatorAccountId,
    operatorAddress: wallet.address.toLowerCase(),
    balance,
    created: true,
    updated: false,
  });
}
