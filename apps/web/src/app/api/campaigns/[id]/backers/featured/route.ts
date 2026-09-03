import { NextRequest, NextResponse } from "next/server";
import { backersService } from "@/services/campaign-backers.service";
import { MAX_FEATURED_BACKERS } from "@/types/campaign-backers";

/**
 * Creator featuring for the top backers leaderboard.
 *
 *  POST   /api/campaigns/:id/backers/featured   feature a backer (creator only)
 *  DELETE /api/campaigns/:id/backers/featured   remove a feature (creator only)
 *
 * Featuring is rejected when the backer is anonymous/private or has opted out
 * of being featured, and is capped at MAX_FEATURED_BACKERS per campaign.
 */

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" } as const;

interface FeatureBody {
  backerAddress?: string;
  featuredBy?: string;
  campaignCreator?: string;
  note?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: FeatureBody = {};
  try {
    body = (await request.json()) as FeatureBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: NO_STORE });
  }

  if (!body.backerAddress?.trim()) {
    return NextResponse.json({ error: "backerAddress is required" }, { status: 400, headers: NO_STORE });
  }
  if (!body.featuredBy?.trim()) {
    return NextResponse.json({ error: "featuredBy is required" }, { status: 400, headers: NO_STORE });
  }

  const result = backersService.featureBacker({
    campaignId: id,
    backerAddress: body.backerAddress,
    featuredBy: body.featuredBy,
    campaignCreator: body.campaignCreator,
    note: body.note,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 403, headers: NO_STORE });
  }

  return NextResponse.json(
    { success: true, featured: result.value, max: MAX_FEATURED_BACKERS },
    { status: 201, headers: NO_STORE },
  );
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: FeatureBody = {};
  try {
    body = (await request.json()) as FeatureBody;
  } catch {
    // DELETE requests often omit the body — fall back to the query string.
    const url = new URL(request.url);
    body = {
      backerAddress: url.searchParams.get("backerAddress") ?? undefined,
      featuredBy: url.searchParams.get("featuredBy") ?? undefined,
      campaignCreator: url.searchParams.get("campaignCreator") ?? undefined,
    };
  }

  if (!body.backerAddress?.trim()) {
    return NextResponse.json({ error: "backerAddress is required" }, { status: 400, headers: NO_STORE });
  }
  if (!body.featuredBy?.trim()) {
    return NextResponse.json({ error: "featuredBy is required" }, { status: 400, headers: NO_STORE });
  }

  const result = backersService.unfeatureBacker({
    campaignId: id,
    backerAddress: body.backerAddress,
    featuredBy: body.featuredBy,
    campaignCreator: body.campaignCreator,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 403, headers: NO_STORE });
  }

  return NextResponse.json({ success: true, ...result.value }, { headers: NO_STORE });
}
