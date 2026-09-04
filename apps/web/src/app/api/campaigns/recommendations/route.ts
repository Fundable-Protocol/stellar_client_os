import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPersonalizedCampaignRecommendationService } from "@/services/personalized-campaign-recommendation.service";

const QuerySchema = z.object({
  address: z.string().trim().min(1),
  network: z.enum(["testnet", "mainnet"]).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  includeNonActive: z.enum(["true", "false"]).optional().transform((value) => value === "true"),
  followedCreators: z.string().optional(),
});

/** GET /api/campaigns/recommendations?address=G...&followedCreators=G...,G... */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const parsed = QuerySchema.safeParse({ address: params.get("address") ?? undefined, network: params.get("network") ?? undefined, limit: params.get("limit") ?? undefined, includeNonActive: params.get("includeNonActive") ?? undefined, followedCreators: params.get("followedCreators") ?? undefined });
  if (!parsed.success) return NextResponse.json({ error: "Invalid query parameters", details: parsed.error.flatten() }, { status: 400 });
  try {
    const result = await getPersonalizedCampaignRecommendationService().getRecommendations(parsed.data.address, {
      network: parsed.data.network,
      limit: parsed.data.limit,
      includeNonActive: parsed.data.includeNonActive,
      followedCreators: parsed.data.followedCreators?.split(",").map((creator) => creator.trim()).filter(Boolean),
    });
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message || "Failed to generate campaign recommendations" }, { status: 500 });
  }
}