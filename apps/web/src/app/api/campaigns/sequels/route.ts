import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCampaignSequelService } from "@/services/campaign-sequel.service";

const LinkSchema = z.object({
  sourceCampaignId: z.string().min(1),
  targetCampaignId: z.string().min(1),
  relation: z.enum(["SEQUEL", "PREQUEL", "SPINOFF", "RELATED"]),
  order: z.number().int().min(0).optional(),
  seriesId: z.string().optional(),
  notes: z.string().optional(),
  linkedBy: z.string().min(1),
});

const UnlinkSchema = z.object({
  sourceCampaignId: z.string().min(1),
  targetCampaignId: z.string().min(1),
});

/**
 * POST /api/campaigns/sequels
 *
 * Creates (or replaces) a directed relation between two campaigns so creators
 * can link sequel campaigns and related projects.
 */
export async function POST(request: NextRequest) {
  try {
    const body = LinkSchema.safeParse(await request.json());
    if (!body.success) {
      return NextResponse.json(
        { error: "Invalid link payload", details: body.error.flatten() },
        { status: 400 },
      );
    }
    const link = await getCampaignSequelService().linkCampaigns(body.data);
    return NextResponse.json({ success: true, data: link }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to link campaigns";
    const status = message.endsWith("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * DELETE /api/campaigns/sequels
 *
 * Removes the relation between the two campaigns in the request body.
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = UnlinkSchema.safeParse(await request.json());
    if (!body.success) {
      return NextResponse.json(
        { error: "Invalid unlink payload", details: body.error.flatten() },
        { status: 400 },
      );
    }
    const removed = await getCampaignSequelService().unlinkCampaigns(
      body.data.sourceCampaignId,
      body.data.targetCampaignId,
    );
    return NextResponse.json({ success: removed });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to unlink campaigns";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}