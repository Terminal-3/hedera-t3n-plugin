import { mkdtempSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";

import { afterEach, describe, expect, it, vi } from "vitest";

const sdkMocks = vi.hoisted(() => ({
  createMlKemPublicKeyHandler: vi.fn(),
}));

vi.mock("@terminal3/t3n-sdk", () => ({
  createMlKemPublicKeyHandler: sdkMocks.createMlKemPublicKeyHandler,
}));

import {
  createConfiguredMlKemPublicKeyHandler,
  resolveMlKemPublicKeyOverride,
} from "../../src/utils/t3n-ml-kem.js";

const SAMPLE_KEY = "A".repeat(1580);
const SAMPLE_BYTES = Uint8Array.from(Buffer.from(SAMPLE_KEY, "base64"));

describe("T3N ML-KEM public key override resolution", () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
    vi.clearAllMocks();
  });

  it("prefers inline base64 override", () => {
    expect(
      resolveMlKemPublicKeyOverride({
        T3N_ML_KEM_PUBLIC_KEY: SAMPLE_KEY,
      })
    ).toBe(SAMPLE_KEY);
  });

  it("reads decryption_root_public_key from generated keys json", () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), "hedera-t3n-ml-kem-"));
    const keysPath = path.join(tempDir, "node-1-keys.json");
    writeFileSync(
      keysPath,
      JSON.stringify(
        {
          decryption_root_public_key: SAMPLE_KEY,
        },
        null,
        2
      ),
      "utf8"
    );

    expect(
      resolveMlKemPublicKeyOverride({
        T3N_ML_KEM_PUBLIC_KEY_FILE: keysPath,
      })
    ).toBe(SAMPLE_KEY);
  });

  it("accepts binary root public key files", async () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), "hedera-t3n-ml-kem-bin-"));
    const keyPath = path.join(tempDir, "root_public_key.bin");
    writeFileSync(keyPath, SAMPLE_BYTES);

    expect(
      resolveMlKemPublicKeyOverride({
        T3N_ML_KEM_PUBLIC_KEY_FILE: keyPath,
      })
    ).toBe(SAMPLE_KEY);

    const handler = createConfiguredMlKemPublicKeyHandler({
      T3N_ML_KEM_PUBLIC_KEY_FILE: keyPath,
    });
    const response = JSON.parse(new TextDecoder().decode(await handler()));
    expect(response.host_to_guest).toBe("MlKemPublicKey");
    expect(response.key).toEqual(Array.from(SAMPLE_BYTES));
  });

  it("falls back to SDK ML-KEM handler when no override is configured", () => {
    const delegatedHandler = vi.fn();
    sdkMocks.createMlKemPublicKeyHandler.mockReturnValue(delegatedHandler);

    const handler = createConfiguredMlKemPublicKeyHandler({}, "https://node.example");
    expect(handler).toBe(delegatedHandler);
    expect(sdkMocks.createMlKemPublicKeyHandler).toHaveBeenCalledTimes(1);
    expect(sdkMocks.createMlKemPublicKeyHandler).toHaveBeenCalledWith("https://node.example");
  });
});
