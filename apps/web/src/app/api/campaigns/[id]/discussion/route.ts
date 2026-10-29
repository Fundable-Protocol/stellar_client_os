import { z } from "zod";
import { getCampaign } from "@/services/campaign.service";
import {
  resolveCampaignDiscussionActor,
  resolveCampaignDiscussionVoter,
} from "@/services/campaign-discussion-auth.service";
import {
  CampaignDiscussionError,
  createCampaignDiscussionComment,
  listCampaignDiscussionComments,
  setCampaignDiscussionUpvote,
  toggleCampaignDiscussionPin,
} from "@/services/campaign-discussion.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const headers = { "Cache-Control": "private, no-store, max-age=0" };
const postSchema = z.object({
  parentId: z.string().min(1).optional(),
  authorName: z.string(),
  content: z.string(),
  officialAnswer: z.boolean().optional(),
  actorToken: z.string().min(1).optional(),
}).strict();
const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("upvote"),
    commentId: z.string().min(1),
    voterToken: z.string().min(1),
    upvoted: z.boolean(),
  }).strict(),
  z.object({
    action: z.literal("pin"),
    commentId: z.string().min(1),
    actorToken: z.string().min(1),
  }).strict(),
]);

function unexpectedError(error: unknown, operation: string): Response {
  console.error(`Campaign discussion ${operation} failed unexpectedly.`, error);
  return Response.json({ error: "An unexpected error occurred." }, { status: 500, headers });
}

function serviceError(error: CampaignDiscussionError): Response {
  const status = error.code === "parent_not_found" || error.code === "comment_not_found"
    ? 404
    : error.code === "creator_required" || error.code === "invalid_official_answer"
      ? 403
      : 400;
  return Response.json({ error: error.message }, { status, headers });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const campaign = await getCampaign(id);
    if (!campaign) return Response.json({ error: "Campaign not found." }, { status: 404, headers });

    const voterToken = request.headers.get("x-campaign-discussion-voter-token");
    const voter = voterToken ? resolveCampaignDiscussionVoter(id, voterToken) : null;
    return Response.json({ comments: listCampaignDiscussionComments(id, voter?.id) }, { headers });
  } catch (error) {
    return unexpectedError(error, "read");
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const campaign = await getCampaign(id);
    if (!campaign) return Response.json({ error: "Campaign not found." }, { status: 404, headers });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Malformed JSON request body." }, { status: 400, headers });
    }
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Invalid request body." }, { status: 400, headers });
    }

    const actor = parsed.data.actorToken
      ? resolveCampaignDiscussionActor(id, parsed.data.actorToken)
      : null;
    if (parsed.data.actorToken && !actor) {
      return Response.json({ error: "A valid campaign wallet identity is required." }, { status: 401, headers });
    }
    if (parsed.data.officialAnswer && !actor) {
      return Response.json({ error: "A verified creator wallet is required." }, { status: 401, headers });
    }

    const comment = createCampaignDiscussionComment({
      campaignId: id,
      parentId: parsed.data.parentId,
      authorName: parsed.data.authorName,
      actor: actor ?? undefined,
      content: parsed.data.content,
      officialAnswer: parsed.data.officialAnswer,
      creatorAddress: campaign.creator,
    });
    return Response.json({ comment }, { status: 201, headers });
  } catch (error) {
    if (error instanceof CampaignDiscussionError) return serviceError(error);
    return unexpectedError(error, "create");
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const campaign = await getCampaign(id);
    if (!campaign) return Response.json({ error: "Campaign not found." }, { status: 404, headers });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Malformed JSON request body." }, { status: 400, headers });
    }
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Invalid request body." }, { status: 400, headers });
    }

    if (parsed.data.action === "upvote") {
      const voter = resolveCampaignDiscussionVoter(id, parsed.data.voterToken);
      if (!voter) {
        return Response.json({ error: "A valid campaign voter token is required." }, { status: 401, headers });
      }
      const comment = setCampaignDiscussionUpvote(
        id,
        parsed.data.commentId,
        voter,
        parsed.data.upvoted,
      );
      return Response.json({ comment }, { headers });
    }

    const actor = resolveCampaignDiscussionActor(id, parsed.data.actorToken);
    if (!actor) {
      return Response.json({ error: "A valid campaign wallet identity is required." }, { status: 401, headers });
    }
    const comment = toggleCampaignDiscussionPin({
      campaignId: id,
      commentId: parsed.data.commentId,
      actor,
      creatorAddress: campaign.creator,
    });
    return Response.json({ comment }, { headers });
  } catch (error) {
    if (error instanceof CampaignDiscussionError) return serviceError(error);
    return unexpectedError(error, "update");
  }
}
