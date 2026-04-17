/**
 * Purpose: Hedera Agent Kit plugin definition for the contracted T3N public tool surface
 * Scope:   Exports plugin instance with the two supported public tools
 * Inputs:  Context from hedera-agent-kit
 * Outputs: Plugin instance with PRIVATE_DATA_PROCESSING and AUTH_AGENT_CONTEXT
 */

import type { Plugin, Context } from "hedera-agent-kit";

import { authAgentContextTool } from "./tools/auth-agent-context.js";
import { privateDataProcessingTool } from "./tools/private-data-processing.js";

export { createIdentity, formatCreateIdentityMessage } from "./createIdentity.js";
export type { CreateIdentityOptions, CreateIdentityResult, NetworkTier } from "./createIdentity.js";
export {
  formatRegisterAgentErc8004Message,
  registerAgentErc8004,
} from "./registerAgentErc8004.js";
export type {
  RegisterAgentErc8004Options,
  RegisterAgentErc8004Result,
} from "./registerAgentErc8004.js";

export const hederaT3nPlugin: Plugin = {
  name: "hedera-t3n-plugin",
  version: "2.0.0",
  description:
    "Hedera Agent Kit plugin for T3N private data processing and orchestration-focused auth context checks.",
  tools: (context: Context) => [
    privateDataProcessingTool(context),
    authAgentContextTool(context),
  ],
};

export default hederaT3nPlugin;
