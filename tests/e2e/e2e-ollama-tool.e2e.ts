/**
 * E2E test: Ollama LLM triggers Hedera T3N plugin tools.
 *
 * Phase A: LLM health check (Ollama reachable + model available).
 * Phase B: Test missing file (delete file, expect file not found error).
 * Phase C: Create identity file (live createIdentity flow).
 * Phase D: Core e2e (agent with tool → user prompt → assert HAS_AGENT_IDENTITY_CONFIG validates identity file).
 * Phase E: Test invalid configuration (remove private_key field, expect validation error).
 * Phase F: Upload agent_card.json to IPFS via Pinata when requested, or use a caller-provided public gateway URL.
 * Phase G: Live registration via explicit registerAgentErc8004 call.
 * Phase H: Check registration status via CHECK_AGENT_REGISTRATION_STATUS.
 * Phase I: Fetch the current agent registration record via FETCH_AGENT_REGISTRATION_RECORD.
 * Phase J: Fetch agent registry record via CCF action readback and assert the registered public URI matches.
 * Phase K: Verify Hedera on-chain ERC-8004 state via Hedera tx hash and contract reads.
 * Phase L: Create an authenticated T3N session via CREATE_T3N_AUTH_SESSION.
 * Phase M: Validate the active T3N session via VALIDATE_T3N_AUTH_SESSION.
 * Phase N: Store a user DID via ADD_USER_DID.
 * Phase O: Retrieve a stored user DID via GET_USER_DID.
 * Phase P: Map profile field names via PROFILE_FIELD_MAPPING.
 * Phase Q: Reject own DID checks via CHECK_PROFILE_FIELD_EXISTENCE.
 * Phase R: Require an authenticated session via CHECK_MY_PROFILE_FIELDS.
 * Phase S: Validate missing session handling via VALIDATE_T3N_AUTH_SESSION.
 * Phase U: Deny delegated agent-registry-register even with agent-auth grant.
 *
 * Prerequisites: Ollama running, model pulled (e.g. ollama pull qwen2.5), Hedera testnet creds in .env.
 * Requires OLLAMA_BASE_URL and OLLAMA_MODEL in .env; fails if missing.
 * If health check fails or Hedera creds missing, tests are skipped so CI without Ollama passes.
 */

import { existsSync } from "fs";
import { copyFile, mkdir, readFile, writeFile } from "fs/promises";
import { dirname, join, resolve } from "path";

import { afterAll, afterEach, beforeAll, describe, it } from "vitest";
import {
  T3nClient,
  SessionStatus,
  createRandomHandler,
  loadWasmComponent,
  metamask_sign,
  setEnvironment,
  type Environment as T3nEnvironment,
} from "@terminal3/t3n-sdk";

import {
  deriveHederaAddress,
  verifyHederaAgentRegistrationByTxHash,
} from "../../src/utils/hedera.js";
import {
  getContractVersion,
  isScriptNotRegisteredError,
  SCRIPT_NAMES,
} from "../../src/utils/contract-version.js";
import { registerAgentErc8004WithE2eRetry } from "./helpers/register-agent-e2e-retry.js";
import {
  fetchAgentViaCcfAction,
  resolveT3nBaseUrl,
} from "../../src/utils/t3n.js";
import { createConfiguredMlKemPublicKeyHandler } from "../../src/utils/t3n-ml-kem.js";
import { clearT3nSession } from "../../src/utils/t3n-session.js";
import { validateStoredCredentials } from "../../src/utils/validation.js";
import { captureEnv, restoreEnv } from "../helpers/env.js";
import type { AgentSetup } from "./helpers/agent-setup.js";
import { createOllamaAgent } from "./helpers/agent-setup.js";
import { parseE2eOptions } from "./helpers/e2e-options.js";
import {
  persistAgentCardGatewayUrl,
  runIpfsSubmitAgentCardPinataCli,
  validatePublicAgentCardGatewayUrl,
} from "./helpers/ipfs-upload.js";
import type { LlmHealthCheckResult } from "./helpers/llm-health-check.js";
import { checkOllamaHealth } from "./helpers/llm-health-check.js";
import {
  cleanupIdentityFile,
  createTempIdentityPath,
  createTestIdentityFile,
} from "./helpers/test-identity.js";
import { invokeAgentTool } from "./helpers/tool-invocation.js";

const originalFetch = globalThis.fetch.bind(globalThis);
const AGENT_AUTH_UPDATE_FUNCTION = "agent-auth-update";
const AGENT_REGISTRY_REGISTER_FUNCTION = "agent-registry-register";
const IDEMPOTENT_SIDE_EFFECT_INVOCATION = {
  disallowUnexpectedToolCalls: true,
} as const;

async function copyCcfLogArtifactIfConfigured(): Promise<void> {
  const logPath = process.env.HEDERA_E2E_CCF_LOG_PATH?.trim();
  if (!logPath || !existsSync(logPath)) {
    return;
  }

  try {
    const stamp = Date.now();
    const dir = resolve(process.cwd(), "tests/e2e/artifacts", `failure-${stamp}`);
    await mkdir(dir, { recursive: true });
    await copyFile(logPath, join(dir, "ccf-log.txt"));
    console.warn(`[e2e] Saved CCF log copy to ${dir}/ccf-log.txt (from HEDERA_E2E_CCF_LOG_PATH)`);
  } catch (error) {
    console.warn(`[e2e] Failed to copy CCF log artifact: ${String(error)}`);
  }
}

globalThis.fetch = async (input, init) => {
  const headers = new Headers(init?.headers);
  if (!headers.has("connection")) {
    headers.set("connection", "close");
  }

  return originalFetch(input, {
    ...init,
    headers,
    keepalive: false,
  });
};

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL;
const OLLAMA_MODEL = process.env.OLLAMA_MODEL;
const e2eOptions = parseE2eOptions(process.argv.slice(2));

const accountId = process.env.HEDERA_ACCOUNT_ID;
const privateKey = process.env.HEDERA_PRIVATE_KEY;

type IdentityToolParsedRaw = {
  success?: boolean;
  error?: string;
  path?: string;
  details?: string;
};

type RegisterToolParsedRaw = {
  success?: boolean;
  error?: string;
  network?: string;
  verified?: boolean;
  t3nTxHash?: string;
  hederaTxHash?: string;
  hederaAgentId?: string;
  hederaAction?: string;
};

type StatusToolParsedRaw = {
  success?: boolean;
  error?: string;
  network?: string;
  fullyRegistered?: boolean;
  hasAnyRegistration?: boolean;
  canFetchRecord?: boolean;
  t3nStatus?: string;
  t3nVerified?: boolean;
  hederaStatus?: string;
  hederaVerified?: boolean;
};

type FetchRegistrationRecordToolParsedRaw = {
  success?: boolean;
  error?: string;
  did?: string;
  network?: string;
  fullyRegistered?: boolean;
  t3n?: {
    status?: string;
    verified?: boolean;
    reason?: string;
    record?: {
      agentUri?: string;
      registeredAt?: number;
      updatedAt?: number;
      owner?: string;
    } | null;
  };
  hedera?: {
    status?: string;
    verified?: boolean;
    reason?: string;
    record?: {
      agentId?: string;
      owner?: string;
      tokenUri?: string;
      chainId?: number;
      identityRegistryAddress?: string;
      txHash?: string;
    } | null;
  };
};

type SharedRegistrationState = {
  identityPath: string;
  did: string;
  network: "testnet" | "mainnet";
  agentCardGatewayUrl: string;
  registerResult?: RegisterToolParsedRaw;
  statusResult?: StatusToolParsedRaw;
  fetchRecordResult?: FetchRegistrationRecordToolParsedRaw;
};

let healthCheck: LlmHealthCheckResult | null = null;
let skipReason: string | undefined;

