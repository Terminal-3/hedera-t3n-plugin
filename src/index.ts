/**
 * Purpose: Public API exports for hedera-t3n-plugin
 * Scope:   Re-exports plugin, identity creation functions, and types
 * Inputs:  N/A (module exports)
 * Outputs: Plugin instance, createIdentity function, and type definitions
 */

export {
  createIdentity,
  formatCreateIdentityMessage,
  formatRegisterAgentErc8004Message,
  hederaT3nPlugin,
  hederaT3nPlugin as default,
  registerAgentErc8004,
} from "./plugin.js";
export { submitAgentCardToPinata } from "./submitAgentCardPinata.js";

export type {
  CreateIdentityOptions,
  CreateIdentityResult,
  NetworkTier,
} from "./createIdentity.js";
export type {
  SubmitAgentCardPinataOptions,
  SubmitAgentCardPinataResult,
} from "./submitAgentCardPinata.js";
export type {
  RegisterAgentErc8004Options,
  RegisterAgentErc8004Result,
} from "./registerAgentErc8004.js";
