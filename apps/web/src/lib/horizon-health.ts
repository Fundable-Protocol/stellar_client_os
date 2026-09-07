/**
 * Horizon connectivity checks for the `/healthz` endpoint (issue #634).
 *
 * Kept free of `next/server` imports so the logic can be unit-tested
 * directly and reused outside route handlers.
 */

export const DEFAULT_HORIZON_MAINNET = "https://horizon.stellar.org";
export const DEFAULT_HORIZON_TESTNET = "https://horizon-testnet.stellar.org";

/** Default timeout for a single Horizon connectivity probe. */
export const DEFAULT_HORIZON_TIMEOUT_MS = 5_000;

/**
 * Result of a single Horizon connectivity probe.
 */
export interface HorizonHealthResult {
  /** Whether Horizon answered the probe successfully (HTTP 2xx). */
  reachable: boolean;
  /** The Horizon base URL that was probed. */
  url: string;
  /** Round-trip time of the probe in ms, or `null` when it failed. */
  latencyMs: number | null;
  /**
   * `horizon_version` reported by the server (e.g. "2.34.0"),
   * or `null` when the server did not return a JSON body.
   */
  version: string | null;
  /** Human-readable failure reason, or `null` when reachable. */
  error: string | null;
}

/**
 * Resolve the Horizon base URL for the configured Stellar network.
 *
 * Mirrors the resolution in `@/lib/api.ts` but reads `process.env`
 * directly so the health check keeps working even when other
 * environment configuration is invalid.
 *
 * @param env - Environment variables (injectable for tests).
 */
export function resolveHorizonUrl(env: NodeJS.ProcessEnv = process.env): string {
  if (env.NEXT_PUBLIC_STELLAR_HORIZON_URL) {
    return env.NEXT_PUBLIC_STELLAR_HORIZON_URL;
  }
  return env.NEXT_PUBLIC_STELLAR_NETWORK === "mainnet"
    ? DEFAULT_HORIZON_MAINNET
    : DEFAULT_HORIZON_TESTNET;
}

/**
 * Probe whether a Horizon server is reachable.
 *
 * Hits the Horizon root endpoint (`GET {url}/`), which responds with
 * `{ "horizon_version": ..., "core_version": ... }` when healthy.
 *
 * Any HTTP 2xx response counts as reachable (the server is up); the
 * version is extracted when the body is JSON. Network failures,
 * timeouts and non-2xx responses count as unreachable.
 *
 * @param url - Horizon base URL (e.g. `https://horizon-testnet.stellar.org`).
 * @param options.timeoutMs - Probe timeout in ms (default 5s).
 * @param options.fetchImpl - Fetch implementation (injectable for tests).
 */
export async function checkHorizon(
  url: string,
  options: { timeoutMs?: number; fetchImpl?: typeof fetch } = {}
): Promise<HorizonHealthResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_HORIZON_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;
  const startedAt = Date.now();

  try {
    const res = await fetchImpl(`${url.replace(/\/+$/, "")}/`, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    const latencyMs = Date.now() - startedAt;

    if (!res.ok) {
      return {
        reachable: false,
        url,
        latencyMs,
        version: null,
        error: `Horizon responded with HTTP ${res.status}`,
      };
    }

    let version: string | null = null;
    try {
      const body: unknown = await res.json();
      if (
        typeof body === "object" &&
        body !== null &&
        typeof (body as { horizon_version?: unknown }).horizon_version === "string"
      ) {
        version = (body as { horizon_version: string }).horizon_version;
      }
    } catch {
      // Non-JSON body — an HTTP 2xx still proves the server is up.
    }

    return { reachable: true, url, latencyMs, version, error: null };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const message =
      error instanceof Error && error.name === "TimeoutError"
        ? `Horizon probe timed out after ${timeoutMs}ms`
        : error instanceof Error
          ? error.message
          : String(error);
    return { reachable: false, url, latencyMs, version: null, error: message };
  }
}
