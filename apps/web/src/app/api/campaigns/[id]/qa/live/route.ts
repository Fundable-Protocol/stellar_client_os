import {
  addCampaignLiveQuestion,
  answerCampaignLiveQuestion,
  getCampaignLiveQASession,
  scheduleCampaignLiveQA,
  upvoteCampaignLiveQuestion,
} from "@/services/campaign-live-qa.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const headers = { "Cache-Control": "private, no-store, max-age=0" };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return Response.json({ session: getCampaignLiveQASession(id) }, { headers });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: campaignId } = await params;
  try {
    const body = await request.json() as {
      action?: "schedule" | "ask" | "upvote" | "answer";
      topic?: string;
      scheduledAt?: string;
      content?: string;
      actorAddress?: string;
      questionId?: string;
    };
    if (!body.actorAddress?.trim()) {
      return Response.json({ error: "Actor address is required." }, { status: 400, headers });
    }

    let result;
    switch (body.action) {
      case "schedule":
        result = scheduleCampaignLiveQA({
          campaignId,
          topic: body.topic ?? "",
          scheduledAt: body.scheduledAt ?? "",
          actorAddress: body.actorAddress,
        });
        break;
      case "ask":
        result = addCampaignLiveQuestion({ campaignId, content: body.content ?? "", actorAddress: body.actorAddress });
        break;
      case "upvote":
        result = upvoteCampaignLiveQuestion({
          campaignId,
          questionId: body.questionId ?? "",
          actorAddress: body.actorAddress,
        });
        break;
      case "answer":
        result = answerCampaignLiveQuestion({
          campaignId,
          questionId: body.questionId ?? "",
          content: body.content ?? "",
          actorAddress: body.actorAddress,
        });
        break;
      default:
        return Response.json({ error: "Unknown Q&A action." }, { status: 400, headers });
    }
    return Response.json({ result }, { status: 200, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update the Q&A session.";
    const status = message === "Question not found." ? 404 : 400;
    return Response.json({ error: message }, { status, headers });
  }
}