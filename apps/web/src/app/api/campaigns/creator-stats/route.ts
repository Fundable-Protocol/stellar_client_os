import { NextRequest, NextResponse } from "next/server";
import { getCreatorStats } from "@/services/creator-stats.service";
import { withRateLimit } from "@/middlewares/rate-limit.middleware";

export const GET = withRateLimit(
  async (req: NextRequest): Promise<NextResponse> => {
    const { searchParams } = new URL(req.url);
    const creator = searchParams.get("creator");

    if (!creator) {
      return NextResponse.json(
        { error: "Missing required query parameter: creator" },
        { status: 400 }
      );
    }

    try {
      const stats = await getCreatorStats(creator);
      return NextResponse.json({ data: stats });
    } catch (err) {
      return NextResponse.json(
        { error: (err as Error).message || "Failed to fetch creator stats" },
        { status: 500 }
      );
    }
  },
  { limit: 30, windowMs: 60_000, keyPrefix: "rl:creator-stats" }
);
