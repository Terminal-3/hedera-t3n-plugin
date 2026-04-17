import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const validations = [
  {
    name: "plugin",
    cwd: path.join(repoRoot, "typescript/examples/plugin"),
    commands: [
      "pnpm install --frozen-lockfile --config.confirmModulesPurge=false",
      "pnpm typecheck",
      "pnpm showcase",
    ],
  },
  {
    name: "langchain",
    cwd: path.join(repoRoot, "typescript/examples/langchain"),
    commands: [
      "pnpm install --frozen-lockfile --config.confirmModulesPurge=false",
      "pnpm typecheck",
    ],
  },
  {
    name: "ai-sdk",
    cwd: path.join(repoRoot, "typescript/examples/ai-sdk"),
    commands: [
      "pnpm install --frozen-lockfile --config.confirmModulesPurge=false",
      "pnpm typecheck",
    ],
  },
  {
    name: "nextjs",
    cwd: path.join(repoRoot, "typescript/examples/nextjs"),
    commands: [
      "pnpm install --frozen-lockfile --config.confirmModulesPurge=false",
      "pnpm typecheck",
      "pnpm test",
      "pnpm lint",
      "pnpm build",
    ],
  },
];

runCommand("pnpm build", repoRoot, "root");

for (const validation of validations) {
  for (const command of validation.commands) {
    runCommand(command, validation.cwd, validation.name);
  }
}

function runCommand(command, cwd, label) {
  console.log(`\n[${label}] ${command}`);

  const result = spawnSync(command, {
    cwd,
    shell: true,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
