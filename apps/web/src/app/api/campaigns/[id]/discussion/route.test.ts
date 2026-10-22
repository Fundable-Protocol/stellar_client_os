// @vitest-environment node

import { randomBytes } from "node:crypto";
import { Buffer } from "node:buffer";
import { Keypair } from "@stellar/stellar-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCampaign } from "@/services/campaign.service";
import {
  issueCampaignDiscussionChallenge,
  resetCampaignDiscussionAuth,
  verifyCampaignDiscussionChallenge,
} from "@/services/campaign-discussion-auth.service";
import { resetCampaignDiscussion } from "@/services/campaign-discussion.service";
import { backersService } from "@/services/campaign-backers.service";
import { PATCH, POST } from "./route";

vi.mock("@/services/campaign.service", () => ({
  getCampaign: vi.fn(),
}));

const campaignId = "discussion-route-test";
const params = Promise.resolve({ id: campaignId });
let creator: Keypair;
let backer: Keypair;
let nonBacker: Keypair;

beforeEach(() => {
  resetCampaignDiscussion();
  resetCampaignDiscussionAuth();
  backersService.reset();
  creator = Keypair.fromRawEd25519Seed(Buffer.from(randomBytes(32)));
  backer = Keypair.fromRawEd25519Seed(Buffer.from(randomBytes(32)));
  nonBacker = Keypair.fromRawEd25519Seed(Buffer.from(randomBytes(32)));

  vi.mocked(getCampaign).mockResolvedValue({
    id: campaignId,
    creator: creator.publicKey(),
    creatorAddress: creator.publicKey(),
  } as NonNullable<Awaited<ReturnType<typeof getCampaign>>>);

  // Record active pledge for backer
  backersService.recordContribution({
    campaignId,
    backerAddress: backer.publicKey(),
    amount: "250",
    token: "XLM",
  });
});

