// @vitest-environment node

import { randomBytes } from "node:crypto";
import { Buffer } from "node:buffer";
import { beforeEach, describe, expect, it } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import {
  issueCampaignDiscussionChallenge,
  issueCampaignDiscussionVoterToken,
  resolveCampaignDiscussionActor,
  resetCampaignDiscussionAuth,
  resolveCampaignDiscussionVoter,
  verifyCampaignDiscussionChallenge,
} from "./campaign-discussion-auth.service";
import {
  createCampaignDiscussionComment,
  listCampaignDiscussionComments,
  resetCampaignDiscussion,
  setCampaignDiscussionUpvote,
  toggleCampaignDiscussionPin,
} from "./campaign-discussion.service";

const campaignId = "campaign-discussion-test";
const creatorAddress = "GCREATOR";

beforeEach(() => {
  resetCampaignDiscussion();
  resetCampaignDiscussionAuth();
});

function verifiedActor(keypair: Keypair, campaign = campaignId) {
  const challenge = issueCampaignDiscussionChallenge(campaign, keypair.publicKey());
  const token = verifyCampaignDiscussionChallenge({
    campaignId: campaign,
    address: keypair.publicKey(),
    nonce: challenge.nonce,
    signature: keypair.sign(Buffer.from(challenge.message, "utf8")).toString("base64"),
  });
  if (!token) throw new Error("Test keypair challenge should verify.");
  const actor = resolveCampaignDiscussionActor(campaign, token);
  if (!actor) throw new Error("Verified test token should resolve.");
  return actor;
}

describe("campaign discussion", () => {
  it("creates threaded creator replies and restricts official answers", () => {
    const creator = Keypair.fromRawEd25519Seed(Buffer.from(randomBytes(32)));
    const creatorActor = verifiedActor(creator);
    const question = createCampaignDiscussionComment({
      campaignId,
      authorName: "Backer",
      content: "How will the funds be used?",
      creatorAddress: creator.publicKey(),
      now: 100,
    });

    expect(() => createCampaignDiscussionComment({
      campaignId,
      parentId: question.id,
      authorName: "Visitor",
      content: "Following!",
      officialAnswer: true,
      creatorAddress: creator.publicKey(),
    })).toThrow("Only the creator can mark a reply as an official answer.");

    const answer = createCampaignDiscussionComment({
      campaignId,
      parentId: question.id,
      authorName: "Campaign creator",
      actor: creatorActor,
      content: "Funds go directly to project costs.",
      officialAnswer: true,
      creatorAddress: creator.publicKey(),
      now: 200,
    });

    expect(answer).toMatchObject({
      parentId: question.id,
      isCreatorReply: true,
      officialAnswer: true,
    });
    expect(listCampaignDiscussionComments(campaignId)).toHaveLength(2);
  });

  it("toggles each viewer's upvote and exposes only their own vote state", () => {
    const comment = createCampaignDiscussionComment({
      campaignId,
      authorName: "Visitor",
      content: "A useful comment",
      creatorAddress,
    });
    const voterToken = issueCampaignDiscussionVoterToken(campaignId);
    const voter = resolveCampaignDiscussionVoter(campaignId, voterToken);
    if (!voter) throw new Error("Issued voter token should resolve.");

    expect(setCampaignDiscussionUpvote(campaignId, comment.id, voter, true)).toMatchObject({
      upvotes: 1,
      hasUpvoted: true,
    });
    expect(setCampaignDiscussionUpvote(campaignId, comment.id, voter, true)).toMatchObject({
      upvotes: 1,
      hasUpvoted: true,
    });
    expect(listCampaignDiscussionComments(campaignId, "different-voter")[0]).toMatchObject({
      upvotes: 1,
      hasUpvoted: false,
    });
    expect(setCampaignDiscussionUpvote(campaignId, comment.id, voter, false)).toMatchObject({
      upvotes: 0,
      hasUpvoted: false,
    });
  });

  it("allows only the creator to pin comments and sorts pinned comments first", () => {
    const creator = Keypair.fromRawEd25519Seed(Buffer.from(randomBytes(32)));
    const creatorActor = verifiedActor(creator);
    const first = createCampaignDiscussionComment({
      campaignId,
      authorName: "First",
      content: "First comment",
      creatorAddress,
      now: 100,
    });
    const second = createCampaignDiscussionComment({
      campaignId,
      authorName: "Second",
      content: "Second comment",
      creatorAddress,
      now: 200,
    });

    expect(() => toggleCampaignDiscussionPin({
      campaignId,
      commentId: first.id,
      actor: verifiedActor(Keypair.fromRawEd25519Seed(Buffer.from(randomBytes(32)))),
      creatorAddress: creator.publicKey(),
    })).toThrow("Only the campaign creator can perform this action.");

    toggleCampaignDiscussionPin({
      campaignId,
      commentId: first.id,
      actor: creatorActor,
      creatorAddress: creator.publicKey(),
    });
    expect(listCampaignDiscussionComments(campaignId).map(({ id }) => id)).toEqual([first.id, second.id]);
  });
});
