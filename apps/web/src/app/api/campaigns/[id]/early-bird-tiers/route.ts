import { NextRequest, NextResponse } from "next/server";
import { EarlyBirdTierService } from "@/services/early-bird-tier.service";
import type { CreateEarlyBirdTierInput } from "@/types/early-bird-tier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const service = new EarlyBirdTierService();

/**
 * GET /api/campaigns/[id]/early-bird-tiers
 *
 * Returns all early-bird tiers for the campaign, with live status and
 * countdown info hydrated so the client can render countdown clocks without
 * additional requests.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const { id: campaignId } = params;
  const now = Date.now();

  try {
    const tiers = await service.getTiers(campaignId, now);
    const data = tiers.map((tier) => ({
      ...tier,
      countdown: service.getCountdownInfo(tier, now),
    }));
    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? "Failed to retrieve early-bird tiers" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/campaigns/[id]/early-bird-tiers
 *
 * Creates a new early-bird tier for the campaign.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const { id: campaignId } = params;
  const now = Date.now();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { creatorAddress, ...input } = body as { creatorAddress: string } & CreateEarlyBirdTierInput;

  if (!creatorAddress) {
    return NextResponse.json({ error: "creatorAddress is required" }, { status: 400 });
  }

  try {
    const tier = await service.createTier(campaignId, creatorAddress, input, now);
    return NextResponse.json({ data: tier }, { status: 201 });
  } catch (err) {
    const message = (err as Error).message ?? "Failed to create early-bird tier";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}