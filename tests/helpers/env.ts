/**
 * Purpose: Test helper for capturing and restoring environment variables
 * Scope:   Snapshot and restore process.env values for test isolation
 * Inputs:  Environment variable keys to capture
 * Outputs: Environment snapshots for restoration
 */

export type EnvSnapshot = Record<string, string | undefined>;

export function captureEnv(keys: string[]): EnvSnapshot {
  return keys.reduce<EnvSnapshot>((snapshot, key) => {
    snapshot[key] = process.env[key];
    return snapshot;
  }, {});
}

export function restoreEnv(snapshot: EnvSnapshot): void {
  Object.entries(snapshot).forEach(([key, value]) => {
    if (value === undefined) {
      delete process.env[key];
      return;
    }
    process.env[key] = value;
  });
}
