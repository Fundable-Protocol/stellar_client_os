import { getPartnershipDataSource, requestPartnership } from "@/services/campaign-partnership.service";
import { getCampaign } from "@/services/campaign.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" };
function noStore<T>(body: T, init?: ResponseInit): Response {
  return Response.json(body, { ...init, headers: { ...NO_STORE_HEADERS, ...(init?.headers ?? {}) } });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const campaignId = (await params).id;
  const campaign = await getCampaign(campaignId);
  if (!campaign) return noStore({ error: "Campaign not found" }, { status: 404 });

  try {
    const dataSource = getPartnershipDataSource();
    const requests = await dataSource.getPartnershipRequests(campaignId);
    return noStore(requests);
  } catch (error) {
    return noStore({ error: error instanceof Error ? error.message : "Failed to fetch partnerships" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const campaignId = (await params).id;
  const campaign = await getCampaign(campaignId);
  if (!campaign) return noStore({ error: "Campaign not found" }, { status: 404 });

  try {
    const body = await request.json();
    if (!body.ngoId || !body.servicesRequested || !Array.isArray(body.servicesRequested)) {
      return noStore({ error: "Invalid request body: missing ngoId or servicesRequested" }, { status: 400 });
    }

    const partnershipReq = await requestPartnership(
      campaignId,
      body.ngoId,
      body.servicesRequested,
      body.proposedTerms
    );
    return noStore(partnershipReq, { status: 201 });
  } catch (error) {
    return noStore({ error: error instanceof Error ? error.message : "Failed to create partnership request" }, { status: 400 });
  }
}