function jsonRequest(body: unknown): Request {
  return new Request(`http://localhost/api/campaigns/${campaignId}/discussion`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function signedToken(keypair: Keypair): string {
  const challenge = issueCampaignDiscussionChallenge(campaignId, keypair.publicKey());
  const token = verifyCampaignDiscussionChallenge({
    campaignId,
    address: keypair.publicKey(),
    nonce: challenge.nonce,
    signature: keypair.sign(Buffer.from(challenge.message, "utf8")).toString("base64"),
  });
  if (!token) throw new Error("Test keypair challenge should verify.");
  return token;
}

describe("campaign discussion API", () => {
  it("rejects malformed JSON and invalid field types with fixed errors", async () => {
    const malformed = await POST(
      new Request(`http://localhost/api/campaigns/${campaignId}/discussion`, {
        method: "POST",
        body: "{",
      }),
      { params },
    );
    const invalid = await POST(
      jsonRequest({
        authorName: "Visitor",
        content: 99,
      }),
      { params },
    );

    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({ error: "Malformed JSON request body." });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ error: "Invalid request body." });
  });

  it("gates write/comment permissions to verified Stellar addresses with an active pledge", async () => {
    // 1. Missing actorToken -> 401
    const unauthenticated = await POST(
      jsonRequest({
        authorName: "Anonymous",
        content: "Posting without wallet token",
      }),
      { params },
    );
    expect(unauthenticated.status).toBe(401);
    expect(await unauthenticated.json()).toMatchObject({
      error: "A verified Stellar wallet identity is required to participate in the discussion.",
    });

    // 2. Connected wallet with NO active pledge -> 403
    const nonBackerToken = signedToken(nonBacker);
    const forbidden = await POST(
      jsonRequest({
        authorName: "Non-Backer",
        content: "I have no pledge in this campaign",
        actorToken: nonBackerToken,
      }),
      { params },
    );
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toMatchObject({
      error: "Write/comment permissions gated to Stellar addresses that have an active pledge in the campaign.",
    });

    // 3. Verified backer with active pledge -> 201 Created
    const backerToken = signedToken(backer);
    const backerResponse = await POST(
      jsonRequest({
        authorName: "Top Backer",
        content: "Feature suggestion: add sensor data dashboards",
        category: "feature_suggestion",
        actorToken: backerToken,
      }),
      { params },
    );
    expect(backerResponse.status).toBe(201);
    const backerData = (await backerResponse.json()) as { comment: { id: string; category: string } };
    expect(backerData.comment.category).toBe("feature_suggestion");

    // 4. Creator can post announcements without pledge
    const creatorToken = signedToken(creator);
    const creatorResponse = await POST(
      jsonRequest({
        authorName: "Creator",
        content: "Announcement: Stretch goals discussion is now open!",
        category: "announcement",
        actorToken: creatorToken,
      }),
      { params },
    );
    expect(creatorResponse.status).toBe(201);
  });

  it("requires a verified creator identity to mark a reply as official", async () => {
    const backerToken = signedToken(backer);
    const questionResponse = await POST(
      jsonRequest({
        authorName: "Backer",
        content: "When is milestone 1 planned?",
        actorToken: backerToken,
      }),
      { params },
    );
    const { comment: question } = (await questionResponse.json()) as { comment: { id: string } };

    // Non-creator trying to mark official answer
    const forbidden = await POST(
      jsonRequest({
        authorName: "Another Backer",
        content: "I think it is June",
        parentId: question.id,
        officialAnswer: true,
        actorToken: backerToken,
      }),
      { params },
    );
    expect(forbidden.status).toBe(403);

    // Creator marking official answer
    const creatorToken = signedToken(creator);
    const officialAnswer = await POST(
      jsonRequest({
        authorName: "Creator",
        content: "Milestone 1 will ship by August 2026.",
        parentId: question.id,
        officialAnswer: true,
        actorToken: creatorToken,
      }),
      { params },
    );
    expect(officialAnswer.status).toBe(201);
    const answerData = (await officialAnswer.json()) as { comment: { isCreatorReply: boolean; officialAnswer: boolean } };
    expect(answerData.comment.isCreatorReply).toBe(true);
    expect(answerData.comment.officialAnswer).toBe(true);
  });

  it("rejects pinning unless the verified actor is the campaign creator", async () => {
    const backerToken = signedToken(backer);
    const created = await POST(
      jsonRequest({
        authorName: "Backer",
        content: "Feature suggestion",
        actorToken: backerToken,
      }),
      { params },
    );
    const { comment } = (await created.json()) as { comment: { id: string } };

    // Non-creator trying to pin
    const nonCreatorToken = signedToken(Keypair.fromRawEd25519Seed(Buffer.from(randomBytes(32))));
    const response = await PATCH(
      new Request(`http://localhost/api/campaigns/${campaignId}/discussion`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "pin",
          commentId: comment.id,
          actorToken: nonCreatorToken,
        }),
      }),
      { params },
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: "Only the campaign creator can perform this action.",
    });

    // Creator pinning succeeds
    const creatorToken = signedToken(creator);
    const pinSuccess = await PATCH(
      new Request(`http://localhost/api/campaigns/${campaignId}/discussion`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "pin",
          commentId: comment.id,
          actorToken: creatorToken,
        }),
      }),
      { params },
    );
    expect(pinSuccess.status).toBe(200);
    const pinData = (await pinSuccess.json()) as { comment: { pinned: boolean } };
    expect(pinData.comment.pinned).toBe(true);
  });

  it("returns a generic server error and logs unexpected service failures", async () => {
    const error = new Error("database details");
    vi.mocked(getCampaign).mockRejectedValueOnce(error);
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const response = await POST(
        jsonRequest({
          authorName: "Visitor",
          content: "Comment",
          actorToken: signedToken(creator),
        }),
        { params },
      );
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: "An unexpected error occurred." });
      expect(log).toHaveBeenCalledWith("Campaign discussion create failed unexpectedly.", error);
    } finally {
      log.mockRestore();
    }
  });
});
