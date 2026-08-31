import { getCampaign, transitionCampaignStatus } from "../../../../services/campaign.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" };
function noStore<T>(body: T, init?: ResponseInit): Response {
  return Response.json(body, { ...init, headers: { ...NO_STORE_HEADERS, ...(init?.headers ?? {}) } });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const campaign = await getCampaign((await params).id);
  return campaign ? noStore(campaign) : noStore({ error: "Campaign not found" }, { status: 404 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  const campaign = await getCampaign(id);
  if (!campaign) return noStore({ error: "Campaign not found" }, { status: 404 });

  try {
    const body = await request.json() as { status?: never; changedBy?: string; reason?: string; name?: string; description?: string };
    let updated = campaign;
    if (body.status) {
      if (!body.changedBy) return noStore({ error: "changedBy is required when changing status" }, { status: 400 });
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
    return noStore(updated);
  } catch (error) {
    return noStore({ error: error instanceof Error ? error.message : "Invalid JSON request body" }, { status: 400 });
  }
}
