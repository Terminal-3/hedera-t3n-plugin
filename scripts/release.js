#!/usr/bin/env node

import { execSync } from "child_process";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");

const packageJson = JSON.parse(
  readFileSync(join(rootDir, "package.json"), "utf-8")
);
const version = packageJson.version;
const packageName = packageJson.name;

if (!version || !packageName) {
  console.error("Error: Could not read package name/version from package.json");
  process.exit(1);
}

const args = process.argv.slice(2);
const command = args[0];
const skipGitCheck = args.includes("--skip-git-check");

function execCommand(cmd, options = {}) {
  try {
    return execSync(cmd, {
      cwd: rootDir,
      stdio: "inherit",
      ...options,
    });
  } catch {
    console.error(`Command failed: ${cmd}`);
    process.exit(1);
  }
}

function verifyVersion() {
  console.log(`Package: ${packageName}`);
  console.log(`Version: ${version}`);
}

function verifyGitClean() {
  if (skipGitCheck) {
    console.log("Skipping git status check (--skip-git-check flag)");
    return;
  }

  try {
    const status = execSync("git status --porcelain", {
      cwd: rootDir,
      encoding: "utf-8",
    });

    if (status.trim()) {
      console.log("Working directory is not clean");
      console.log(status);
      console.log("\nUse --skip-git-check to proceed anyway");
      process.exit(1);
    }
  } catch {
    console.error("Error checking git status");
    process.exit(1);
  }
}

function verifyTag(tag) {
  try {
    execSync(`git rev-parse ${tag}`, {
      cwd: rootDir,
      stdio: "ignore",
    });
    console.error(`Error: Tag ${tag} already exists`);
    process.exit(1);
  } catch {
    // Tag does not exist, which is what we want.
  }
}

function createTag(tag, message) {
  console.log(`Creating git tag: ${tag}`);
  execCommand(`git tag -a "${tag}" -m "${message}"`);
  console.log(`Tag created: ${tag}`);
}

function validatePackage() {
  console.log("Running validation suite...");
  execCommand("pnpm validate");
}

function publishPackage() {
  console.log("Publishing to public npm...");
  execCommand("pnpm publish --access public");
}

function release(publish = true) {
  console.log(`Releasing ${packageName} version ${version}...`);

  verifyVersion();
  verifyGitClean();

  const tag = `hedera-t3n-plugin-v${version}`;
  verifyTag(tag);

  validatePackage();

  if (publish) {
    publishPackage();
  }

  createTag(tag, `Release ${packageName} v${version}`);

  console.log(`\nRelease complete: ${tag}`);
  console.log("\nNext steps:");
  console.log(`  git push origin ${tag}`);
  if (!publish) {
    console.log("  pnpm publish");
  }
}

switch (command) {
  case "release":
  case "publish":
    release(true);
    break;
  case "tag-only":
    release(false);
    break;
  case "verify-version":
    verifyVersion();
    break;
  default:
    console.error("Unknown command:", command);
    console.error("\nUsage: node scripts/release.js <command> [--skip-git-check]");
    console.error("\nCommands:");
    console.error("  release             Build + create package tag + publish");
    console.error("  publish             Alias for release");
    console.error("  tag-only            Build + create package tag only");
    console.error("  verify-version      Verify name/version from package.json");
    process.exit(1);
}
