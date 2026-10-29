import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCampaign, getCampaignDataSource } from "@/services/campaign.service";
import {
  buildGeoRestriction,
  campaignGeoRestrictionService,
  MAX_COUNTRY_CODES,
  MIN_COUNTRY_CODES,
  normalizeCountryCode,
} from "@/services/campaign-geo-restriction.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Validation schema
// ---------------------------------------------------------------------------

const GeoRestrictionSchema = z.object({
  mode: z.enum(["allow", "block"], {
    errorMap: () => ({ message: 'mode must be "allow" or "block"' }),
  }),
  countryCodes: z
    .array(z.string())
    .min(MIN_COUNTRY_CODES, "countryCodes must contain at least one entry")
    .max(MAX_COUNTRY_CODES, `countryCodes must contain at most ${MAX_COUNTRY_CODES} entries`)
    .refine(
      (codes) => codes.every((c) => normalizeCountryCode(c) !== null),
      "All country codes must be valid ISO 3166-1 alpha-2 codes (e.g. \"US\", \"DE\")",
    ),
  reason: z.string().max(500).optional(),
  createdBy: z.string().trim().min(1, "createdBy is required"),
});

// ---------------------------------------------------------------------------
// GET /api/campaigns/[id]/geo-restriction
// Returns the current geo-restriction policy for a campaign.
// ---------------------------------------------------------------------------

/**
 * @swagger
 * /api/campaigns/{id}/geo-restriction:
 *   get:
 *     summary: Get geo-restriction settings for a campaign
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: The current geo-restriction policy (null if none).
 *       404:
 *         description: Campaign not found.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  return NextResponse.json({
    campaignId: id,
    geoRestriction: campaign.geoRestriction ?? null,
  });
}

// ---------------------------------------------------------------------------
// POST /api/campaigns/[id]/geo-restriction
// Create or replace the geo-restriction policy for a campaign.
// ---------------------------------------------------------------------------

/**
 * @swagger
 * /api/campaigns/{id}/geo-restriction:
 *   post:
 *     summary: Set or replace the geo-restriction policy for a campaign
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [mode, countryCodes, createdBy]
 *             properties:
 *               mode:
 *                 type: string
 *                 enum: [allow, block]
 *               countryCodes:
 *                 type: array
 *                 items: { type: string }
 *               reason:
 *                 type: string
 *               createdBy:
 *                 type: string
 *     responses:
 *       200:
 *         description: The stored geo-restriction.
 *       400:
 *         description: Validation error.
 *       404:
 *         description: Campaign not found.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = GeoRestrictionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid geo-restriction payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  let restriction;
  try {
    restriction = buildGeoRestriction(parsed.data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to build restriction" },
      { status: 400 },
    );
  }

  // Persist to campaign record.
  await getCampaignDataSource().saveCampaign({
    ...campaign,
    geoRestriction: restriction,
    updatedAt: Date.now(),
  });

  // Append compliance audit event.
  campaignGeoRestrictionService.updateRestriction(id, restriction);

  return NextResponse.json({ campaignId: id, geoRestriction: restriction }, { status: 200 });
}

// ---------------------------------------------------------------------------
// DELETE /api/campaigns/[id]/geo-restriction
// Remove the geo-restriction from a campaign.
// ---------------------------------------------------------------------------

const RemoveSchema = z.object({
  removedBy: z.string().trim().min(1, "removedBy is required"),
});

/**
 * @swagger
 * /api/campaigns/{id}/geo-restriction:
 *   delete:
 *     summary: Remove the geo-restriction from a campaign
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [removedBy]
 *             properties:
 *               removedBy:
 *                 type: string
 *     responses:
 *       200:
 *         description: Restriction removed.
 *       400:
 *         description: Validation error.
 *       404:
 *         description: Campaign not found.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = RemoveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Persist removal to campaign record.
  await getCampaignDataSource().saveCampaign({
    ...campaign,
    geoRestriction: null,
    updatedAt: Date.now(),
  });

  // Append compliance audit event.
  campaignGeoRestrictionService.removeRestriction(id, parsed.data.removedBy);

  return NextResponse.json({ campaignId: id, geoRestriction: null }, { status: 200 });
}
