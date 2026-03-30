import { readFileSync } from "fs";

import {
  createMlKemPublicKeyHandler,
  type GuestToHostHandler,
} from "@terminal3/t3n-sdk";

import {
  getT3nMlKemPublicKeyFileOverride,
  getT3nMlKemPublicKeyOverride,
} from "./env.js";

const MIN_ML_KEM_PUBLIC_KEY_BASE64_LENGTH = 1000;
const BASE64_VALUE_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

function normalizeMlKemPublicKey(value: string, source: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error(`${source} is empty`);
  }
  if (
    normalized.length < MIN_ML_KEM_PUBLIC_KEY_BASE64_LENGTH ||
    !BASE64_VALUE_PATTERN.test(normalized)
  ) {
    throw new Error(`${source} must contain a base64-encoded ML-KEM public key`);
  }
  return normalized;
}

export function readMlKemPublicKeyFromFile(filePath: string): string {
  const raw = readFileSync(filePath);
  const utf8 = raw.toString("utf8").trim();

  if (utf8.length > 0) {
    try {
      const parsed = JSON.parse(utf8) as {
        decryption_root_public_key?: unknown;
      };
      if (typeof parsed.decryption_root_public_key === "string") {
        return normalizeMlKemPublicKey(
          parsed.decryption_root_public_key,
          `T3N_ML_KEM_PUBLIC_KEY_FILE (${filePath})`
        );
      }
    } catch {
      // Non-JSON files are supported below.
    }

    if (
      utf8.length >= MIN_ML_KEM_PUBLIC_KEY_BASE64_LENGTH &&
      BASE64_VALUE_PATTERN.test(utf8)
    ) {
      return normalizeMlKemPublicKey(
        utf8,
        `T3N_ML_KEM_PUBLIC_KEY_FILE (${filePath})`
      );
    }
  }

  return normalizeMlKemPublicKey(
    raw.toString("base64"),
    `T3N_ML_KEM_PUBLIC_KEY_FILE (${filePath})`
  );
}

export function resolveMlKemPublicKeyOverride(
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  const inlineOverride = getT3nMlKemPublicKeyOverride(env);
  if (inlineOverride) {
    return normalizeMlKemPublicKey(inlineOverride, "T3N_ML_KEM_PUBLIC_KEY");
  }

  const fileOverride = getT3nMlKemPublicKeyFileOverride(env);
  if (fileOverride) {
    return readMlKemPublicKeyFromFile(fileOverride);
  }

  return undefined;
}

export function createConfiguredMlKemPublicKeyHandler(
  env: NodeJS.ProcessEnv = process.env
): GuestToHostHandler {
  const override = resolveMlKemPublicKeyOverride(env);
  if (!override) {
    return createMlKemPublicKeyHandler();
  }

  const keyBytes = Uint8Array.from(Buffer.from(override, "base64"));
  const responseBytes = new TextEncoder().encode(
    JSON.stringify({
      host_to_guest: "MlKemPublicKey",
      key: Array.from(keyBytes),
    })
  );

  return (): Promise<Uint8Array> => Promise.resolve(new Uint8Array(responseBytes));
}
