/**
 * Purpose: Test utility for requiring environment variables with helpful error messages
 * Scope:   Validates that required env vars are set, throws descriptive errors if missing
 * Inputs:  Environment variable value, name, optional hint
 * Outputs: Validated environment variable string or throws error
 */

export function requireEnv(value: string | undefined, name: string, hint?: string): string {
  if (value) {
    return value;
  }

  const details = hint ? ` ${hint}` : "";
  throw new Error(`Missing required environment variable: ${name}.${details}`);
}
