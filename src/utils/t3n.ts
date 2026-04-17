/**
 * Purpose: Facade for T3N utilities, re-exporting modularized components
 */

export * from "./t3n-urls.js";
export * from "./t3n-client-factory.js";
export * from "./t3n-registration.js";
export * from "./t3n-registration-lookup.js";

export {
  deriveDeterministicT3nDid,
  extractEthHexFromDid,
  normalizeEthAddressHex,
  normalizeT3nDid,
} from "./identity-utils.js";

export {
  isLikelyNetworkError,
  isTransientNetworkOrGatewayError,
} from "./error-utils.js";

export {
  agentRegistryRecordSchema,
  type AgentRegistryRecord,
} from "./validation.js";

import {
  resolveT3nBaseUrl,
  resolveT3nRuntimeApiUrl,
  inferT3nEnvFromUrl,
  getHederaNetworkFromTier,
} from "./t3n-urls.js";
import {
  createAuthenticatedT3nClient,
  authenticateT3nClientWithEthDidSuffix,
} from "./t3n-client-factory.js";
import {
  registerDidT3n,
  resolveRegistrationConfirmationTimeoutMs,
} from "./t3n-registration.js";
import { fetchAgentViaCcfAction } from "./t3n-registration-lookup.js";

export {
  resolveT3nBaseUrl,
  resolveT3nRuntimeApiUrl,
  inferT3nEnvFromUrl,
  getHederaNetworkFromTier,
  createAuthenticatedT3nClient,
  authenticateT3nClientWithEthDidSuffix,
  registerDidT3n,
  resolveRegistrationConfirmationTimeoutMs,
  fetchAgentViaCcfAction,
};
