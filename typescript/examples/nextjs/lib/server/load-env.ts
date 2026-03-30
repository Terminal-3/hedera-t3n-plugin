import { existsSync, readFileSync } from "fs";
import path from "path";

import { getPluginRoot } from "@/lib/server/plugin-paths";

let loaded = false;

function stripWrappingQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function loadEnvFile(filePath: string): void {
  const content = readFileSync(filePath, "utf8");

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    const rawValue = line.slice(separatorIndex + 1).trim();
    process.env[key] = stripWrappingQuotes(rawValue);
  }
}

export function loadDemoServerEnv(): void {
  if (loaded) {
    return;
  }

  loaded = true;

  const pluginRoot = getPluginRoot();
  const candidatePaths = [
    path.resolve(pluginRoot, ".env"),
    path.resolve(pluginRoot, ".env.secret.pinata"),
  ];

  for (const candidatePath of candidatePaths) {
    if (!existsSync(candidatePath)) {
      continue;
    }

    loadEnvFile(candidatePath);
  }
}
