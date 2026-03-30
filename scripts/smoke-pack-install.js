#!/usr/bin/env node

import { execFileSync } from "child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");

const expectedToolNames = [
  "ADD_USER_DID",
  "CHECK_AGENT_REGISTRATION_STATUS",
  "CHECK_MY_PROFILE_FIELDS",
  "CHECK_PROFILE_FIELD_EXISTENCE",
  "CREATE_T3N_AUTH_SESSION",
  "FETCH_AGENT_REGISTRATION_RECORD",
  "GET_USER_DID",
  "HAS_AGENT_IDENTITY_CONFIG",
  "PROFILE_FIELD_MAPPING",
  "VALIDATE_T3N_AUTH_SESSION",
];

const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
const cliExecutable = process.platform === "win32" ? "hedera-t3n-plugin.cmd" : "hedera-t3n-plugin";

function buildNpmEnv() {
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

  return {
    ...env,
    npm_config_loglevel: "error",
  };
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: rootDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const tempRoot = mkdtempSync(join(tmpdir(), "hedera-t3n-plugin-smoke-"));

try {
  const npmEnv = buildNpmEnv();
  const packJson = run(npmExecutable, ["pack", "--json", "--pack-destination", tempRoot], {
    env: npmEnv,
  });
  const packEntries = JSON.parse(packJson);
  const tarballName = packEntries?.[0]?.filename;
  assert(typeof tarballName === "string" && tarballName.length > 0, "npm pack did not return a tarball name.");

  const tarballPath = join(tempRoot, tarballName);
  const consumerDir = join(tempRoot, "consumer");
  mkdirSync(consumerDir, { recursive: true });

  writeFileSync(
    join(consumerDir, "package.json"),
    JSON.stringify(
      {
        name: "hedera-t3n-plugin-smoke-consumer",
        private: true,
        type: "module",
      },
      null,
      2
    ) + "\n"
  );

  execFileSync(
    npmExecutable,
    [
      "install",
      "--no-audit",
      "--no-fund",
      tarballPath,
      "@hashgraph/sdk",
      "hedera-agent-kit",
    ],
    {
      cwd: consumerDir,
      env: npmEnv,
      stdio: "inherit",
    }
  );

  const smokeScriptPath = join(consumerDir, "smoke.mjs");
  writeFileSync(
    smokeScriptPath,
    `import pluginDefault, { hederaT3nPlugin } from "@terminal3/hedera-t3n-plugin";
import { createRequire } from "node:module";

const expectedToolNames = ${JSON.stringify(expectedToolNames, null, 2)};
const toolNames = hederaT3nPlugin.tools({}).map((tool) => tool.name);

if (pluginDefault !== hederaT3nPlugin) {
  throw new Error("Default export does not match named hederaT3nPlugin export.");
}

for (const expectedToolName of expectedToolNames) {
  if (!toolNames.includes(expectedToolName)) {
    throw new Error(\`Missing expected tool from packed artifact: \${expectedToolName}\`);
  }
}

const require = createRequire(import.meta.url);
const pkg = require("@terminal3/hedera-t3n-plugin/package.json");

if (pkg.publishConfig?.access !== "public") {
  throw new Error("Packed package.json does not advertise public publish access.");
}

console.log("Packed import smoke test passed.");
`
  );

  execFileSync("node", [smokeScriptPath], {
    cwd: consumerDir,
    stdio: "inherit",
  });

  const cliOutput = execFileSync(
    join(consumerDir, "node_modules", ".bin", cliExecutable),
    ["--help"],
    {
      cwd: consumerDir,
      encoding: "utf8",
    }
  );
  assert(cliOutput.includes("Usage:"), "Packed CLI did not return usage output.");

  const packedReadme = readFileSync(join(consumerDir, "node_modules", "@terminal3", "hedera-t3n-plugin", "README.md"), "utf8");
  assert(
    packedReadme.includes("CHECK_PROFILE_FIELD_EXISTENCE"),
    "Packed README is missing the restored feature documentation."
  );

  console.log("Pack smoke-install passed.");
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
