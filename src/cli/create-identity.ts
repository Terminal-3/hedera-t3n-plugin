/**
 * Purpose: CLI entrypoint for creating agent identities
 * Scope:   Parses CLI arguments, handles file overwrite prompts, orchestrates identity creation
 * Inputs:  Command-line arguments (--env, --path), environment variables
 * Outputs: Creates identity file and prints formatted success message
 */

import { copyFileSync, existsSync } from "fs";
import { createInterface } from "readline";
import path from "path";
import { pathToFileURL } from "url";

import { createIdentity, formatCreateIdentityMessage } from "../createIdentity.js";
import { getAgentIdentityConfigPath, loadDotenvSafe } from "../utils/env.js";
import {
  getOverwriteDecision,
  parseCreateIdentityArgs,
  resolveOutputTarget,
} from "./identity-args.js";

/** Returns a filesystem-safe timestamp suffix (YYYYMMDD-HHmmss). */
function timestampSuffix(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${y}${m}${day}-${h}${min}${s}`;
}

/**
 * Backup an existing file by copying it to the same directory with a timestamp suffix before the extension.
 * Example: agent_identity.json -> agent_identity.20250209-133625.json
 */
function backupExistingFile(filePath: string): string {
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  const backupPath = path.join(dir, `${base}.${timestampSuffix()}${ext}`);
  copyFileSync(filePath, backupPath);
  return backupPath;
}

/**
 * Prompt user for confirmation (y/n).
 * Returns true if user confirms, false if user declines.
 * In non-interactive environments (no TTY), defaults to false for safety.
 */
async function promptConfirmation(message: string): Promise<boolean> {
  // Check if running in interactive environment
  if (!process.stdin.isTTY) {
    console.error("Non-interactive environment detected. Cannot prompt for confirmation.");
    return false;
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(message, (answer) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      resolve(normalized === "y" || normalized === "yes");
    });
  });
}

export async function runCreateIdentityCommand(
  argv: string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  loadDotenvSafe();

  const { networkTier, pathArg } = parseCreateIdentityArgs(argv, env);

  const outputTarget = resolveOutputTarget(pathArg, getAgentIdentityConfigPath(env));
  let outputPath: string | undefined;
  let outputDir: string | undefined;

  if (outputTarget.kind === "file") {
    const resolvedPath = outputTarget.path;
    const decision = getOverwriteDecision({
      targetPath: resolvedPath,
      fileExists: existsSync(resolvedPath),
      isTTY: Boolean(process.stdin.isTTY),
    });

    if (decision.action === "fail") {
      throw new Error(decision.message);
    }
    if (decision.action === "prompt") {
      const confirmed = await promptConfirmation(
        `File already exists at ${resolvedPath}. Overwrite? (y/n): `
      );
      if (!confirmed) {
        console.log("Operation cancelled. File not overwritten.");
        process.exit(0);
      }
      const backupPath = backupExistingFile(resolvedPath);
      console.log(`Backup saved to: ${backupPath}`);
    }

    outputPath = resolvedPath;
  } else if (outputTarget.kind === "dir") {
    outputDir = outputTarget.path;
  }

  // Create identity (with custom path if specified)
  const identityResult = await createIdentity({
    networkTier,
    outputPath,
    outputDir,
  });

  console.log(formatCreateIdentityMessage(identityResult));
}

export async function main(): Promise<void> {
  await runCreateIdentityCommand();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("Failed to create identity", error);
    process.exit(1);
  });
}
