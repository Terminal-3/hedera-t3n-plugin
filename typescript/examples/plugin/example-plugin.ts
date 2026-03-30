import { z } from "zod";

import type { Context, Plugin, Tool } from "hedera-agent-kit";
import { hederaT3nPlugin } from "@terminal3/hedera-t3n-plugin";

const createT3nBootstrapGuideTool = (_context: Context): Tool => ({
  method: "t3n_bootstrap_guide",
  name: "T3N_BOOTSTRAP_GUIDE",
  description:
    "Explain the recommended bootstrap order for Hedera T3N plugin usage in a local agent runtime.",
  parameters: z.object({}).strict(),
  outputParser: undefined,
  execute: async () => {
    const steps = [
      "Run `pnpm create-identity` in the plugin package.",
      "Set `AGENT_IDENTITY_CONFIG_PATH` to the generated identity file.",
      "Call `HAS_AGENT_IDENTITY_CONFIG` to validate local readiness.",
      "Call `CREATE_T3N_AUTH_SESSION` before profile-related tools.",
      "Store or query user DIDs with `ADD_USER_DID` and `GET_USER_DID` as needed.",
      "Use registration inspection tools after explicit CLI registration.",
    ];

    return {
      raw: {
        success: true,
        steps,
      },
      humanMessage: `Recommended bootstrap order:\n- ${steps.join("\n- ")}`,
    };
  },
});

export const composedT3nPlugin: Plugin = {
  name: "composed-t3n-plugin-example",
  version: "0.1.0",
  description:
    "Example plugin that reuses hederaT3nPlugin and appends one local guidance tool.",
  tools: (context: Context) => [
    ...hederaT3nPlugin.tools(context),
    createT3nBootstrapGuideTool(context),
  ],
};

function formatToolNames(plugin: Plugin): string[] {
  return plugin.tools({} as Context).map((tool) => tool.name);
}

async function main(): Promise<void> {
  const baseToolNames = formatToolNames(hederaT3nPlugin);
  const composedToolNames = formatToolNames(composedT3nPlugin);

  console.log("Base Hedera T3N plugin tools:");
  for (const name of baseToolNames) {
    console.log(`- ${name}`);
  }

  console.log("");
  console.log("Composed plugin tools:");
  for (const name of composedToolNames) {
    console.log(`- ${name}`);
  }
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  main().catch((error: unknown) => {
    console.error("Failed to print plugin showcase:", error);
    process.exitCode = 1;
  });
}