if (!OLLAMA_BASE_URL || !OLLAMA_MODEL) {
  skipReason =
    "Missing OLLAMA_BASE_URL or OLLAMA_MODEL. Set both in .env (e.g. OLLAMA_BASE_URL=http://localhost:11434, OLLAMA_MODEL=qwen2.5).";
} else if (!accountId || !privateKey) {
  skipReason = "Hedera credentials not set (HEDERA_ACCOUNT_ID, HEDERA_PRIVATE_KEY).";
} else {
  healthCheck = await checkOllamaHealth(OLLAMA_BASE_URL, OLLAMA_MODEL);
  if (!healthCheck.ok) {
    const availableModels = healthCheck.availableModels?.length
      ? ` Available models: ${healthCheck.availableModels.join(", ")}.`
      : "";
    skipReason = `LLM health check failed. ${healthCheck.reason ?? "Ollama unreachable."}${availableModels}`;
  }
}

if (skipReason) {
  console.warn(`E2E skipped: ${skipReason}`);
}

const describeIf = skipReason ? describe.skip : describe.sequential;
const IDENTITY_USER_PROMPT =
  "Check if my agent identity is ready. Use the HAS_AGENT_IDENTITY_CONFIG tool.";
const IDENTITY_FOLLOW_UP_PROMPT =
  "Call the HAS_AGENT_IDENTITY_CONFIG tool now. Do not reply with text only.";
const CREATE_SESSION_USER_PROMPT =
  "Create an authenticated T3N session for my current agent identity. Use the CREATE_T3N_AUTH_SESSION tool.";
const CREATE_SESSION_FOLLOW_UP_PROMPT =
  "Call the CREATE_T3N_AUTH_SESSION tool now. Do not reply with text only.";
const VALIDATE_SESSION_USER_PROMPT =
  "Validate whether my current T3N session is still authenticated. Use the VALIDATE_T3N_AUTH_SESSION tool.";
const VALIDATE_SESSION_FOLLOW_UP_PROMPT =
  "Call the VALIDATE_T3N_AUTH_SESSION tool now. Do not reply with text only.";
const STATUS_USER_PROMPT =
  "Check whether my current agent is registered on T3N and Hedera. " +
  "Call CHECK_AGENT_REGISTRATION_STATUS exactly once with no arguments and no prose.";
const STATUS_FOLLOW_UP_PROMPT =
  "Now emit exactly one CHECK_AGENT_REGISTRATION_STATUS tool call with {} as arguments and no prose.";
const FETCH_RECORD_USER_PROMPT =
  "Fetch my current agent registration record from T3N and Hedera. " +
  "Call FETCH_AGENT_REGISTRATION_RECORD exactly once with no arguments and no prose.";
const FETCH_RECORD_FOLLOW_UP_PROMPT =
  "Now emit exactly one FETCH_AGENT_REGISTRATION_RECORD tool call with {} as arguments and no prose.";
const E2E_USER_DID = "did:t3n:a:e2e-user-target-0001";
const E2E_USER_DID_REMARK = "E2E tracked user DID";
const ADD_USER_DID_USER_PROMPT =
  `Store this user DID for later checks: ${E2E_USER_DID}. Call ADD_USER_DID exactly once with {"userDid":"${E2E_USER_DID}","remark":"${E2E_USER_DID_REMARK}"}.`;
const ADD_USER_DID_FOLLOW_UP_PROMPT =
  `Call ADD_USER_DID exactly once now with {"userDid":"${E2E_USER_DID}","remark":"${E2E_USER_DID_REMARK}"} and no prose.`;
const GET_USER_DID_USER_PROMPT =
  `Retrieve the stored user DID I asked you to remember. Call GET_USER_DID exactly once with {"userDid":"${E2E_USER_DID}"} and no prose.`;
const GET_USER_DID_FOLLOW_UP_PROMPT =
  `Call GET_USER_DID exactly once now with {"userDid":"${E2E_USER_DID}"} and no prose.`;
const PROFILE_FIELD_MAPPING_USER_PROMPT =
  'Map these profile fields for T3N lookup: ["first_name","email_address","favorite_color"]. Call PROFILE_FIELD_MAPPING exactly once with {"fields":["first_name","email_address","favorite_color"]} and no prose.';
const PROFILE_FIELD_MAPPING_FOLLOW_UP_PROMPT =
  'Call PROFILE_FIELD_MAPPING exactly once now with {"fields":["first_name","email_address","favorite_color"]} and no prose.';
const CHECK_MY_PROFILE_FIELDS_USER_PROMPT =
  'Check whether the stored user DID has these fields: ["first_name","email_address"]. Call CHECK_MY_PROFILE_FIELDS exactly once with {"fields":["first_name","email_address"]} and no prose.';
const CHECK_MY_PROFILE_FIELDS_FOLLOW_UP_PROMPT =
  'Call CHECK_MY_PROFILE_FIELDS exactly once now with {"fields":["first_name","email_address"]} and no prose.';
const registrationArtifactsRequested = Boolean(
  e2eOptions.ipfsPinata || e2eOptions.agentCardGatewayUrl
);

type LiveRegistrationSupport = {
  enabled: boolean;
  reason?: string;
};

async function detectLiveRegistrationSupport(): Promise<LiveRegistrationSupport> {
  if (!registrationArtifactsRequested) {
    return { enabled: false };
  }

  const networkTier = process.env.HEDERA_NETWORK === "mainnet" ? "mainnet" : "testnet";
  const baseUrl = await resolveT3nBaseUrl(networkTier, { env: process.env });

  try {
    await getContractVersion(baseUrl, SCRIPT_NAMES.AGENT_REGISTRY, {
      env: process.env,
    });
    return { enabled: true };
  } catch (error) {
    if (!isScriptNotRegisteredError(error, SCRIPT_NAMES.AGENT_REGISTRY)) {
      return { enabled: true };
    }

    return {
      enabled: false,
      reason:
        `Phases G-K and U skipped: ${baseUrl} does not expose ${SCRIPT_NAMES.AGENT_REGISTRY}. ` +
        "Use --local-ccf or explicit T3N_API_URL/T3N_RUNTIME_API_URL overrides to target a cluster with the agent-registry contract.",
    };
  }
}

const liveRegistrationSupport = await detectLiveRegistrationSupport();

const envSnapshot = captureEnv([
  "AGENT_IDENTITY_CONFIG_PATH",
  "HEDERA_NETWORK",
]);

let agentSetup: AgentSetup | null = null;
let testConfigPath = "";
let reusableIdentityPath = "";
let sharedRegistrationState: SharedRegistrationState | null = null;
let registrationArtifactSkipWarningShown = false;
let registrationPhaseSkipWarningShown = false;
let firstUnhandledRejection: Error | null = null;

type T3nClientInternal = {
  runFlow(method: string, payload: Uint8Array): Promise<Uint8Array>;
};

type T3nClientStateInternal = {
  status: SessionStatus;
  did: { value: string; toString: () => string } | null;
};

type AuthenticatedT3nE2eClient = {
  baseUrl: string;
  did: string;
  client: T3nClient;
};

function toError(value: unknown): Error {
  if (value instanceof Error) {
    return value;
  }

  if (typeof value === "string") {
    return new Error(value);
  }

  try {
    return new Error(JSON.stringify(value));
  } catch {
    return new Error(String(value));
  }
}

function handleUnhandledRejection(reason: unknown): void {
  const normalized = toError(reason);
  if (!firstUnhandledRejection) {
    firstUnhandledRejection = normalized;
  }
  console.error(`[e2e] Captured unhandled rejection: ${normalized.stack ?? normalized.message}`);
}

function assertToolName(actual: string, expectedNames: string[], label: string): void {
  if (!expectedNames.includes(actual)) {
    throw new Error(`Expected ${label}, got ${actual}`);
  }
}

