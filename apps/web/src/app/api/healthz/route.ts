/**
 * GET /api/healthz — health check endpoint (issue #634)
 *
 * Reports the app's liveness and the connectivity of the configured
 * Stellar Horizon server so load balancers / orchestrators can route
 * traffic away from unhealthy instances.
 *
 * # Behavior
 * - App is up **and** Horizon is reachable  → `200` `{ "status": "ok" }`
 * - Horizon is unreachable / down          → `503` `{ "status": "unhealthy" }`
 *
 * Horizon is probed via its root endpoint (`GET {horizon_url}/`), which
 * answers with `{ "horizon_version": ..., "core_version": ... }` when
 * healthy. The Horizon URL is taken from `NEXT_PUBLIC_STELLAR_HORIZON_URL`
 * or the network default for `NEXT_PUBLIC_STELLAR_NETWORK`.
 *
 * # Liveness probe
 * `GET /api/healthz?check=app` skips the Horizon probe and always returns
 * `200` while the app process is running — useful for Kubernetes-style
 * liveness probes that must not depend on external services. Use the
 * plain `/healthz` (no query) as the readiness probe.
 *
 * # Caching
 * Responses carry `Cache-Control: no-store` so probes always observe the
 * current state of the app and its dependencies.
 *
 * @example
 * ```bash
 * curl -i /api/healthz          # readiness — 200 or 503
 * curl -i /api/healthz?check=app # liveness  — always 200 while up
 * ```
 */

import { NextRequest, NextResponse } from "next/server";
import { checkHorizon, resolveHorizonUrl } from "@/lib/horizon-health";

// Route handlers are cached by default; health probes must always run.
export const dynamic = "force-dynamic";

// Never cache health responses — probes must see fresh state.
const NO_STORE_HEADERS: Record<string, string> = { "Cache-Control": "no-store" };

interface CheckResult {
  status: "ok" | "down";
  [key: string]: unknown;
}

function okResponse(checks: Record<string, CheckResult>): NextResponse {
  return NextResponse.json(
    {
      status: "ok",
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: 200, headers: NO_STORE_HEADERS }
  );
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Liveness-only probe: the app process is serving requests.
  if (req.nextUrl.searchParams.get("check") === "app") {
    return okResponse({ app: { status: "ok" } });
  }

  // Readiness probe: verify Horizon connectivity.
  const url = resolveHorizonUrl();
  const horizon = await checkHorizon(url);

  const horizonCheck: CheckResult = {
    status: horizon.reachable ? "ok" : "down",
    url: horizon.url,
    ...(horizon.latencyMs !== null ? { latencyMs: horizon.latencyMs } : {}),
    ...(horizon.version !== null ? { version: horizon.version } : {}),
    ...(horizon.error !== null ? { error: horizon.error } : {}),
  };

  if (horizon.reachable) {
    return okResponse({ app: { status: "ok" }, horizon: horizonCheck });
  }

  return NextResponse.json(
    {
      status: "unhealthy",
      checks: { app: { status: "ok" }, horizon: horizonCheck },
      timestamp: new Date().toISOString(),
    },
    { status: 503, headers: NO_STORE_HEADERS }
  );
}
