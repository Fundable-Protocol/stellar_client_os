import { NextRequest, NextResponse } from "next/server";
import { getCampaign } from "@/services/campaign.service";
import {
  campaignGeoRestrictionService,
  normalizeCountryCode,
} from "@/services/campaign-geo-restriction.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Derive the visitor's country from the request.
 *
 * Resolution order:
 *  1. `?country=XX` query-string param  (explicit override, useful in tests)
 *  2. `CF-IPCountry` header            (Cloudflare CDN)
 *  3. `X-Vercel-IP-Country` header     (Vercel edge)
 *  4. `X-Country-Code` header          (custom reverse-proxy header)
 *  5. `"UNKNOWN"`                      (fallback)
 */
function resolveVisitorCountry(request: NextRequest): string {
  const queryParam = new URL(request.url).searchParams.get("country");
  if (queryParam) {
    const normalized = normalizeCountryCode(queryParam);
    if (normalized) return normalized;
  }

  const candidates = [
    request.headers.get("CF-IPCountry"),
    request.headers.get("X-Vercel-IP-Country"),
    request.headers.get("X-Country-Code"),
  ];

  for (const raw of candidates) {
    if (raw) {
      const normalized = normalizeCountryCode(raw);
      if (normalized) return normalized;
    }
  }

  return "UNKNOWN";
}

/**
 * Build a lightweight metadata record from safe, non-PII request attributes
 * for compliance audit logging.
 */
function buildAuditMetadata(request: NextRequest): Record<string, string> {
  const meta: Record<string, string> = {};
  // Include request ID if the reverse proxy forwards one.
  const requestId = request.headers.get("X-Request-Id");
  if (requestId) meta["requestId"] = requestId;
  // Store only the first two octets of the IP for approximate location
  // without storing PII. E.g. "198.51.x.x" → "198.51"
  const ip = request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim();
  if (ip) {
    const parts = ip.split(".");
    if (parts.length >= 2) {
      meta["ipPrefix"] = `${parts[0]}.${parts[1]}.x.x`;
    }
  }
  return meta;
}

// ---------------------------------------------------------------------------
// GET /api/campaigns/[id]/geo-restriction/check
//
// Evaluate whether the current visitor is eligible to view/back the campaign.
// Appends an audit log entry for compliance purposes.
//
// Response (200):
// {
//   "allowed": true,
//   "countryCode": "US",
//   "restriction": { ... } | null
// }
//
// Response (200, blocked):
// {
//   "allowed": false,
//   "countryCode": "KP",
//   "blockedMessage": "This campaign is not available in your region …",
//   "restriction": { ... }
// }
//
// Response (404): Campaign not found.
// ---------------------------------------------------------------------------

/**
 * @swagger
 * /api/campaigns/{id}/geo-restriction/check:
 *   get:
 *     summary: Check whether the current visitor is eligible for the campaign
 *     description: >
 *       Derives the visitor's country from CDN / reverse-proxy headers and
 *       evaluates it against the campaign's geo-restriction policy.
 *       Every check is appended to the platform's compliance audit log.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: country
 *         required: false
 *         schema: { type: string }
 *         description: Explicit ISO 3166-1 alpha-2 country override (for testing).
 *     responses:
 *       200:
 *         description: Eligibility result. `allowed` may be true or false.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 allowed: { type: boolean }
 *                 countryCode: { type: string }
 *                 blockedMessage: { type: string }
 *                 restriction:
 *                   oneOf:
 *                     - $ref: '#/components/schemas/GeoRestriction'
 *                     - type: 'null'
 *       404:
 *         description: Campaign not found.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const visitorCountry = resolveVisitorCountry(request);
  const metadata = buildAuditMetadata(request);

  const result = campaignGeoRestrictionService.checkAndLog(
    id,
    campaign.geoRestriction ?? null,
    visitorCountry,
    Object.keys(metadata).length > 0 ? metadata : undefined,
  );

  // Always return 200 — the client decides how to handle `allowed: false`.
  // Returning 403 would make it easy for scrapers to enumerate restricted
  // campaigns; 200 keeps the gate semantics consistent.
  return NextResponse.json(result, { status: 200 });
}