/** Asserts two paths resolve to the same absolute path. */
function assertPathsMatch(expected: string, actual: string, label: string): void {
  const resolvedExpected = resolve(expected);
  const resolvedActual = resolve(actual);
  if (resolvedActual !== resolvedExpected) {
    throw new Error(
      `${label} path mismatch. Expected: ${resolvedExpected}. Got: ${resolvedActual}`
    );
  }
}

type RequiredConfig = {
  baseUrl: string;
  model: string;
  accountId: string;
  privateKey: string;
};

/** Validates and returns required configuration values, or null if any are missing. */
function getRequiredConfig(): RequiredConfig | null {
  if (
    typeof accountId !== "string" ||
    typeof privateKey !== "string" ||
    typeof OLLAMA_BASE_URL !== "string" ||
    typeof OLLAMA_MODEL !== "string"
  ) {
    return null;
  }

  return {
    baseUrl: OLLAMA_BASE_URL,
    model: OLLAMA_MODEL,
    accountId,
    privateKey,
  };
}

function assertNonEmptyString(
  value: unknown,
  label: string
): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Expected non-empty ${label}.`);
  }
  return value;
}

function inferT3nEnvironmentForE2e(baseUrl: string): T3nEnvironment {
  const normalized = baseUrl.toLowerCase();
  if (normalized.includes("localhost") || normalized.includes("127.0.0.1")) {
    return "local";
  }
  if (normalized.includes("staging")) {
    return "staging";
  }
  return "production";
}

function generateDidSuffixForE2e(address: string): string {
  const suffix = address.replace("0x", "").slice(0, 16);
  return `a:${suffix}`;
}

function parseExecuteResponse(rawResponse: string, label: string): unknown {
  try {
    return JSON.parse(rawResponse) as unknown;
  } catch (error) {
    throw new Error(
      `${label}: expected JSON execute response, got parse error: ${String(error)}`
    );
  }
}

function extractTxHashFromExecuteResponse(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const obj = payload as Record<string, unknown>;
  if (typeof obj.tx_hash === "string") {
    return obj.tx_hash;
  }

  if (obj.response && typeof obj.response === "object") {
    const response = obj.response as Record<string, unknown>;
    if (typeof response.tx_hash === "string") {
      return response.tx_hash;
    }
  }

  return undefined;
}

async function authenticateE2eT3nClient(
  client: T3nClient,
  address: string
): Promise<string> {
  const authAction = {
    host_to_guest: "PeerRequest",
    eth_auth_action: "SetAuthenticator",
    authenticator: `eth:${address}`,
    did: generateDidSuffixForE2e(address),
  };

  const authResult = await (client as unknown as T3nClientInternal).runFlow(
    "auth",
    new TextEncoder().encode(JSON.stringify(authAction))
  );
  const didString = JSON.parse(new TextDecoder().decode(authResult)) as string;

  const clientState = client as unknown as T3nClientStateInternal;
  clientState.did = {
    value: didString,
    toString: () => didString,
  };
  clientState.status = SessionStatus.Authenticated;
  return didString;
}

async function createAuthenticatedT3nClientForE2e(
  privateKey: string,
  network: "testnet" | "mainnet"
): Promise<AuthenticatedT3nE2eClient> {
  const baseUrl = await resolveT3nBaseUrl(network, { env: process.env });
  setEnvironment(inferT3nEnvironmentForE2e(baseUrl));

  const wasmComponent = await loadWasmComponent();
  const address = deriveHederaAddress(privateKey);
  const client = new T3nClient({
    baseUrl,
    wasmComponent,
    handlers: {
      EthSign: metamask_sign(address, undefined, privateKey),
      MlKemPublicKey: createConfiguredMlKemPublicKeyHandler(process.env),
      Random: createRandomHandler(),
    },
    timeout: 25_000,
  });

  await client.handshake();
  const did = await authenticateE2eT3nClient(client, address);

  return {
    baseUrl,
    did,
    client,
  };
}

function shouldPreserveIdentityAcrossPhases(path: string): boolean {
  return Boolean(
    (reusableIdentityPath && path === reusableIdentityPath) ||
      (sharedRegistrationState && path === sharedRegistrationState.identityPath)
  );
}

function shouldSkipRegistrationArtifactPhase(): boolean {
  if (registrationArtifactsRequested) {
    return false;
  }

  if (!registrationArtifactSkipWarningShown) {
    console.warn(
      "Phase F skipped: provide --agent-card-gateway-url <url> or --ipfs-pinata to enable agent-card setup."
    );
    registrationArtifactSkipWarningShown = true;
  }

  return true;
}

function shouldSkipOptionalRegistrationPhases(): boolean {
  if (!registrationArtifactsRequested) {
    return shouldSkipRegistrationArtifactPhase();
  }

  if (liveRegistrationSupport.enabled) {
    return false;
  }

  if (!registrationPhaseSkipWarningShown) {
    console.warn(liveRegistrationSupport.reason ?? "Phases G-K skipped.");
    registrationPhaseSkipWarningShown = true;
  }

  return true;
}

async function createSharedRegistrationFlowState(): Promise<SharedRegistrationState> {
  if (!e2eOptions.ipfsPinata && !e2eOptions.agentCardGatewayUrl) {
    throw new Error(
      "Registration phases require either --agent-card-gateway-url <url> or --ipfs-pinata."
    );
  }

  const identityPath = await createTestIdentityFile();
  process.env.AGENT_IDENTITY_CONFIG_PATH = identityPath;

  const gatewayUrl = e2eOptions.ipfsPinata
    ? await runIpfsSubmitAgentCardPinataCli(identityPath)
    : assertNonEmptyString(
        e2eOptions.agentCardGatewayUrl,
        "agent-card-gateway-url"
      );

  if (!e2eOptions.ipfsPinata) {
    await persistAgentCardGatewayUrl(identityPath, gatewayUrl);
  }

  const raw = await readFile(identityPath, "utf8");
  const identity = JSON.parse(raw) as Record<string, unknown>;
  const credentials = validateStoredCredentials(identity);
  if (credentials.network_tier === "local") {
    throw new Error("Registration phases require testnet or mainnet identity credentials.");
  }

  return {
    identityPath,
    did: credentials.did_t3n,
    network: credentials.network_tier,
    agentCardGatewayUrl: gatewayUrl,
  };
}

async function ensureReusableIdentityFile(): Promise<string> {
  if (!reusableIdentityPath) {
    reusableIdentityPath = await createTestIdentityFile();
  }
  return reusableIdentityPath;
}

describeIf("E2E: Ollama → Hedera T3N plugin flow", () => {
  beforeAll(() => {
    process.on("unhandledRejection", handleUnhandledRejection);
    process.env.HEDERA_NETWORK = "testnet";

    const config = getRequiredConfig();
    if (!config) {
      return;
    }

    agentSetup = createOllamaAgent(config);
  });

  afterEach(async (ctx) => {
    if (ctx.task.type === "test" && ctx.task.result?.state === "fail") {
      await copyCcfLogArtifactIfConfigured();
    }
    agentSetup?.cleanup();
    clearT3nSession();
    if (testConfigPath && !shouldPreserveIdentityAcrossPhases(testConfigPath)) {
      await cleanupIdentityFile(testConfigPath);
    }
    testConfigPath = "";
    delete process.env.AGENT_IDENTITY_CONFIG_PATH;

    if (firstUnhandledRejection) {
      const rejection = firstUnhandledRejection;
      firstUnhandledRejection = null;
      throw new Error(
        `Unhandled rejection observed during e2e execution: ${rejection.stack ?? rejection.message}`
      );
    }
  });

  afterAll(async () => {
    process.off("unhandledRejection", handleUnhandledRejection);
    agentSetup?.cleanup();
    clearT3nSession();
    if (reusableIdentityPath && reusableIdentityPath !== sharedRegistrationState?.identityPath) {
      await cleanupIdentityFile(reusableIdentityPath);
    }
    reusableIdentityPath = "";
    if (sharedRegistrationState?.identityPath) {
      await cleanupIdentityFile(sharedRegistrationState.identityPath);
    }
    sharedRegistrationState = null;
    restoreEnv(envSnapshot);

    if (firstUnhandledRejection) {
      const rejection = firstUnhandledRejection;
      firstUnhandledRejection = null;
      throw new Error(
        `Unhandled rejection observed during e2e teardown: ${rejection.stack ?? rejection.message}`
      );
    }
  });

  it("Phase A: confirms Ollama is reachable and model is available", () => {
    if (!healthCheck?.ok) {
      throw new Error(`Health check failed: ${healthCheck?.reason ?? "unknown"}`);
    }
  });

  it("Phase B: detects missing identity file", async () => {
    if (!agentSetup) {
      throw new Error("Agent was not initialized.");
    }

    testConfigPath = createTempIdentityPath("e2e-missing-identity");
    process.env.AGENT_IDENTITY_CONFIG_PATH = testConfigPath;

    if (existsSync(testConfigPath)) {
      throw new Error(`Phase B could not delete identity file at ${testConfigPath}`);
    }

    const { toolCall } = await invokeAgentTool({
      agent: agentSetup.agent,
      cleanup: agentSetup.cleanup,
      responseParser: agentSetup.responseParser,
      threadId: "e2e-identity-missing",
      userPrompt: IDENTITY_USER_PROMPT,
      followUpPrompt: IDENTITY_FOLLOW_UP_PROMPT,
      expectedToolNames: ["HAS_AGENT_IDENTITY_CONFIG", "has_agent_identity_config"],
      expectedToolLabel: "HAS_AGENT_IDENTITY_CONFIG",
    });

    assertToolName(
      toolCall.toolName ?? "",
      ["HAS_AGENT_IDENTITY_CONFIG", "has_agent_identity_config"],
      "HAS_AGENT_IDENTITY_CONFIG"
    );

    const parsedData = toolCall.parsedData?.raw as IdentityToolParsedRaw | undefined;
    if (parsedData?.success !== false) {
      throw new Error(`Phase B expected failure, got: ${JSON.stringify(parsedData)}`);
    }

    if (parsedData.error !== "File not found") {
      throw new Error(`Phase B expected "File not found", got: ${parsedData.error}`);
    }

    if (!parsedData.path) {
      throw new Error("Phase B expected path in error response.");
    }

    assertPathsMatch(testConfigPath, parsedData.path, "Phase B");
  });

  it("Phase C: creates identity file", async () => {
    testConfigPath = await ensureReusableIdentityFile();
    process.env.AGENT_IDENTITY_CONFIG_PATH = testConfigPath;

    if (!existsSync(testConfigPath)) {
      throw new Error(`Identity file not created at ${testConfigPath}`);
    }
  });

  it("Phase D: validates identity config via HAS_AGENT_IDENTITY_CONFIG", async () => {
    if (!agentSetup) {
      throw new Error("Agent was not initialized.");
    }

    testConfigPath = await ensureReusableIdentityFile();
    process.env.AGENT_IDENTITY_CONFIG_PATH = testConfigPath;

    const { toolCall } = await invokeAgentTool({
      agent: agentSetup.agent,
      cleanup: agentSetup.cleanup,
      responseParser: agentSetup.responseParser,
      threadId: "e2e-identity-valid",
      userPrompt: IDENTITY_USER_PROMPT,
      followUpPrompt: IDENTITY_FOLLOW_UP_PROMPT,
      expectedToolNames: ["HAS_AGENT_IDENTITY_CONFIG", "has_agent_identity_config"],
      expectedToolLabel: "HAS_AGENT_IDENTITY_CONFIG",
    });

    assertToolName(
      toolCall.toolName ?? "",
      ["HAS_AGENT_IDENTITY_CONFIG", "has_agent_identity_config"],
      "HAS_AGENT_IDENTITY_CONFIG"
    );

    const parsedData = toolCall.parsedData?.raw as IdentityToolParsedRaw | undefined;
    if (!parsedData?.success) {
      throw new Error(`Tool did not report success. ${JSON.stringify(parsedData)}`);
    }

    if (!parsedData.path) {
      throw new Error("No path in tool result.");
    }

    assertPathsMatch(testConfigPath, parsedData.path, "Phase D");

    const humanMessage = toolCall.parsedData?.humanMessage;
    if (humanMessage !== "Your agent identity is ready.") {
      throw new Error(`Unexpected human message: ${humanMessage}`);
    }

    if (!existsSync(testConfigPath)) {
      throw new Error(`Identity file not found at ${testConfigPath}`);
    }

    const fileContent = await readFile(testConfigPath, "utf8");
    const credentials = JSON.parse(fileContent) as Record<string, unknown>;
    try {
      validateStoredCredentials(credentials);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Identity format invalid. ${message}`);
    }
  });


  it("Phase E: detects invalid identity configuration", async () => {
    if (!agentSetup) {
      throw new Error("Agent was not initialized.");
    }

    const validIdentityPath = await ensureReusableIdentityFile();
    testConfigPath = createTempIdentityPath("e2e-invalid-identity");
    process.env.AGENT_IDENTITY_CONFIG_PATH = testConfigPath;

    const fileContent = await readFile(validIdentityPath, "utf8");
    const credentials = JSON.parse(fileContent) as Record<string, unknown>;
    delete credentials.private_key;
    await mkdir(dirname(testConfigPath), { recursive: true });
    await writeFile(testConfigPath, JSON.stringify(credentials, null, 2), "utf8");

    const { toolCall } = await invokeAgentTool({
      agent: agentSetup.agent,
      cleanup: agentSetup.cleanup,
      responseParser: agentSetup.responseParser,
      threadId: "e2e-identity-invalid",
      userPrompt: IDENTITY_USER_PROMPT,
      followUpPrompt: IDENTITY_FOLLOW_UP_PROMPT,
      expectedToolNames: ["HAS_AGENT_IDENTITY_CONFIG", "has_agent_identity_config"],
      expectedToolLabel: "HAS_AGENT_IDENTITY_CONFIG",
    });

    assertToolName(
      toolCall.toolName ?? "",
      ["HAS_AGENT_IDENTITY_CONFIG", "has_agent_identity_config"],
      "HAS_AGENT_IDENTITY_CONFIG"
    );

    const parsedData = toolCall.parsedData?.raw as IdentityToolParsedRaw | undefined;
    if (parsedData?.success !== false) {
      throw new Error(`Phase E expected failure, got: ${JSON.stringify(parsedData)}`);
    }

    if (parsedData.error !== "Invalid identity configuration format") {
      throw new Error(
        `Phase E expected "Invalid identity configuration format", got: ${parsedData.error}`
      );
    }

    if (!parsedData.details) {
      throw new Error("Phase E expected details field in error response.");
    }

    if (!parsedData.path) {
      throw new Error("Phase E expected path in error response.");
    }

    assertPathsMatch(testConfigPath, parsedData.path, "Phase E");
  });

  it("Phase F: uploads agent_card.json to IPFS via Pinata or uses a provided public URL", async () => {
    if (shouldSkipRegistrationArtifactPhase()) {
      return;
    }

    sharedRegistrationState = await createSharedRegistrationFlowState();
    testConfigPath = sharedRegistrationState.identityPath;
    process.env.AGENT_IDENTITY_CONFIG_PATH = sharedRegistrationState.identityPath;

    if (!existsSync(sharedRegistrationState.identityPath)) {
      throw new Error(
        `Phase F expected identity file at ${sharedRegistrationState.identityPath}`
      );
    }

    if (!sharedRegistrationState.agentCardGatewayUrl.startsWith("https://")) {
      throw new Error(
        `Phase F expected HTTPS agent card URL, got ${sharedRegistrationState.agentCardGatewayUrl}`
      );
    }

    const raw = await readFile(sharedRegistrationState.identityPath, "utf8");
    const identity = JSON.parse(raw) as Record<string, unknown>;
    const storedGatewayUrl = identity.agent_card_gateway_url;
    if (storedGatewayUrl !== sharedRegistrationState.agentCardGatewayUrl) {
      throw new Error(
        `Phase F expected stored agent_card_gateway_url '${sharedRegistrationState.agentCardGatewayUrl}', got '${String(storedGatewayUrl)}'.`
      );
    }

    await validatePublicAgentCardGatewayUrl(sharedRegistrationState.agentCardGatewayUrl);

    if (e2eOptions.ipfsPinata) {
      console.warn(
        `Phase F uploaded agent_card.json to Pinata: ${sharedRegistrationState.agentCardGatewayUrl}`
      );
    } else {
      console.warn(
        `Phase F using provided public agent card URL (validated): ${sharedRegistrationState.agentCardGatewayUrl}`
      );
    }
  });

  it("Phase G: registers the public agent card via explicit registerAgentErc8004", async () => {
    if (shouldSkipOptionalRegistrationPhases()) {
      return;
    }
    if (!sharedRegistrationState) {
      console.warn("Phase G skipped: Phase F did not establish shared registration state.");
      return;
    }

    testConfigPath = sharedRegistrationState.identityPath;
    process.env.AGENT_IDENTITY_CONFIG_PATH = sharedRegistrationState.identityPath;

    const result = await registerAgentErc8004WithE2eRetry({
      identityConfigPath: sharedRegistrationState.identityPath,
      agentUri: sharedRegistrationState.agentCardGatewayUrl,
    });

    const parsedData: RegisterToolParsedRaw = {
      success: true,
      network: result.network,
      verified: result.verified,
      t3nTxHash: result.t3n.txHash,
      hederaTxHash: result.hedera.txHash,
      hederaAgentId: result.hedera.agentId,
      hederaAction: result.hedera.created
        ? "created"
        : result.hedera.updated
          ? "updated"
          : "reused",
    };

    const hederaTxHash = assertNonEmptyString(parsedData.hederaTxHash, "hedera tx hash");
    const t3nTxHash = assertNonEmptyString(parsedData.t3nTxHash, "t3n tx hash");
    const hederaAgentId = assertNonEmptyString(parsedData.hederaAgentId, "hedera agent id");
    const network = assertNonEmptyString(parsedData.network, "network");

    if (parsedData.verified !== true) {
      throw new Error(`Phase G expected verified=true, got ${String(parsedData.verified)}`);
    }
    if (network !== "testnet" && network !== "mainnet") {
      throw new Error(`Phase G expected network testnet/mainnet, got ${network}`);
    }
    if (!["created", "updated", "reused"].includes(parsedData.hederaAction ?? "")) {
      throw new Error(
        `Phase G expected Hedera action created|updated|reused, got ${String(parsedData.hederaAction)}`
      );
    }

    sharedRegistrationState.registerResult = {
      ...parsedData,
      hederaTxHash,
      hederaAgentId,
      network,
      t3nTxHash,
    };
  });

  it("Phase H: checks registration status via CHECK_AGENT_REGISTRATION_STATUS", async () => {
    if (!agentSetup) {
      throw new Error("Agent was not initialized.");
    }
    if (shouldSkipOptionalRegistrationPhases()) {
      return;
    }
    if (!sharedRegistrationState?.registerResult) {
      throw new Error("Phase H requires Phase G to complete registration.");
    }

    testConfigPath = sharedRegistrationState.identityPath;
    process.env.AGENT_IDENTITY_CONFIG_PATH = sharedRegistrationState.identityPath;

    const { toolCall } = await invokeAgentTool({
      agent: agentSetup.agent,
      cleanup: agentSetup.cleanup,
      responseParser: agentSetup.responseParser,
      threadId: "e2e-check-agent-registration-status",
      userPrompt: STATUS_USER_PROMPT,
      followUpPrompt: STATUS_FOLLOW_UP_PROMPT,
      expectedToolNames: [
        "CHECK_AGENT_REGISTRATION_STATUS",
        "check_agent_registration_status",
      ],
      expectedToolLabel: "CHECK_AGENT_REGISTRATION_STATUS",
    });

    assertToolName(
      toolCall.toolName ?? "",
      ["CHECK_AGENT_REGISTRATION_STATUS", "check_agent_registration_status"],
      "CHECK_AGENT_REGISTRATION_STATUS"
    );

    const parsedData = toolCall.parsedData?.raw as StatusToolParsedRaw | undefined;
    if (!parsedData?.success) {
      throw new Error(`Phase H expected success, got: ${JSON.stringify(parsedData)}`);
    }

    if (parsedData.fullyRegistered !== true) {
      throw new Error(
        `Phase H expected fullyRegistered=true, got ${String(parsedData.fullyRegistered)}`
      );
    }
    if (parsedData.hasAnyRegistration !== true) {
      throw new Error(
        `Phase H expected hasAnyRegistration=true, got ${String(parsedData.hasAnyRegistration)}`
      );
    }
    if (parsedData.canFetchRecord !== true) {
      throw new Error(
        `Phase H expected canFetchRecord=true, got ${String(parsedData.canFetchRecord)}`
      );
    }
    if (parsedData.t3nStatus !== "registered") {
      throw new Error(
        `Phase H expected t3nStatus='registered', got ${String(parsedData.t3nStatus)}`
      );
    }
    if (parsedData.hederaStatus !== "registered") {
      throw new Error(
        `Phase H expected hederaStatus='registered', got ${String(parsedData.hederaStatus)}`
      );
    }
    if (parsedData.network !== sharedRegistrationState.registerResult.network) {
      throw new Error(
        `Phase H expected network '${sharedRegistrationState.registerResult.network}', got '${String(parsedData.network)}'.`
      );
    }

    sharedRegistrationState.statusResult = parsedData;
  });

  it("Phase I: fetches the current agent registration record via FETCH_AGENT_REGISTRATION_RECORD", async () => {
    if (!agentSetup) {
      throw new Error("Agent was not initialized.");
    }
    if (shouldSkipOptionalRegistrationPhases()) {
      return;
    }
    if (!sharedRegistrationState?.registerResult) {
      throw new Error("Phase I requires Phase G to complete registration.");
    }

    testConfigPath = sharedRegistrationState.identityPath;
    process.env.AGENT_IDENTITY_CONFIG_PATH = sharedRegistrationState.identityPath;

    const { toolCall } = await invokeAgentTool({
      agent: agentSetup.agent,
      cleanup: agentSetup.cleanup,
      responseParser: agentSetup.responseParser,
      threadId: "e2e-fetch-agent-registration-record",
      userPrompt: FETCH_RECORD_USER_PROMPT,
      followUpPrompt: FETCH_RECORD_FOLLOW_UP_PROMPT,
      expectedToolNames: [
        "FETCH_AGENT_REGISTRATION_RECORD",
        "fetch_agent_registration_record",
      ],
      expectedToolLabel: "FETCH_AGENT_REGISTRATION_RECORD",
    });

    assertToolName(
      toolCall.toolName ?? "",
      ["FETCH_AGENT_REGISTRATION_RECORD", "fetch_agent_registration_record"],
      "FETCH_AGENT_REGISTRATION_RECORD"
    );

    const parsedData =
      toolCall.parsedData?.raw as FetchRegistrationRecordToolParsedRaw | undefined;
    if (!parsedData?.success) {
      throw new Error(`Phase I expected success, got: ${JSON.stringify(parsedData)}`);
    }

    if (parsedData.did !== sharedRegistrationState.did) {
      throw new Error(
        `Phase I expected did '${sharedRegistrationState.did}', got '${String(parsedData.did)}'.`
      );
    }
    if (parsedData.network !== sharedRegistrationState.registerResult.network) {
      throw new Error(
        `Phase I expected network '${sharedRegistrationState.registerResult.network}', got '${String(parsedData.network)}'.`
      );
    }
    if (parsedData.fullyRegistered !== true) {
      throw new Error(
        `Phase I expected fullyRegistered=true, got ${String(parsedData.fullyRegistered)}`
      );
    }
    if (parsedData.t3n?.status !== "registered") {
      throw new Error(
        `Phase I expected t3n.status='registered', got '${String(parsedData.t3n?.status)}'.`
      );
    }
    if (parsedData.t3n?.record?.agentUri !== sharedRegistrationState.agentCardGatewayUrl) {
      throw new Error(
        `Phase I expected t3n.record.agentUri '${sharedRegistrationState.agentCardGatewayUrl}', got '${String(parsedData.t3n?.record?.agentUri)}'.`
      );
    }
    if (parsedData.hedera?.status !== "registered") {
      throw new Error(
        `Phase I expected hedera.status='registered', got '${String(parsedData.hedera?.status)}'.`
      );
    }
    if (
      parsedData.hedera?.record?.tokenUri !== sharedRegistrationState.agentCardGatewayUrl
    ) {
      throw new Error(
        `Phase I expected hedera.record.tokenUri '${sharedRegistrationState.agentCardGatewayUrl}', got '${String(parsedData.hedera?.record?.tokenUri)}'.`
      );
    }
    if (
      parsedData.hedera?.record?.agentId !==
      sharedRegistrationState.registerResult.hederaAgentId
    ) {
      throw new Error(
        `Phase I expected hedera.record.agentId '${sharedRegistrationState.registerResult.hederaAgentId}', got '${String(parsedData.hedera?.record?.agentId)}'.`
      );
    }

    sharedRegistrationState.fetchRecordResult = parsedData;
  });

  it("Phase J: fetches agent registry record via CCF action readback", async () => {
    if (shouldSkipOptionalRegistrationPhases()) {
      return;
    }
    if (!sharedRegistrationState?.registerResult) {
      throw new Error("Phase J requires Phase G to complete registration.");
    }

    testConfigPath = sharedRegistrationState.identityPath;
    process.env.AGENT_IDENTITY_CONFIG_PATH = sharedRegistrationState.identityPath;

    const record = await fetchAgentViaCcfAction(sharedRegistrationState.did, {
      networkTier: sharedRegistrationState.network,
      env: process.env,
    });
    if (!record) {
      throw new Error(
        `Phase J expected registry record for DID ${sharedRegistrationState.did}, got null.`
      );
    }
    if (!record.agent_uri || record.agent_uri.trim() === "") {
      throw new Error(
        `Phase J expected non-empty agent_uri in CCF readback record: ${JSON.stringify(record)}`
      );
    }
    if (record.agent_uri !== sharedRegistrationState.agentCardGatewayUrl) {
      throw new Error(
        `Phase J expected CCF readback agent_uri '${sharedRegistrationState.agentCardGatewayUrl}', got '${record.agent_uri}'.`
      );
    }
  });

  it("Phase K: verifies Hedera ERC-8004 state using tx hash and contract reads", async () => {
    if (shouldSkipOptionalRegistrationPhases()) {
      return;
    }
    if (!sharedRegistrationState?.registerResult) {
      throw new Error("Phase K requires Phase G to complete registration.");
    }
    if (typeof privateKey !== "string") {
      throw new Error("Phase K requires HEDERA_PRIVATE_KEY.");
    }

    const network = assertNonEmptyString(
      sharedRegistrationState.registerResult.network,
      "registration network"
    );
    if (network !== "testnet" && network !== "mainnet") {
      throw new Error(`Phase K expected testnet/mainnet network, got ${network}`);
    }

    const hederaTxHash = assertNonEmptyString(
      sharedRegistrationState.registerResult.hederaTxHash,
      "hedera tx hash"
    );
    const expectedAgentId = assertNonEmptyString(
      sharedRegistrationState.registerResult.hederaAgentId,
      "hedera agent id"
    );
    const expectedOwner = deriveHederaAddress(privateKey);

    const verification = await verifyHederaAgentRegistrationByTxHash(
      network,
      hederaTxHash,
      {
        env: process.env,
        expectedAgentUri: sharedRegistrationState.agentCardGatewayUrl,
        expectedOwner,
      }
    );

    if (verification.agentId !== expectedAgentId) {
      throw new Error(
        `Phase K expected agent ID '${expectedAgentId}', got '${verification.agentId}'.`
      );
    }
    if (verification.tokenUri !== sharedRegistrationState.agentCardGatewayUrl) {
      throw new Error(
        `Phase K expected token URI '${sharedRegistrationState.agentCardGatewayUrl}', got '${verification.tokenUri}'.`
      );
    }
    if (verification.owner !== expectedOwner) {
      throw new Error(
        `Phase K expected owner '${expectedOwner}', got '${verification.owner}'.`
      );
    }
  });

  // Keep session phases at the end so registration phases remain contiguous.
  it("Phase L: creates an authenticated T3N session via CREATE_T3N_AUTH_SESSION", async () => {
    if (!agentSetup) {
      throw new Error("Agent was not initialized.");
    }

    testConfigPath = await ensureReusableIdentityFile();
    process.env.AGENT_IDENTITY_CONFIG_PATH = testConfigPath;

    const { toolCall } = await invokeAgentTool({
      agent: agentSetup.agent,
      cleanup: agentSetup.cleanup,
      responseParser: agentSetup.responseParser,
      threadId: "e2e-create-session",
      userPrompt: CREATE_SESSION_USER_PROMPT,
      followUpPrompt: CREATE_SESSION_FOLLOW_UP_PROMPT,
      expectedToolNames: ["CREATE_T3N_AUTH_SESSION", "create_t3n_auth_session"],
      expectedToolLabel: "CREATE_T3N_AUTH_SESSION",
      ...IDEMPOTENT_SIDE_EFFECT_INVOCATION,
    });

    assertToolName(
      toolCall.toolName ?? "",
      ["CREATE_T3N_AUTH_SESSION", "create_t3n_auth_session"],
      "CREATE_T3N_AUTH_SESSION"
    );

    const parsedData = toolCall.parsedData?.raw as {
      success?: boolean;
      did?: string;
      reused?: boolean;
      network?: string;
    } | undefined;
    if (!parsedData?.success) {
      throw new Error(`CREATE_T3N_AUTH_SESSION did not report success. ${JSON.stringify(parsedData)}`);
    }

    assertNonEmptyString(parsedData.did, "session did");
    assertNonEmptyString(parsedData.network, "session network");
  });

  it("Phase M: validates the active T3N session via VALIDATE_T3N_AUTH_SESSION", async () => {
    if (!agentSetup) {
      throw new Error("Agent was not initialized.");
    }

    testConfigPath = await ensureReusableIdentityFile();
    process.env.AGENT_IDENTITY_CONFIG_PATH = testConfigPath;

    const threadId = "e2e-validate-session";

    await invokeAgentTool({
      agent: agentSetup.agent,
      cleanup: agentSetup.cleanup,
      responseParser: agentSetup.responseParser,
      threadId,
      userPrompt: CREATE_SESSION_USER_PROMPT,
      followUpPrompt: CREATE_SESSION_FOLLOW_UP_PROMPT,
      expectedToolNames: ["CREATE_T3N_AUTH_SESSION", "create_t3n_auth_session"],
      expectedToolLabel: "CREATE_T3N_AUTH_SESSION",
      ...IDEMPOTENT_SIDE_EFFECT_INVOCATION,
    });

    const { toolCall } = await invokeAgentTool({
      agent: agentSetup.agent,
      cleanup: agentSetup.cleanup,
      responseParser: agentSetup.responseParser,
      threadId,
      userPrompt: VALIDATE_SESSION_USER_PROMPT,
      followUpPrompt: VALIDATE_SESSION_FOLLOW_UP_PROMPT,
      expectedToolNames: ["VALIDATE_T3N_AUTH_SESSION", "validate_t3n_auth_session"],
      expectedToolLabel: "VALIDATE_T3N_AUTH_SESSION",
    });

    assertToolName(
      toolCall.toolName ?? "",
      ["VALIDATE_T3N_AUTH_SESSION", "validate_t3n_auth_session"],
      "VALIDATE_T3N_AUTH_SESSION"
    );

    const parsedData = toolCall.parsedData?.raw as {
      success?: boolean;
      isValid?: boolean;
      did?: string;
      network?: string;
    } | undefined;
    if (!parsedData?.success || parsedData.isValid !== true) {
      throw new Error(`VALIDATE_T3N_AUTH_SESSION did not report success. ${JSON.stringify(parsedData)}`);
    }

    assertNonEmptyString(parsedData.did, "validated session did");
    assertNonEmptyString(parsedData.network, "validated session network");
  });

  it("Phase N: stores a user DID via ADD_USER_DID", async () => {
    if (!agentSetup) {
      throw new Error("Agent was not initialized.");
    }

    const { toolCall } = await invokeAgentTool({
      agent: agentSetup.agent,
      cleanup: agentSetup.cleanup,
      responseParser: agentSetup.responseParser,
      threadId: "e2e-add-user-did",
      userPrompt: ADD_USER_DID_USER_PROMPT,
      followUpPrompt: ADD_USER_DID_FOLLOW_UP_PROMPT,
      expectedToolNames: ["ADD_USER_DID", "add_user_did"],
      expectedToolLabel: "ADD_USER_DID",
      ...IDEMPOTENT_SIDE_EFFECT_INVOCATION,
    });

    assertToolName(toolCall.toolName ?? "", ["ADD_USER_DID", "add_user_did"], "ADD_USER_DID");

    const parsedData = toolCall.parsedData?.raw as {
      success?: boolean;
      userDid?: string;
      remark?: string;
    } | undefined;
    if (!parsedData?.success) {
      throw new Error(`ADD_USER_DID did not report success. ${JSON.stringify(parsedData)}`);
    }
    if (parsedData.userDid !== E2E_USER_DID) {
      throw new Error(`Expected stored userDid ${E2E_USER_DID}, got ${parsedData.userDid}`);
    }
    if (parsedData.remark !== E2E_USER_DID_REMARK) {
      throw new Error(`Expected stored remark ${E2E_USER_DID_REMARK}, got ${parsedData.remark}`);
    }
  });

  it("Phase O: retrieves a stored user DID via GET_USER_DID", async () => {
    if (!agentSetup) {
      throw new Error("Agent was not initialized.");
    }

    await invokeAgentTool({
      agent: agentSetup.agent,
      cleanup: agentSetup.cleanup,
      responseParser: agentSetup.responseParser,
      threadId: "e2e-get-user-did-setup",
      userPrompt: ADD_USER_DID_USER_PROMPT,
      followUpPrompt: ADD_USER_DID_FOLLOW_UP_PROMPT,
      expectedToolNames: ["ADD_USER_DID", "add_user_did"],
      expectedToolLabel: "ADD_USER_DID",
      ...IDEMPOTENT_SIDE_EFFECT_INVOCATION,
    });

    const { toolCall } = await invokeAgentTool({
      agent: agentSetup.agent,
      cleanup: agentSetup.cleanup,
      responseParser: agentSetup.responseParser,
      threadId: "e2e-get-user-did",
      userPrompt: GET_USER_DID_USER_PROMPT,
      followUpPrompt: GET_USER_DID_FOLLOW_UP_PROMPT,
      expectedToolNames: ["GET_USER_DID", "get_user_did"],
      expectedToolLabel: "GET_USER_DID",
    });

    assertToolName(toolCall.toolName ?? "", ["GET_USER_DID", "get_user_did"], "GET_USER_DID");

    const parsedData = toolCall.parsedData?.raw as {
      success?: boolean;
      userDids?: Array<{ did?: string; remark?: string }>;
    } | undefined;
    if (!parsedData?.success) {
      throw new Error(`GET_USER_DID did not report success. ${JSON.stringify(parsedData)}`);
    }

    const entry = parsedData.userDids?.[0];
    if (!entry) {
      throw new Error(`Expected one stored user DID, got ${JSON.stringify(parsedData)}`);
    }
    if (entry.did !== E2E_USER_DID) {
      throw new Error(`Expected retrieved userDid ${E2E_USER_DID}, got ${entry.did}`);
    }
    if (entry.remark !== E2E_USER_DID_REMARK) {
      throw new Error(`Expected retrieved remark ${E2E_USER_DID_REMARK}, got ${entry.remark}`);
    }
  });

  it("Phase P: maps profile field names via PROFILE_FIELD_MAPPING", async () => {
    if (!agentSetup) {
      throw new Error("Agent was not initialized.");
    }

    const { toolCall } = await invokeAgentTool({
      agent: agentSetup.agent,
      cleanup: agentSetup.cleanup,
      responseParser: agentSetup.responseParser,
      threadId: "e2e-profile-field-mapping",
      userPrompt: PROFILE_FIELD_MAPPING_USER_PROMPT,
      followUpPrompt: PROFILE_FIELD_MAPPING_FOLLOW_UP_PROMPT,
      expectedToolNames: ["PROFILE_FIELD_MAPPING", "profile_field_mapping"],
      expectedToolLabel: "PROFILE_FIELD_MAPPING",
    });

    assertToolName(
      toolCall.toolName ?? "",
      ["PROFILE_FIELD_MAPPING", "profile_field_mapping"],
      "PROFILE_FIELD_MAPPING"
    );

    const parsedData = toolCall.parsedData?.raw as {
      success?: boolean;
      mappedFields?: Array<{ jsonPath?: string }>;
      unsupportedFields?: Array<{ field?: string }>;
    } | undefined;
    if (!parsedData?.success) {
      throw new Error(`PROFILE_FIELD_MAPPING did not report success. ${JSON.stringify(parsedData)}`);
    }

    const mappedPaths = new Set((parsedData.mappedFields ?? []).map((entry) => entry.jsonPath));
    if (!mappedPaths.has("$.givenName") || !mappedPaths.has("$.email")) {
      throw new Error(`Expected mapped profile fields, got ${JSON.stringify(parsedData)}`);
    }

    const unsupportedFields = new Set(
      (parsedData.unsupportedFields ?? []).map((entry) => entry.field)
    );
    if (!unsupportedFields.has("favorite_color")) {
      throw new Error(`Expected favorite_color to be unsupported. ${JSON.stringify(parsedData)}`);
    }
  });

  it("Phase Q: rejects own DID checks via CHECK_PROFILE_FIELD_EXISTENCE", async () => {
    if (!agentSetup) {
      throw new Error("Agent was not initialized.");
    }

    testConfigPath = await ensureReusableIdentityFile();
    process.env.AGENT_IDENTITY_CONFIG_PATH = testConfigPath;

    const threadId = "e2e-check-profile-own-did";
    const sessionResult = await invokeAgentTool({
      agent: agentSetup.agent,
      cleanup: agentSetup.cleanup,
      responseParser: agentSetup.responseParser,
      threadId,
      userPrompt: CREATE_SESSION_USER_PROMPT,
      followUpPrompt: CREATE_SESSION_FOLLOW_UP_PROMPT,
      expectedToolNames: ["CREATE_T3N_AUTH_SESSION", "create_t3n_auth_session"],
      expectedToolLabel: "CREATE_T3N_AUTH_SESSION",
      ...IDEMPOTENT_SIDE_EFFECT_INVOCATION,
    });

    const currentDid = assertNonEmptyString(
      (sessionResult.toolCall.parsedData?.raw as { did?: string } | undefined)?.did,
      "current agent did"
    );

    const userPrompt =
      `Call CHECK_PROFILE_FIELD_EXISTENCE exactly once with {"targetDid":"${currentDid}","fields":["first_name","email_address"]} and no prose.`;
    const followUpPrompt =
      `Call CHECK_PROFILE_FIELD_EXISTENCE exactly once now with {"targetDid":"${currentDid}","fields":["first_name","email_address"]} and no prose.`;

    const { toolCall } = await invokeAgentTool({
      agent: agentSetup.agent,
      cleanup: agentSetup.cleanup,
      responseParser: agentSetup.responseParser,
      threadId,
      userPrompt,
      followUpPrompt,
      expectedToolNames: ["CHECK_PROFILE_FIELD_EXISTENCE", "check_profile_field_existence"],
      expectedToolLabel: "CHECK_PROFILE_FIELD_EXISTENCE",
    });

    assertToolName(
      toolCall.toolName ?? "",
      ["CHECK_PROFILE_FIELD_EXISTENCE", "check_profile_field_existence"],
      "CHECK_PROFILE_FIELD_EXISTENCE"
    );

    const parsedData = toolCall.parsedData?.raw as {
      success?: boolean;
      error?: string;
    } | undefined;
    if (parsedData?.success !== false || parsedData.error !== "CANNOT_CHECK_OWN_PROFILE") {
      throw new Error(
        `Expected CHECK_PROFILE_FIELD_EXISTENCE to reject own DID. ${JSON.stringify(parsedData)}`
      );
    }
  });

  it("Phase R: requires a session via CHECK_MY_PROFILE_FIELDS", async () => {
    if (!agentSetup) {
      throw new Error("Agent was not initialized.");
    }

    clearT3nSession();

    const { toolCall } = await invokeAgentTool({
      agent: agentSetup.agent,
      cleanup: agentSetup.cleanup,
      responseParser: agentSetup.responseParser,
      threadId: "e2e-check-my-profile-fields-no-session",
      userPrompt: CHECK_MY_PROFILE_FIELDS_USER_PROMPT,
      followUpPrompt: CHECK_MY_PROFILE_FIELDS_FOLLOW_UP_PROMPT,
      expectedToolNames: ["CHECK_MY_PROFILE_FIELDS", "check_my_profile_fields"],
      expectedToolLabel: "CHECK_MY_PROFILE_FIELDS",
    });

    assertToolName(
      toolCall.toolName ?? "",
      ["CHECK_MY_PROFILE_FIELDS", "check_my_profile_fields"],
      "CHECK_MY_PROFILE_FIELDS"
    );

    const parsedData = toolCall.parsedData?.raw as {
      success?: boolean;
      error?: string;
    } | undefined;
    if (parsedData?.success !== false || parsedData.error !== "NO_T3N_AUTH_SESSION") {
      throw new Error(
        `Expected CHECK_MY_PROFILE_FIELDS to require an active session. ${JSON.stringify(parsedData)}`
      );
    }
  });

  it("Phase S: requires a session via VALIDATE_T3N_AUTH_SESSION", async () => {
    if (!agentSetup) {
      throw new Error("Agent was not initialized.");
    }

    const { toolCall } = await invokeAgentTool({
      agent: agentSetup.agent,
      cleanup: agentSetup.cleanup,
      responseParser: agentSetup.responseParser,
      threadId: "e2e-validate-session-no-session",
      userPrompt: VALIDATE_SESSION_USER_PROMPT,
      followUpPrompt: VALIDATE_SESSION_FOLLOW_UP_PROMPT,
      expectedToolNames: ["VALIDATE_T3N_AUTH_SESSION", "validate_t3n_auth_session"],
      expectedToolLabel: "VALIDATE_T3N_AUTH_SESSION",
    });

    assertToolName(
      toolCall.toolName ?? "",
      ["VALIDATE_T3N_AUTH_SESSION", "validate_t3n_auth_session"],
      "VALIDATE_T3N_AUTH_SESSION"
    );

    const parsedData = toolCall.parsedData?.raw as {
      success?: boolean;
      error?: string;
    } | undefined;
    if (parsedData?.success !== false) {
      throw new Error(
        `Expected VALIDATE_T3N_AUTH_SESSION to require an active session. ${JSON.stringify(parsedData)}`
      );
    }
    if (parsedData.error !== "NO_T3N_AUTH_SESSION") {
      throw new Error(
        `Expected NO_T3N_AUTH_SESSION, got ${parsedData?.error}`
      );
    }
  });

  it("Phase U: denies delegated agent-registry-register after delegated grant", async () => {
    if (shouldSkipOptionalRegistrationPhases()) {
      return;
    }

    const ownerIdentityPath = await createTestIdentityFile();
    const delegatedIdentityPath = await createTestIdentityFile();

    try {
      const ownerIdentityRaw = await readFile(ownerIdentityPath, "utf8");
      const ownerCredentials = validateStoredCredentials(JSON.parse(ownerIdentityRaw));
      const delegatedIdentityRaw = await readFile(delegatedIdentityPath, "utf8");
      const delegatedCredentials = validateStoredCredentials(JSON.parse(delegatedIdentityRaw));

      if (delegatedCredentials.did_t3n === ownerCredentials.did_t3n) {
        throw new Error("Phase U requires distinct owner and delegated DIDs.");
      }

      if (ownerCredentials.network_tier === "local") {
        throw new Error("Phase U requires non-local owner identity.");
      }
      if (delegatedCredentials.network_tier !== ownerCredentials.network_tier) {
        throw new Error(
          `Phase U requires matching network tiers, got owner=${ownerCredentials.network_tier} delegated=${delegatedCredentials.network_tier}.`
        );
      }

      const ownerClient = await createAuthenticatedT3nClientForE2e(
        ownerCredentials.private_key,
        ownerCredentials.network_tier
      );
      const delegatedClient = await createAuthenticatedT3nClientForE2e(
        delegatedCredentials.private_key,
        ownerCredentials.network_tier
      );

      const userScriptVersion = await getContractVersion(ownerClient.baseUrl, SCRIPT_NAMES.USER);
      const agentRegistryScriptVersion = await getContractVersion(
        ownerClient.baseUrl,
        SCRIPT_NAMES.AGENT_REGISTRY
      );

      const grantRaw = await ownerClient.client.execute({
        script_name: SCRIPT_NAMES.USER,
        script_version: userScriptVersion,
        function_name: AGENT_AUTH_UPDATE_FUNCTION,
        input: {
          action: "Add",
          agentDids: [delegatedClient.did],
          scripts: [
            {
              scriptName: SCRIPT_NAMES.AGENT_REGISTRY,
              versionReq: agentRegistryScriptVersion,
              functions: [AGENT_REGISTRY_REGISTER_FUNCTION],
              allowedHosts: [],
            },
          ],
        },
      });
      const grantResponse = parseExecuteResponse(grantRaw, "Phase U grant");
      const grantTxHash = extractTxHashFromExecuteResponse(grantResponse);
      if (!grantTxHash || !grantTxHash.startsWith("ccf:")) {
        throw new Error(
          `Phase U expected delegated grant tx_hash, got ${JSON.stringify(grantResponse)}`
        );
      }

      let delegatedErrorMessage: string | undefined;
      try {
        await delegatedClient.client.execute({
          script_name: SCRIPT_NAMES.AGENT_REGISTRY,
            script_version: agentRegistryScriptVersion,
            function_name: AGENT_REGISTRY_REGISTER_FUNCTION,
            pii_did: ownerClient.did,
            input: {
              agentURI: "https://example.com/agents/delegated-phase-u",
            },
          });
      } catch (error) {
        delegatedErrorMessage = error instanceof Error ? error.message : String(error);
      }

      if (!delegatedErrorMessage) {
        throw new Error(
          "Phase U expected delegated agent-registry-register to fail, but it succeeded."
        );
      }

      if (!delegatedErrorMessage.includes("agent-registry-register is self-only")) {
        throw new Error(
          `Phase U expected self-only authorization error, got: ${delegatedErrorMessage}`
        );
      }
    } finally {
      await cleanupIdentityFile(ownerIdentityPath);
      await cleanupIdentityFile(delegatedIdentityPath);
    }
  });
});
