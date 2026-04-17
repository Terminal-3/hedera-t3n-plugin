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
    action: "AUTH_AGENT_CONTEXT",
    phase: "Readiness",
    title: "Inspect Agent Context",
    description: "Check identity, session, and registration readiness.",
    defaultInput: {},
    timeoutMs: DEFAULT_TIMEOUT_MS,
  },
  {
    action: "PRIVATE_DATA_PROCESSING",
    phase: "Profiles",
    title: "Run Private Data Processing",
    description: "Check requested profile fields without returning private values.",
    defaultInput: {
      userDid: "did:t3n:1234567890abcdef1234567890abcdef12345678",
      fields: ["email_address", "first_name"],
    },
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
