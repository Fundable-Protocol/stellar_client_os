import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizeAdminRequest } from "@/lib/admin-auth";
import {
  MAX_ANALYTICS_WINDOW_DAYS,
  getAdminCampaignAnalyticsService,
} from "@/services/admin-campaign-analytics.service";
import {
  MAX_SECONDARY_MARKET_WINDOW_DAYS,
  getCampaignCarbonCreditTradingService,
} from "@/services/campaign-carbon-credit-trading.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEFAULT_STREAM_INTERVAL_SECONDS = 15;

/**
 * GET /api/admin/campaign-analytics — Admin campaign analytics dashboard (issue #928).
 *
 * Platform-wide metrics: active campaigns, total trees planted, total CO2
 * sequestered, sponsor growth, campaign completion rate, and revenue.
 * Requires `Authorization: Bearer <ADMIN_API_KEY>`.
 *
 * # Query parameters
 *   - network         — Soroban network (testnet | mainnet), default `testnet`.
 *   - windowDays      — window for sponsor growth and windowed revenue (1–365), default 30.
 *   - stream          — `1`/`true` streams snapshots as Server-Sent Events instead of
 *                       returning one JSON snapshot.
 *   - intervalSeconds — seconds between streamed snapshots (5–300), default 15.
 *
 * # Streaming
 * The stream sends an `analytics` event with a fresh snapshot immediately and
 * then every `intervalSeconds`, and an `error` event if a refresh fails (the
 * stream stays open and retries on the next tick). `EventSource` cannot send an
 * `Authorization` header, so admin clients read the stream with `fetch` and
 * the response body reader.
 */
const QuerySchema = z.object({
  network: z.enum(["testnet", "mainnet"]).optional(),
  windowDays: z.coerce.number().int().min(1).max(MAX_ANALYTICS_WINDOW_DAYS).optional(),
  stream: z.enum(["1", "true", "0", "false"]).optional(),
  intervalSeconds: z.coerce.number().int().min(5).max(300).optional(),
  market: z.enum(["1", "true", "0", "false"]).optional(),
  marketWindowDays: z.coerce.number().int().min(1).max(MAX_SECONDARY_MARKET_WINDOW_DAYS).optional(),
  sponsorId: z.string().min(1).max(128).optional(),
});

const NO_STORE = "private, no-store, max-age=0";

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(request: NextRequest) {
  const unauthorized = authorizeAdminRequest(request);
  if (unauthorized) return unauthorized;

  const searchParams = new URL(request.url).searchParams;
  const parsed = QuerySchema.safeParse({
    network: searchParams.get("network") ?? undefined,
    windowDays: searchParams.get("windowDays") ?? undefined,
    stream: searchParams.get("stream") ?? undefined,
    intervalSeconds: searchParams.get("intervalSeconds") ?? undefined,
    market: searchParams.get("market") ?? undefined,
    marketWindowDays: searchParams.get("marketWindowDays") ?? undefined,
    sponsorId: searchParams.get("sponsorId") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { stream, intervalSeconds, market, marketWindowDays, sponsorId, ...query } = parsed.data;
  const service = getAdminCampaignAnalyticsService();

  if (market === "1" || market === "true") {
    try {
      const tradingService = getCampaignCarbonCreditTradingService();
      const data = await tradingService.getSecondaryMarketSnapshot({
        network: query.network,
        windowDays: marketWindowDays ?? query.windowDays,
        sponsorId,
      });
      return NextResponse.json({ data }, { headers: { "Cache-Control": NO_STORE } });
    } catch (error: unknown) {
      console.error("Failed to compute secondary market analytics", error instanceof Error ? error.message : error);
      return NextResponse.json(
        { error: "Failed to compute secondary market analytics" },
        { status: 500, headers: { "Cache-Control": NO_STORE } },
      );
    }
  }

  if (stream !== "1" && stream !== "true") {
    try {
      const data = await service.getSnapshot(query);
      return NextResponse.json({ data }, { headers: { "Cache-Control": NO_STORE } });
    } catch (error: unknown) {
      console.error("Failed to compute admin campaign analytics", error instanceof Error ? error.message : error);
      return NextResponse.json(
        { error: "Failed to compute campaign analytics" },
        { status: 500, headers: { "Cache-Control": NO_STORE } },
      );
    }
  }

  const encoder = new TextEncoder();
  const intervalMs = (intervalSeconds ?? DEFAULT_STREAM_INTERVAL_SECONDS) * 1000;
  let timer: ReturnType<typeof setInterval> | undefined;
  let closed = false;

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        try {
          controller.close();
        } catch {
          // Already closed by the runtime.
        }
      };

      const push = async () => {
        let chunk: string;
        try {
          chunk = sseEvent("analytics", await service.getSnapshot(query));
        } catch (error: unknown) {
          console.error("Failed to refresh admin campaign analytics", error instanceof Error ? error.message : error);
          chunk = sseEvent("error", { error: "Failed to compute campaign analytics" });
        }
        if (!closed) controller.enqueue(encoder.encode(chunk));
      };

      request.signal.addEventListener("abort", close);
      controller.enqueue(encoder.encode(`retry: ${intervalMs}\n\n`));
      void push();
      timer = setInterval(() => void push(), intervalMs);
    },
    cancel() {
      closed = true;
      clearInterval(timer);
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": `${NO_STORE}, no-transform`,
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
