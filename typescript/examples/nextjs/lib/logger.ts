import { redactError, redactValue } from "@/lib/redaction";

type LogLevel = "info" | "warn" | "error";

function write(level: LogLevel, message: string, detail?: unknown): void {
  const timestamp = new Date().toISOString();
  const payload =
    detail === undefined
      ? ""
      : ` ${JSON.stringify(redactValue(detail), (_key, value) =>
          value instanceof Error ? redactError(value) : value
        )}`;

  console[level](`[nextjs-example] ${timestamp} ${message}${payload}`);
}

export const logger = {
  info(message: string, detail?: unknown): void {
    write("info", message, detail);
  },
  warn(message: string, detail?: unknown): void {
    write("warn", message, detail);
  },
  error(message: string, detail?: unknown): void {
    write("error", message, detail);
  },
};
