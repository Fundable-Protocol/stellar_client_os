import { getCampaign, transitionCampaignStatus } from "@/services/campaign.service";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const campaign = await getCampaign((await params).id);
  return campaign ? Response.json(campaign) : Response.json({ error: "Campaign not found" }, { status: 404 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  const campaign = await getCampaign(id);
  if (!campaign) return Response.json({ error: "Campaign not found" }, { status: 404 });

  try {
    const body = await request.json() as { status?: never; changedBy?: string; reason?: string; name?: string; description?: string };
    let updated = campaign;
    if (body.status) {
      if (!body.changedBy) return Response.json({ error: "changedBy is required when changing status" }, { status: 400 });
      updated = await transitionCampaignStatus(campaign, body.status, body.changedBy, body.reason);
    }
    if (body.name !== undefined || body.description !== undefined) {
      updated = await (await import("@/services/campaign.service")).getCampaignDataSource().saveCampaign({
        ...updated,
        name: body.name ?? updated.name,
        description: body.description ?? updated.description,
        updatedAt: Date.now(),
      });
    }
    return Response.json(updated);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Invalid JSON request body" }, { status: 400 });
  }
}
