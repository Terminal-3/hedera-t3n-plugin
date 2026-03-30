const REDACTED = "[redacted]";

const SENSITIVE_KEYS = new Set([
  "private_key",
  "privateKey",
  "agent_card_path",
  "path",
  "identityPath",
  "AGENT_IDENTITY_CONFIG_PATH",
  "PINATA_API_KEY",
  "PINATA_API_SECRET",
  "PINATA_JWT",
  "HEDERA_PRIVATE_KEY",
]);

function looksLikeAbsolutePath(value: string): boolean {
  return value.startsWith("/") || /^[A-Za-z]:\\/.test(value);
}

export function redactString(value: string): string {
  if (looksLikeAbsolutePath(value)) {
    return REDACTED;
  }

  return value
    .replace(
      /((?:private[_ ]?key|HEDERA_PRIVATE_KEY)\s*[:=]\s*)0x[a-fA-F0-9]{64}/gi,
      `$1${REDACTED}`
    )
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, `Bearer ${REDACTED}`);
}

export function redactValue(value: unknown, key?: string): unknown {
  if (key && SENSITIVE_KEYS.has(key)) {
    return REDACTED;
  }

  if (typeof value === "string") {
    return redactString(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        redactValue(entryValue, entryKey),
      ])
    );
  }

  return value;
}

export function redactError(error: unknown): string {
  if (error instanceof Error) {
    return redactString(error.message);
  }

  return redactString(String(error));
}
