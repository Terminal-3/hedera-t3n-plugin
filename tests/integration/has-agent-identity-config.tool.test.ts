/**
 * Purpose: Integration tests for HAS_AGENT_IDENTITY_CONFIG tool
 * Scope:   Tests file system operations, environment variable handling, validation logic
 * Inputs:  Test identity files, environment configurations
 * Outputs: Test assertions for tool behavior
 */

import { tmpdir } from "os";
import { relative, resolve } from "path";

import { writeFile } from "fs/promises";

import type { Context } from "hedera-agent-kit";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createIdentity } from "../../src/createIdentity.js";
import { hasAgentIdentityConfigTool } from "../../src/tools/has-agent-identity-config.js";
import { captureEnv, restoreEnv } from "../helpers/env.js";
import { cleanupTempFile, createTempFilePath } from "../helpers/temp-files.js";

/**
 * Integration tests for HAS_AGENT_IDENTITY_CONFIG tool.
 * Focuses on file system + env handling without requiring external services.
 */

const context: Context = {} as Context;
// Tool.execute accepts unknown but Tool interface expects NodeClient - using type assertion.
const mockClient = null as unknown as Parameters<ReturnType<typeof hasAgentIdentityConfigTool>["execute"]>[0];
const envSnapshot = captureEnv([
  "AGENT_IDENTITY_CONFIG_PATH",
  "HEDERA_NETWORK",
  "T3N_LOCAL_BACKEND",
]);

const buildTool = () => hasAgentIdentityConfigTool(context);

describe("HAS_AGENT_IDENTITY_CONFIG tool", () => {
  let testConfigPath = "";

  beforeEach(() => {
    process.env.HEDERA_NETWORK = "testnet";
    process.env.T3N_LOCAL_BACKEND = "mock";
    testConfigPath = createTempFilePath("test-agent-identity");
  });

  afterEach(async () => {
    await cleanupTempFile(testConfigPath);
    restoreEnv(envSnapshot);
  });

  it("should return success when a valid identity file exists", async () => {
    process.env.HEDERA_NETWORK = "local"; // Use local/mock mode for faster tests.
    await createIdentity({ networkTier: "local", outputPath: testConfigPath });
    process.env.AGENT_IDENTITY_CONFIG_PATH = testConfigPath;

    const tool = buildTool();
    const result = await tool.execute(mockClient, context, {});

    expect(result.raw.success).toBe(true);
    expect(result.humanMessage).toBe("Your agent identity is ready.");
    expect(result.raw.path).toBe(resolve(testConfigPath));
  });

  it("should return guidance when the file does not exist", async () => {
    const missingPath = createTempFilePath("non-existent-file");
    process.env.AGENT_IDENTITY_CONFIG_PATH = missingPath;

    const tool = buildTool();
    const result = await tool.execute(mockClient, context, {});

    expect(result.raw.success).toBe(false);
    expect(result.raw.error).toBe("File not found");
    expect(result.humanMessage).toContain("not found");
    expect(result.humanMessage).toContain("pnpm create-identity");
  });

  it("should return guidance when AGENT_IDENTITY_CONFIG_PATH is not set", async () => {
    delete process.env.AGENT_IDENTITY_CONFIG_PATH;

    const tool = buildTool();
    const result = await tool.execute(mockClient, context, {});

    expect(result.raw.success).toBe(false);
    expect(result.raw.error).toBe("AGENT_IDENTITY_CONFIG_PATH not set");
    expect(result.humanMessage).toContain("not set");
    expect(result.humanMessage).toContain("pnpm create-identity");
  });

  it("should return guidance when file contains invalid JSON", async () => {
    await writeFile(testConfigPath, "invalid json content", "utf8");
    process.env.AGENT_IDENTITY_CONFIG_PATH = testConfigPath;

    const tool = buildTool();
    const result = await tool.execute(mockClient, context, {});

    expect(result.raw.success).toBe(false);
    expect(result.raw.error).toBe("Invalid JSON");
    expect(result.humanMessage).toContain("invalid JSON");
    expect(result.humanMessage).toContain("pnpm create-identity");
  });

  it("should return guidance when file is missing required fields", async () => {
    const incompleteJson = {
      version: 1,
      created_at: new Date().toISOString(),
      did_key: "did:key:zTest",
    };
    await writeFile(testConfigPath, JSON.stringify(incompleteJson), "utf8");
    process.env.AGENT_IDENTITY_CONFIG_PATH = testConfigPath;

    const tool = buildTool();
    const result = await tool.execute(mockClient, context, {});

    expect(result.raw.success).toBe(false);
    expect(result.raw.error).toBe("Invalid identity configuration format");
    expect(result.humanMessage).toContain("valid identity configuration format");
    expect(result.humanMessage).toContain("pnpm create-identity");
  });

  it("should resolve relative paths correctly", async () => {
    process.env.HEDERA_NETWORK = "local";
    await createIdentity({ networkTier: "local", outputPath: testConfigPath });

    const relativePath = relative(process.cwd(), testConfigPath);
    process.env.AGENT_IDENTITY_CONFIG_PATH = relativePath;

    const tool = buildTool();
    const result = await tool.execute(mockClient, context, {});

    expect(result.raw.success).toBe(true);
    expect(result.humanMessage).toBe("Your agent identity is ready.");
    expect(result.raw.path).toBe(resolve(testConfigPath));
  });

  it("should return guidance when path points to a directory", async () => {
    process.env.AGENT_IDENTITY_CONFIG_PATH = tmpdir();

    const tool = buildTool();
    const result = await tool.execute(mockClient, context, {});

    expect(result.raw.success).toBe(false);
    expect(result.raw.error).toBe("Path is not a file");
    expect(result.humanMessage).toContain("not a file");
    expect(result.humanMessage).toContain("pnpm create-identity");
  });
});
