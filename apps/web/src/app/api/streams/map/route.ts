import { NextRequest, NextResponse } from "next/server";
import { getGeoCache, type BoundingBox, type RadiusQuery } from "@/lib/geo-cache";
import { withRateLimit } from "@/middlewares/rate-limit.middleware";

/**
 * GET /api/streams/map
 *
 * Returns stream locations for the public map view. Supports two query modes:
 *
 * ## Bounding-box mode (default)
 * Returns all streams within a viewport rectangle. Cached for 30 s.
 * | Param    | Type   | Required | Description                    |
 * |----------|--------|----------|--------------------------------|
 * | swLat    | number | ✓        | South-west latitude            |
 * | swLng    | number | ✓        | South-west longitude           |
 * | neLat    | number | ✓        | North-east latitude            |
 * | neLng    | number | ✓        | North-east longitude           |
 *
 * ## Radius mode
 * Returns streams within `radius` km of a centre point. Cached for 60 s.
 * | Param    | Type   | Required | Description                    |
 * |----------|--------|----------|--------------------------------|
 * | lat      | number | ✓        | Centre latitude                |
 * | lng      | number | ✓        | Centre longitude               |
 * | radius   | number | ✓        | Search radius in km (max 500)  |
 *
 * ## Common optional filters
 * | Param    | Type   | Description                              |
 * |----------|--------|------------------------------------------|
 * | status   | string | "active" | "completed" | "cancelled" | "paused" |
 * | token    | string | Filter by token ticker (e.g. "USDC")     |
 * | category | string | Filter by category tag                   |
 *
 * ## Response headers
 * `X-Cache: HIT | MISS` indicates whether data came from Redis.
 * `Cache-Control: public, max-age=30` for CDN edge caching.
 *
 * @example
 * ```
 * GET /api/streams/map?swLat=-1&swLng=30&neLat=5&neLng=36&status=active
 * GET /api/streams/map?lat=6.5&lng=3.3&radius=50&token=USDC
 * ```
 */
async function handler(req: NextRequest): Promise<NextResponse> {
  const p = req.nextUrl.searchParams;

  // Extract optional filters
  const filters: Record<string, string> = {};
  for (const key of ["status", "token", "category"]) {
    const val = p.get(key);
    if (val) filters[key] = val;
  }

  const cache = getGeoCache();

  // ── Radius mode ─────────────────────────────────────────────────────────
  if (p.has("lat") && p.has("lng") && p.has("radius")) {
    const lat = parseFloat(p.get("lat")!);
    const lng = parseFloat(p.get("lng")!);
    const radiusKm = parseFloat(p.get("radius")!);

    if (!isFinite(lat) || !isFinite(lng) || !isFinite(radiusKm)) {
      return NextResponse.json(
        { error: "lat, lng and radius must be valid numbers", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }
    if (lat < -90 || lat > 90) {
      return NextResponse.json({ error: "lat must be between -90 and 90", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    if (lng < -180 || lng > 180) {
      return NextResponse.json({ error: "lng must be between -180 and 180", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    if (radiusKm <= 0 || radiusKm > 500) {
      return NextResponse.json(
        { error: "radius must be between 0 and 500 km", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const query: RadiusQuery = { lat, lng, radiusKm };
    const cached = await cache.getRadiusStreams(query, filters);

    if (cached !== null) {
      return NextResponse.json(
        { streams: cached, count: cached.length },
        {
          status: 200,
          headers: {
            "X-Cache": "HIT",
            "Cache-Control": "public, max-age=60",
          },
        }
      );
    }

    // Cache miss — fetch from data source
    const streams = await fetchRadiusStreams(query, filters);
    await cache.setRadiusStreams(query, streams, filters);

    return NextResponse.json(
      { streams, count: streams.length },
      {
        status: 200,
        headers: {
          "X-Cache": "MISS",
          "Cache-Control": "public, max-age=60",
        },
      }
    );
  }

  // ── Bounding-box mode ────────────────────────────────────────────────────
  const swLat = parseFloat(p.get("swLat") ?? "");
  const swLng = parseFloat(p.get("swLng") ?? "");
  const neLat = parseFloat(p.get("neLat") ?? "");
  const neLng = parseFloat(p.get("neLng") ?? "");

  if (!isFinite(swLat) || !isFinite(swLng) || !isFinite(neLat) || !isFinite(neLng)) {
    return NextResponse.json(
      {
        error: "Missing or invalid bounding-box params: swLat, swLng, neLat, neLng",
        code: "VALIDATION_ERROR",
      },
      { status: 400 }
    );
  }

  if (swLat >= neLat || swLng >= neLng) {
    return NextResponse.json(
      { error: "swLat/swLng must be less than neLat/neLng", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  const bbox: BoundingBox = { swLat, swLng, neLat, neLng };
  const cached = await cache.getBboxStreams(bbox, filters);

  if (cached !== null) {
    return NextResponse.json(
      { streams: cached, count: cached.length },
      {
        status: 200,
        headers: {
          "X-Cache": "HIT",
          "Cache-Control": "public, max-age=30",
        },
      }
    );
  }

  // Cache miss — fetch from data source
  const streams = await fetchBboxStreams(bbox, filters);
  await cache.setBboxStreams(bbox, streams, filters);

  return NextResponse.json(
    { streams, count: streams.length },
    {
      status: 200,
      headers: {
        "X-Cache": "MISS",
        "Cache-Control": "public, max-age=30",
      },
    }
  );
}

export const GET = withRateLimit(handler, {
  limit: 120,
  windowMs: 60_000,
  keyPrefix: "rl:map",
});

// ── Data source stubs ─────────────────────────────────────────────────────────
// Replace these with real Stellar contract event queries / PostgreSQL
// spatial queries in production.

async function fetchBboxStreams(
  bbox: BoundingBox,
  filters: Record<string, string>
) {
  // Production: query indexed stream events filtered by geo bounding box
  void bbox;
  void filters;
  return [];
}

async function fetchRadiusStreams(
  query: RadiusQuery,
  filters: Record<string, string>
) {
  // Production: query indexed stream events filtered by geo radius
  void query;
  void filters;
  return [];
}
