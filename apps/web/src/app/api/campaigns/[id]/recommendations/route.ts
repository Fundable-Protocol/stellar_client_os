import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCampaignRecommendationService } from "@/services/campaign-recommendation.service";

const QuerySchema = z.object({
  network: z.enum(["testnet", "mainnet"]).optional(),
  limit: z.coerce.number().int().min(1).max(5).optional(),
  includeNonActive: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
});

/**
 * GET /api/campaigns/:id/recommendations
 *
 * Returns up to five active campaigns related to the viewed campaign. The
 * response is suitable for rendering a campaign detail page's “You might
 * like” section.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id?.trim()) {
      return NextResponse.json({ error: "Campaign id is required" }, { status: 400 });
    }

    const parsed = QuerySchema.safeParse({
      network: request.nextUrl.searchParams.get("network") ?? undefined,
      limit: request.nextUrl.searchParams.get("limit") ?? undefined,
      includeNonActive:
        request.nextUrl.searchParams.get("includeNonActive") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await getCampaignRecommendationService().getRecommendations(id, {
      network: parsed.data.network,
      limit: parsed.data.limit,
      includeNonActive: parsed.data.includeNonActive,
    });
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message.endsWith("not found") ? 404 : 500;
    return NextResponse.json(
      { error: message || "Failed to load campaign recommendations" },
      { status }
    );
  }
}
