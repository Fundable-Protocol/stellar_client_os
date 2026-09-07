import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCampaignSequelService } from "@/services/campaign-sequel.service";

const CreateSeriesSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  creator: z.string().min(1),
  campaignIds: z.array(z.string()).optional(),
});

/**
 * GET /api/campaigns/franchises
 *
 * Lists every named campaign franchise/universe, newest first.
 */
export async function GET() {
  try {
    const series = await getCampaignSequelService().listSeries();
    return NextResponse.json({ data: series });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load franchises";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/campaigns/franchises
 *
 * Creates a named franchise (series) that sequel/related campaigns can belong
 * to.
 */
export async function POST(request: NextRequest) {
  try {
    const body = CreateSeriesSchema.safeParse(await request.json());
    if (!body.success) {
      return NextResponse.json(
        { error: "Invalid franchise payload", details: body.error.flatten() },
        { status: 400 },
      );
    }
    const series = await getCampaignSequelService().createSeries(body.data);
    return NextResponse.json({ success: true, data: series }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create franchise";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}