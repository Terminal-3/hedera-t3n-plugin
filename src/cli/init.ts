/**
 * Purpose: CLI entrypoint for initializing local environment template files
 * Scope:   Copies packaged .env example files into the caller's working directory
 * Inputs:  Command-line arguments (--force)
 * Outputs: Creates .env and .env.secret.pinata in the current working directory
 */

import {
  chmodSync,
  copyFileSync,
  existsSync,
} from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

function usage(): string {
  return [
    "Usage:",
    "  hedera-t3n-plugin init [--force]",
    "",
    "Creates these files in the current working directory:",
    "  .env",
    "  .env.secret.pinata",
    "",
    "Options:",
    "  --force    Overwrite existing files",
  ].join("\n");
}

function getTemplatePath(fileName: ".env.example" | ".env.secret.pinata.example"): string {
  return fileURLToPath(new URL(`../../${fileName}`, import.meta.url));
}

function parseInitArgs(argv: string[]): { force: boolean } {
  let force = false;

  for (const arg of argv) {
    if (arg === "--force") {
      force = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}\n\n${usage()}`);
  }

  return { force };
}

function writeTemplateFile(
  templateFileName: ".env.example" | ".env.secret.pinata.example",
  targetFileName: ".env" | ".env.secret.pinata",
  force: boolean,
  cwd: string
): string {
  const targetPath = path.resolve(cwd, targetFileName);
  if (existsSync(targetPath) && !force) {
    throw new Error(
      `Refusing to overwrite ${targetFileName} at ${targetPath}. Re-run with --force if you want to replace it.`
    );
  }

  copyFileSync(getTemplatePath(templateFileName), targetPath);
  chmodSync(targetPath, 0o600);
  return targetPath;
}

export function runInitCommand(
  argv: string[] = process.argv.slice(2),
  options?: { cwd?: string }
): void {
  const { force } = parseInitArgs(argv);
  const cwd = options?.cwd ?? process.cwd();

  const envPath = writeTemplateFile(".env.example", ".env", force, cwd);
  const pinataEnvPath = writeTemplateFile(
    ".env.secret.pinata.example",
    ".env.secret.pinata",
    force,
    cwd
  );

  console.log(`Created ${envPath}`);
  console.log(`Created ${pinataEnvPath}`);
  console.log("Update the placeholder values before running registration or Pinata upload commands.");
}

export async function main(): Promise<void> {
  await runInitCommand();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
