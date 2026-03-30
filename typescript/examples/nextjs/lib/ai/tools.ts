import path from "path";
import { pathToFileURL } from "url";

import { tool, type ToolSet } from "ai";

import { redactValue } from "@/lib/redaction";
import { getPluginDistRoot } from "@/lib/server/plugin-paths";
import { loadDemoServerEnv } from "@/lib/server/load-env";
import { importRuntimeModule } from "@/lib/server/runtime-import";

type ToolResultLike = {
  raw: Record<string, unknown>;
  humanMessage: string;
};

type PluginToolLike = {
  method: string;
  name: string;
  description: string;
  parameters: unknown;
  execute: (
    client: unknown,
    context: unknown,
    params: unknown
  ) => Promise<ToolResultLike>;
};

type PluginModule = {
  hederaT3nPlugin: {
    tools: (context: unknown) => PluginToolLike[];
  };
};

async function loadPluginModule(): Promise<PluginModule> {
  loadDemoServerEnv();
  const pluginPath = path.join(getPluginDistRoot(), "plugin.js");
  return importRuntimeModule<PluginModule>(pathToFileURL(pluginPath).href);
}

function sanitizeToolResult(result: ToolResultLike) {
  return {
    humanMessage: result.humanMessage,
    raw: redactValue(result.raw),
  };
}

export async function getPluginToolDefinitions(): Promise<PluginToolLike[]> {
  const pluginModule = await loadPluginModule();
  return pluginModule.hederaT3nPlugin.tools({});
}

export async function getAiSdkTools(): Promise<ToolSet> {
  const pluginTools = await getPluginToolDefinitions();

  return Object.fromEntries(
    pluginTools.map((pluginTool) => [
      pluginTool.name,
      tool({
        description: pluginTool.description,
        inputSchema: pluginTool.parameters as never,
        execute: async (input) => {
          const result = await pluginTool.execute(undefined, {}, input);
          return sanitizeToolResult(result);
        },
      }),
    ])
  );
}

export async function getPluginToolByAction(
  action: string
): Promise<PluginToolLike | undefined> {
  const pluginTools = await getPluginToolDefinitions();
  return pluginTools.find((toolDefinition) => toolDefinition.name === action);
}
