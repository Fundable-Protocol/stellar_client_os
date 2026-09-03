import { recordCampaignContribution } from "@/services/campaign.service";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = (await request.json()) as { amount?: string };
    if (!body.amount) {
      return Response.json({ error: "amount is required" }, { status: 400 });
    }
    const result = await recordCampaignContribution(id, body.amount);
    if (!result) return Response.json({ error: "Campaign not found" }, { status: 404 });
    return Response.json({ ...result.campaign, milestones: result.milestones });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid contribution" },
      { status: 400 },
    );
  }
}
