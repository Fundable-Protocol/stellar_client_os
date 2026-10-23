import { z } from "zod";
import { getCampaign } from "@/services/campaign.service";
import {
  CampaignDiscussionAuthError,
  issueCampaignDiscussionChallenge,
  issueCampaignDiscussionVoterToken,
  resolveCampaignDiscussionVoter,
  verifyCampaignDiscussionChallenge,
} from "@/services/campaign-discussion-auth.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const headers = { "Cache-Control": "private, no-store, max-age=0" };
const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("visitor"),
    voterToken: z.string().min(1).optional(),
  }).strict(),
  z.object({
    action: z.literal("challenge"),
    address: z.string().min(1),
  }).strict(),
  z.object({
    action: z.literal("verify"),
    address: z.string().min(1),
    nonce: z.string().uuid(),
    signature: z.string().min(1),
  }).strict(),
]);

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
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Invalid request body." }, { status: 400, headers });
    }

    if (parsed.data.action === "visitor") {
      const existingToken = parsed.data.voterToken
        && resolveCampaignDiscussionVoter(id, parsed.data.voterToken)
        ? parsed.data.voterToken
        : undefined;
      return Response.json({
        voterToken: existingToken ?? issueCampaignDiscussionVoterToken(id),
      }, { headers });
    }
    if (parsed.data.action === "challenge") {
      const challenge = issueCampaignDiscussionChallenge(id, parsed.data.address);
      return Response.json(challenge, { headers });
    }

    const actorToken = verifyCampaignDiscussionChallenge({
      campaignId: id,
      address: parsed.data.address,
      nonce: parsed.data.nonce,
      signature: parsed.data.signature,
    });
    if (!actorToken) {
      return Response.json({ error: "Wallet signature is invalid or expired." }, { status: 401, headers });
    }
    return Response.json({ actorToken }, { headers });
  } catch (error) {
    if (error instanceof CampaignDiscussionAuthError) {
      return Response.json({ error: error.message }, { status: 400, headers });
    }
    console.error("Campaign discussion identity request failed unexpectedly.", error);
    return Response.json({ error: "An unexpected error occurred." }, { status: 500, headers });
  }
}
