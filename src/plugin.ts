/**
 * Purpose: Hedera Agent Kit plugin definition for T3N identity validation
 * Scope:   Exports plugin instance with tools for validating agent identity configuration files
 * Inputs:  Context from hedera-agent-kit
 * Outputs: Plugin instance with HAS_AGENT_IDENTITY_CONFIG tool
 */

import type { Plugin, Context } from "hedera-agent-kit";

import { addUserDidTool } from "./tools/add-user-did.js";
import { checkAgentRegistrationStatusTool } from "./tools/check-agent-registration-status.js";
import { checkMyProfileFieldsTool } from "./tools/check-my-profile-fields.js";
import { checkProfileFieldExistenceTool } from "./tools/check-profile-field-existence.js";
import { createT3nAuthSessionTool } from "./tools/create-t3n-auth-session.js";
import { fetchAgentRegistrationRecordTool } from "./tools/fetch-agent-registration-record.js";
import { getUserDidTool } from "./tools/get-user-did.js";
import { hasAgentIdentityConfigTool } from "./tools/has-agent-identity-config.js";
import { profileFieldMappingTool } from "./tools/profile-field-mapping.js";
import { validateT3nAuthSessionTool } from "./tools/validate-t3n-auth-session.js";

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
    "Hedera Agent Kit plugin for T3N identity readiness, session authentication, user DID lookup, profile verification, and agent registration inspection.",
  tools: (context: Context) => [
    addUserDidTool(context),
    checkAgentRegistrationStatusTool(context),
    checkMyProfileFieldsTool(context),
    checkProfileFieldExistenceTool(context),
    createT3nAuthSessionTool(context),
    fetchAgentRegistrationRecordTool(context),
    getUserDidTool(context),
    hasAgentIdentityConfigTool(context),
    profileFieldMappingTool(context),
    validateT3nAuthSessionTool(context),
  ],
};

export default hederaT3nPlugin;
