import { NextRequest, NextResponse } from "next/server";
import { getCampaignVerificationSla } from "@/services/campaign-sla.service";
import { withRateLimit } from "@/middlewares/rate-limit.middleware";

export const GET = withRateLimit(
  async (req: NextRequest): Promise<NextResponse> => {
    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get("campaignId") || "1";
    const plantingId = searchParams.get("plantingId") || "1";

    try {
      const result = await getCampaignVerificationSla(campaignId, plantingId);
      return NextResponse.json({ data: result });
    } catch (err) {
      return NextResponse.json(
        { error: (err as Error).message || "Failed to fetch campaign verification SLA" },
        { status: 500 }
      );
    }
  },
  { limit: 60, windowMs: 60_000, keyPrefix: "rl:campaign-sla" }
);
