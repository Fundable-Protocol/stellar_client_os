import { updatePartnershipStatus, getPartnershipDataSource } from "@/services/campaign-partnership.service";
import { getCampaign } from "@/services/campaign.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" };
function noStore<T>(body: T, init?: ResponseInit): Response {
  return Response.json(body, { ...init, headers: { ...NO_STORE_HEADERS, ...(init?.headers ?? {}) } });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; requestId: string }> }) {
  const { id: campaignId, requestId } = await params;
  const campaign = await getCampaign(campaignId);
  if (!campaign) return noStore({ error: "Campaign not found" }, { status: 404 });

  try {
    const dataSource = getPartnershipDataSource();
    const requests = await dataSource.getPartnershipRequests(campaignId);
    const req = requests.find(r => r.id === requestId);
    if (!req) return noStore({ error: "Partnership request not found" }, { status: 404 });
    return noStore(req);
  } catch (error) {
    return noStore({ error: error instanceof Error ? error.message : "Failed to fetch partnership" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; requestId: string }> }) {
  const { id: campaignId, requestId } = await params;
  const campaign = await getCampaign(campaignId);
  if (!campaign) return noStore({ error: "Campaign not found" }, { status: 404 });

  try {
    const body = await request.json();
    if (!body.status) {
      return noStore({ error: "Status is required" }, { status: 400 });
    }

    const updated = await updatePartnershipStatus(requestId, body.status);
    return noStore(updated);
  } catch (error) {
    return noStore({ error: error instanceof Error ? error.message : "Failed to update partnership status" }, { status: 400 });
  }
}
