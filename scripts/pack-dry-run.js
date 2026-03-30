#!/usr/bin/env node

import { execFileSync } from "child_process";

const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";

const env = { ...process.env };
const keysToRemove = [
  "npm_config_reporter",
  "npm_config__terminal-3-registry",
  "npm_config__terminal_3_registry",
  "npm_config__scope-registry",
  "npm_config__scope_registry",
];

for (const key of keysToRemove) {
  delete env[key];
  delete env[key.toUpperCase()];
}

execFileSync(npmExecutable, ["pack", "--dry-run"], {
  env,
  stdio: "inherit",
});

