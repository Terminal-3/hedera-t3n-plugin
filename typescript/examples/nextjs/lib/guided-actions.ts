import { z } from "zod";

const DEFAULT_TIMEOUT_MS = 20_000;

export type GuidedActionDefinition = {
  action: string;
  phase: string;
  title: string;
  description: string;
  defaultInput: Record<string, unknown>;
  timeoutMs: number;
};

export const GUIDED_ACTIONS: GuidedActionDefinition[] = [
  {
    action: "HAS_AGENT_IDENTITY_CONFIG",
    phase: "Identity",
    title: "Check Identity File",
    description: "Validate the configured local agent identity file.",
    defaultInput: {},
    timeoutMs: DEFAULT_TIMEOUT_MS,
  },
  {
    action: "CREATE_T3N_AUTH_SESSION",
    phase: "Session",
    title: "Create Auth Session",
    description: "Create or reuse the authenticated T3N session.",
    defaultInput: {},
    timeoutMs: DEFAULT_TIMEOUT_MS,
  },
  {
    action: "VALIDATE_T3N_AUTH_SESSION",
    phase: "Session",
    title: "Validate Session",
    description: "Check if the in-memory T3N session is still authenticated.",
    defaultInput: {},
    timeoutMs: DEFAULT_TIMEOUT_MS,
  },
  {
    action: "ADD_USER_DID",
    phase: "User DID",
    title: "Store User DID",
    description: "Track a user DID with a local remark for later profile checks.",
    defaultInput: {
      userDid: "did:t3n:a:demo-user",
      remark: "demo-user",
    },
    timeoutMs: DEFAULT_TIMEOUT_MS,
  },
  {
    action: "GET_USER_DID",
    phase: "User DID",
    title: "Lookup User DID",
    description: "Read the locally tracked user DIDs.",
    defaultInput: {},
    timeoutMs: DEFAULT_TIMEOUT_MS,
  },
  {
    action: "PROFILE_FIELD_MAPPING",
    phase: "Profiles",
    title: "Map Profile Fields",
    description: "Translate friendly field names to T3N selectors.",
    defaultInput: {
      fields: ["email", "first_name", "last_name"],
    },
    timeoutMs: DEFAULT_TIMEOUT_MS,
  },
  {
    action: "CHECK_MY_PROFILE_FIELDS",
    phase: "Profiles",
    title: "Check Stored Profile",
    description: "Verify requested fields on the currently stored user DID profile.",
    defaultInput: {
      fields: ["email", "first_name"],
    },
    timeoutMs: DEFAULT_TIMEOUT_MS,
  },
  {
    action: "CHECK_PROFILE_FIELD_EXISTENCE",
    phase: "Profiles",
    title: "Check Target Profile",
    description: "Verify requested fields on another DID.",
    defaultInput: {
      targetDid: "did:t3n:a:demo-user",
      fields: ["email"],
    },
    timeoutMs: DEFAULT_TIMEOUT_MS,
  },
  {
    action: "CHECK_AGENT_REGISTRATION_STATUS",
    phase: "Registration",
    title: "Check Registration Status",
    description:
      "Verify whether the current agent is registered on both networks. Works only on testnet or mainnet (not local).",
    defaultInput: {},
    timeoutMs: DEFAULT_TIMEOUT_MS,
  },
  {
    action: "FETCH_AGENT_REGISTRATION_RECORD",
    phase: "Registration",
    title: "Fetch Registration Record",
    description:
      "Fetch the current registration records from T3N and Hedera. Works only on testnet or mainnet (not local).",
    defaultInput: {},
    timeoutMs: DEFAULT_TIMEOUT_MS,
  },
];

const guidedActionBodySchema = z.object({
  chatId: z.string().trim().optional(),
  input: z.record(z.string(), z.unknown()).optional(),
});

export function getGuidedActionDefinition(action: string): GuidedActionDefinition | undefined {
  return GUIDED_ACTIONS.find((definition) => definition.action === action);
}

export function parseGuidedActionBody(body: unknown) {
  return guidedActionBodySchema.parse(body);
}
