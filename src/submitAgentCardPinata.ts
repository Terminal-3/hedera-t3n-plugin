/**
 * Purpose: Shared Pinata upload workflow for the public agent card JSON
 * Scope:   Resolves identity config path, loads or generates agent_card.json, uploads it to
 *          Pinata, and persists CID bookkeeping back to the local identity JSON
 * Inputs:  Identity config path, Pinata credentials, optional environment fallback
 * Outputs: CID, gateway URL, upload filename, and updated identity config metadata
 */

import { PinataSDK } from "pinata";

import {
  getAgentCardUploadFilename,
  loadOrCreateAgentCard,
  type AgentIdentityRecord,
} from "./utils/agentCard.js";
import {
  loadAgentIdentityConfigObject,
  resolveRequiredAgentIdentityConfigPath,
} from "./utils/agent-identity-config.js";
import { ensureOwnerOnlyFilePermissions } from "./utils/file-permissions.js";
import { writeIdentityConfigFile } from "./utils/storage.js";
import { messageFromError } from "./utils/tool-result.js";

export interface SubmitAgentCardPinataOptions {
  identityConfigPath?: string;
  jwt?: string;
  apiKey?: string;
  apiSecret?: string;
  env?: NodeJS.ProcessEnv;
}

export interface SubmitAgentCardPinataResult {
  cid: string;
  gatewayUrl: string;
  uploadFilename: string;
  agentCardPath: string;
  identityConfigPath: string;
  created: boolean;
}

async function uploadWithJwt(
  agentCard: Record<string, unknown>,
  uploadFilename: string,
  jwt: string
): Promise<string> {
  const pinata = new PinataSDK({ pinataJwt: jwt });
  const upload = await pinata.upload.public.json(agentCard).name(uploadFilename);
  const cid = upload?.cid;

  if (!cid || typeof cid !== "string") {
    throw new Error("Pinata JWT upload did not return a CID");
  }

  return cid;
}

async function uploadWithApiKey(
  agentCard: Record<string, unknown>,
  uploadFilename: string,
  apiKey: string,
  apiSecret: string
): Promise<string> {
  const response = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      pinata_api_key: apiKey,
      pinata_secret_api_key: apiSecret,
    },
    body: JSON.stringify({
      pinataContent: agentCard,
      pinataMetadata: {
        name: uploadFilename,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Pinata API error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as { IpfsHash?: string };
  const cid = data.IpfsHash;

  if (!cid || typeof cid !== "string") {
    throw new Error("Pinata API key upload did not return a CID");
  }

  return cid;
}

export async function submitAgentCardToPinata(
  options: SubmitAgentCardPinataOptions = {}
): Promise<SubmitAgentCardPinataResult> {
  const env = options.env ?? process.env;
  const identityConfigPath = resolveRequiredAgentIdentityConfigPath({
    pathOverride: options.identityConfigPath,
    env,
    missingPathMessage:
      "Agent identity configuration path is required. Pass --path <identity.json> or set AGENT_IDENTITY_CONFIG_PATH.",
  });
  const identityJson = (await loadAgentIdentityConfigObject({
    resolvedPath: identityConfigPath,
    emptyFileMessage: `Identity file at ${identityConfigPath} is empty. Run \`pnpm create-identity\` first.`,
    invalidObjectMessage: "Identity file must contain a JSON object",
  })) as AgentIdentityRecord;
  const { agentCardPath, agentCard, created } = await loadOrCreateAgentCard({
    identityPath: identityConfigPath,
    identity: identityJson,
  });
  const uploadFilename = getAgentCardUploadFilename(identityJson);

  const envJwt = env.PINATA_JWT?.trim() || undefined;
  const envApiKey = env.PINATA_API_KEY?.trim() || undefined;
  const envApiSecret = env.PINATA_API_SECRET?.trim() || undefined;

  const jwt = options.jwt?.trim() || envJwt;
  const apiKey = options.apiKey?.trim() || envApiKey;
  const apiSecret = options.apiSecret?.trim() || envApiSecret;
  const hasJwt = Boolean(jwt);
  const hasApiKeyAuth = Boolean(apiKey && apiSecret);

  if (!hasJwt && !hasApiKeyAuth) {
    throw new Error(
      "Missing Pinata auth. Use --jwt <PINATA_JWT> or --api-key <KEY> --api-secret <SECRET>, " +
        "or set PINATA_JWT / PINATA_API_KEY + PINATA_API_SECRET in the shell environment."
    );
  }

  if (hasJwt && hasApiKeyAuth) {
    console.warn(
      "Warning: Both PINATA_JWT and PINATA_API_KEY/PINATA_API_SECRET were provided. " +
        "Trying JWT first, then falling back to API key/secret if JWT upload fails."
    );
  }

  let cid: string | undefined;
  let jwtError: string | undefined;
  let apiKeyError: string | undefined;

  if (hasJwt) {
    try {
      cid = await uploadWithJwt(agentCard, uploadFilename, jwt as string);
    } catch (error) {
      jwtError = messageFromError(error);
      if (hasApiKeyAuth) {
        console.warn(
          `Warning: JWT upload failed. Falling back to API key/secret. Reason: ${jwtError}`
        );
      } else {
        throw error;
      }
    }
  }

  if (!cid && hasApiKeyAuth) {
    try {
      cid = await uploadWithApiKey(
        agentCard,
        uploadFilename,
        apiKey as string,
        apiSecret as string
      );
    } catch (error) {
      apiKeyError = messageFromError(error);
      if (jwtError) {
        throw new Error(
          `Pinata upload failed. JWT attempt: ${jwtError}. API key attempt: ${apiKeyError}`
        );
      }
      throw error;
    }
  }

  if (!cid) {
    throw new Error(
      jwtError
        ? `Pinata upload failed. JWT attempt: ${jwtError}`
        : "Pinata upload failed without returning a CID"
    );
  }

  const gatewayUrl = `https://gateway.pinata.cloud/ipfs/${cid}`;
  const updatedIdentity = {
    ...identityJson,
    agent_card_path: agentCardPath,
    agent_card_cid: cid,
    agent_card_gateway_url: gatewayUrl,
  };

  await writeIdentityConfigFile(identityConfigPath, updatedIdentity);
  await ensureOwnerOnlyFilePermissions(agentCardPath);

  return {
    cid,
    gatewayUrl,
    uploadFilename,
    agentCardPath,
    identityConfigPath,
    created,
  };
}
