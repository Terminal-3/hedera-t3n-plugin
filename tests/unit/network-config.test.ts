import { mkdtempSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";

import { afterEach, describe, expect, it } from "vitest";

import { loadPluginNetworkConfig } from "../../src/utils/network-config.js";
import {
  resolveT3nBaseUrl,
  resolveT3nRuntimeApiUrl,
} from "../../src/utils/t3n.js";

describe("plugin network config loading", () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("merges cwd overrides onto packaged defaults", async () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), "hedera-t3n-plugin-config-"));
    writeFileSync(
      path.join(tempDir, "config.staging.json"),
      JSON.stringify(
        {
          t3nRuntimeApiPath: "/rpc",
          hederaChainId: 999,
        },
        null,
        2
      ),
      "utf8"
    );

    const config = await loadPluginNetworkConfig("config.staging.json", {
      cwd: tempDir,
    });

    expect(config.t3nApiUrl).toBe("https://cn-api.sg.staging.t3n.terminal3.io");
    expect(config.t3nRuntimeApiPath).toBe("/rpc");
    expect(config.hederaJsonRpcUrl).toBe("https://testnet.hashio.io/api");
    expect(config.hederaChainId).toBe(999);
  });

  it("uses the requested network tier for T3N URLs even when ambient env disagrees", async () => {
    const env = { HEDERA_NETWORK: "testnet" } as NodeJS.ProcessEnv;

    await expect(resolveT3nBaseUrl("mainnet", { env })).resolves.toBe(
      "https://cn-api.sg.prod.t3n.terminal3.io"
    );
    await expect(resolveT3nRuntimeApiUrl("mainnet", { env })).resolves.toBe(
      "https://cn-api.sg.prod.t3n.terminal3.io/api/rpc"
    );
  });

  it("preserves env-based RPC resolution when no explicit network tier is provided", async () => {
    await expect(
      resolveT3nRuntimeApiUrl({
        env: { HEDERA_NETWORK: "testnet" },
      })
    ).resolves.toBe("https://cn-api.sg.staging.t3n.terminal3.io/api/rpc");
  });

  it("uses packaged local config defaults for local CCF endpoints", async () => {
    const env = {} as NodeJS.ProcessEnv;
    await expect(resolveT3nBaseUrl("local", { env })).resolves.toBe("http://127.0.0.1:3000");
    await expect(resolveT3nRuntimeApiUrl("local", { env })).resolves.toBe(
      "http://127.0.0.1:3000/api/rpc"
    );
  });

  it("lets explicit runtime API env override win over packaged config", async () => {
    const env = {
      HEDERA_NETWORK: "local",
      T3N_API_URL: "http://localhost:3100",
      T3N_RUNTIME_API_URL: "http://localhost:3100/runtime",
    } as NodeJS.ProcessEnv;

    await expect(resolveT3nBaseUrl("testnet", { env })).resolves.toBe(
      "http://localhost:3100"
    );
    await expect(resolveT3nRuntimeApiUrl("testnet", { env })).resolves.toBe(
      "http://localhost:3100/runtime"
    );
  });

  it("derives runtime API URL from explicit T3N_API_URL when runtime override is unset", async () => {
    const env = {
      HEDERA_NETWORK: "local",
      T3N_API_URL: "http://localhost:3100",
    } as NodeJS.ProcessEnv;

    await expect(resolveT3nRuntimeApiUrl("testnet", { env })).resolves.toBe(
      "http://localhost:3100/api/rpc"
    );
    await expect(resolveT3nRuntimeApiUrl({ env })).resolves.toBe(
      "http://localhost:3100/api/rpc"
    );
  });

  it("loads config-level runtime path value", async () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), "hedera-t3n-plugin-config-"));
    writeFileSync(
      path.join(tempDir, "config.staging.json"),
      JSON.stringify(
        {
          t3nApiUrl: "http://127.0.0.1:4000",
          t3nRuntimeApiPath: "/api/rpc",
        },
        null,
        2
      ),
      "utf8"
    );

    const config = await loadPluginNetworkConfig("config.staging.json", {
      cwd: tempDir,
    });

    expect(config.t3nApiUrl).toBe("http://127.0.0.1:4000");
    expect(config.t3nRuntimeApiPath).toBe("/api/rpc");
  });

});
