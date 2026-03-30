import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";

import { afterEach, describe, expect, it } from "vitest";

import { runInitCommand } from "../../src/cli/init.js";

describe("init CLI", () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("creates .env and .env.secret.pinata from example templates", async () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), "hedera-t3n-plugin-init-"));

    await runInitCommand([], { cwd: tempDir });

    const envContents = readFileSync(path.join(tempDir, ".env"), "utf8");
    const pinataContents = readFileSync(path.join(tempDir, ".env.secret.pinata"), "utf8");
    const expectedEnvContents = readFileSync(path.resolve(process.cwd(), ".env.example"), "utf8");
    const expectedPinataContents = readFileSync(
      path.resolve(process.cwd(), ".env.secret.pinata.example"),
      "utf8"
    );

    expect(envContents).toBe(expectedEnvContents);
    expect(pinataContents).toBe(expectedPinataContents);
  });

  it("refuses to overwrite existing files without --force", async () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), "hedera-t3n-plugin-init-"));
    writeFileSync(path.join(tempDir, ".env"), "custom=true\n", "utf8");

    expect(() => runInitCommand([], { cwd: tempDir })).toThrow("Refusing to overwrite .env");
  });

  it("overwrites existing files with --force", async () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), "hedera-t3n-plugin-init-"));
    writeFileSync(path.join(tempDir, ".env"), "custom=true\n", "utf8");
    writeFileSync(path.join(tempDir, ".env.secret.pinata"), "PINATA_JWT=old\n", "utf8");

    await runInitCommand(["--force"], { cwd: tempDir });

    const envContents = readFileSync(path.join(tempDir, ".env"), "utf8");
    expect(envContents).toContain("HEDERA_NETWORK=testnet");
  });
});
