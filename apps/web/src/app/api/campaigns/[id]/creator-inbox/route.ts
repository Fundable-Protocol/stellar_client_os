import { getCampaign } from "@/services/campaign.service";
import {
  escalateToCreatorInbox,
  getCreatorInboxMessages,
} from "@/services/creator-inbox.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" };
function noStore<T>(body: T, init?: ResponseInit): Response {
  return Response.json(body, { ...init, headers: { ...NO_STORE_HEADERS, ...(init?.headers ?? {}) } });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) {
    return noStore({ error: "Campaign not found" }, { status: 404 });
  }

  const messages = getCreatorInboxMessages(campaign.id);
  return noStore({ messages, total: messages.length });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) {
    return noStore({ error: "Campaign not found" }, { status: 404 });
  }

  try {
    const body = (await request.json()) as {
      question?: string;
      backerContact?: string;
      backerAddress?: string;
    };

    if (!body.question?.trim()) {
      return noStore({ error: "Question is required" }, { status: 400 });
    }

    const message = await escalateToCreatorInbox({
      campaignId: campaign.id,
      creatorAddress: campaign.creator,
      creatorEmail: campaign.creatorEmail,
      question: body.question,
      backerContact: body.backerContact,
      backerAddress: body.backerAddress,
    });

    return noStore(
      {
        success: true,
        message,
        notification: `Escalated to creator ${campaign.creator}`,
      },
      { status: 201 },
    );
  } catch (error) {
    return noStore(
      { error: error instanceof Error ? error.message : "Failed to escalate question" },
      { status: 400 },
    );
  }
}
