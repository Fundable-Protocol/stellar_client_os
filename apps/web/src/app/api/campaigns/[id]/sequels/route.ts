import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCampaignSequelService } from "@/services/campaign-sequel.service";

const QuerySchema = z.object({
  relation: z.enum(["SEQUEL", "PREQUEL", "SPINOFF", "RELATED"]).optional(),
  includeIncoming: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value !== "false"),
});

/**
 * GET /api/campaigns/:id/sequels
 *
 * Returns every campaign linked to the given campaign (both outgoing sequel
 * edges and, by default, incoming reverse edges). Optionally filter by the
 * relation type.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "Campaign id is required" }, { status: 400 });
  }
  const parsed = QuerySchema.safeParse({
    relation: request.nextUrl.searchParams.get("relation") ?? undefined,
    includeIncoming: request.nextUrl.searchParams.get("includeIncoming") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  try {
    const sequels = await getCampaignSequelService().getSequels(id, parsed.data);
    const series = await getCampaignSequelService().getFranchise(id);
    return NextResponse.json({ campaignId: id, data: sequels, series });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}