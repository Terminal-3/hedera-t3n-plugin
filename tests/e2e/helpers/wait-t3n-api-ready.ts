/**
 * E2E-only: poll T3N node `/healthz` until ready (or timeout).
 * Kept out of production registration paths so core behavior matches all environments.
 */

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_POLL_MS = 750;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForT3nApiReady(
  baseUrl: string,
  options: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? DEFAULT_POLL_MS;
  const deadline = Date.now() + timeoutMs;
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const healthUrl = `${normalizedBase}/healthz`;
  let lastStatus = 0;
  let lastBody = "";

  while (Date.now() <= deadline) {
    const controller = new AbortController();
    const probeTimeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(healthUrl, {
        method: "GET",
        signal: controller.signal,
      });
      lastStatus = response.status;
      lastBody = (await response.text()).trim();
      if (response.ok) {
        return;
      }
    } catch (error) {
      lastBody = error instanceof Error ? error.message : String(error);
    } finally {
      clearTimeout(probeTimeout);
    }
    await sleep(intervalMs + Math.floor(Math.random() * 250));
  }

  throw new Error(
    `T3N API not ready after ${timeoutMs}ms (${healthUrl}, last HTTP ${lastStatus}): ${lastBody.slice(0, 500)}`
  );
}
