import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getMlCampaignRecommendationService } from "@/services/ml-campaign-recommendation.service";

const QuerySchema = z.object({
  network: z.enum(["testnet", "mainnet"]).optional(),
  pastPurchases: z.string().optional(), // comma-separated
  treeSpeciesPreferences: z.string().optional(), // comma-separated
  geographicInterests: z.string().optional(), // comma-separated
  environmentalCauseAlignment: z.string().optional(), // comma-separated
});

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  
  const parsed = QuerySchema.safeParse({
    network: params.get("network") ?? undefined,
    pastPurchases: params.get("pastPurchases") ?? undefined,
    treeSpeciesPreferences: params.get("treeSpeciesPreferences") ?? undefined,
    geographicInterests: params.get("geographicInterests") ?? undefined,
    environmentalCauseAlignment: params.get("environmentalCauseAlignment") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query parameters", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const preferences = {
      pastPurchases: parsed.data.pastPurchases ? parsed.data.pastPurchases.split(",").map(s => s.trim()) : undefined,
      treeSpeciesPreferences: parsed.data.treeSpeciesPreferences ? parsed.data.treeSpeciesPreferences.split(",").map(s => s.trim()) : undefined,
      geographicInterests: parsed.data.geographicInterests ? parsed.data.geographicInterests.split(",").map(s => s.trim()) : undefined,
      environmentalCauseAlignment: parsed.data.environmentalCauseAlignment ? parsed.data.environmentalCauseAlignment.split(",").map(s => s.trim()) : undefined,
    };

    const service = getMlCampaignRecommendationService();
    const result = await service.getRecommendations(preferences, parsed.data.network);
    
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message || "Failed to generate ML recommendations" }, { status: 500 });
  }
}
