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
  hasActivePledge,
  listCampaignDiscussionComments,
  resetCampaignDiscussion,
  setCampaignDiscussionUpvote,
  toggleCampaignDiscussionPin,
} from "./campaign-discussion.service";
import { backersService } from "./campaign-backers.service";

const campaignId = "campaign-discussion-test";

beforeEach(() => {
  resetCampaignDiscussion();
  resetCampaignDiscussionAuth();
  backersService.reset();
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

describe("campaign discussion service", () => {
  it("gates write/comment permissions to addresses with an active pledge or creator", () => {
    const creator = Keypair.fromRawEd25519Seed(Buffer.from(randomBytes(32)));
    const creatorActor = verifiedActor(creator);
    const backer = Keypair.fromRawEd25519Seed(Buffer.from(randomBytes(32)));
    const backerActor = verifiedActor(backer);
    const nonBacker = Keypair.fromRawEd25519Seed(Buffer.from(randomBytes(32)));
    const nonBackerActor = verifiedActor(nonBacker);

    // Record an active pledge for backer
    backersService.recordContribution({
      campaignId,
      backerAddress: backer.publicKey(),
      amount: "150",
      token: "XLM",
    });

    expect(hasActivePledge(campaignId, backer.publicKey())).toBe(true);
    expect(hasActivePledge(campaignId, nonBacker.publicKey())).toBe(false);

    // Unauthenticated comment fails
    expect(() =>
      createCampaignDiscussionComment({
        campaignId,
        authorName: "Anonymous",
        content: "Trying to post without wallet",
        creatorAddress: creator.publicKey(),
      }),
    ).toThrow("A verified Stellar wallet identity is required to participate in the discussion.");

    // Non-backer without an active pledge fails
    expect(() =>
      createCampaignDiscussionComment({
        campaignId,
        authorName: "Non-Backer",
        actor: nonBackerActor,
        content: "I have no pledge here",
        creatorAddress: creator.publicKey(),
      }),
    ).toThrow("Write and comment permissions are gated to Stellar addresses that have an active pledge in the campaign.");

    // Verified backer with active pledge succeeds
    const backerComment = createCampaignDiscussionComment({
      campaignId,
      authorName: "Verified Backer",
      actor: backerActor,
      content: "Can we add solar sensors as a stretch goal?",
      category: "stretch_goal",
      creatorAddress: creator.publicKey(),
    });
    expect(backerComment).toMatchObject({
      authorAddress: backer.publicKey(),
      content: "Can we add solar sensors as a stretch goal?",
      category: "stretch_goal",
      isCreatorReply: false,
    });

    // Creator succeeds without needing a pledge
    const creatorComment = createCampaignDiscussionComment({
      campaignId,
      authorName: "Creator",
      actor: creatorActor,
      content: "Welcome to the token-gated backer forum!",
      category: "announcement",
      creatorAddress: creator.publicKey(),
    });
    expect(creatorComment).toMatchObject({
      authorAddress: creator.publicKey(),
      category: "announcement",
    });
  });

  it("creates threaded creator replies with Creator Response and restricts official answers", () => {
    const creator = Keypair.fromRawEd25519Seed(Buffer.from(randomBytes(32)));
    const creatorActor = verifiedActor(creator);
    const backer = Keypair.fromRawEd25519Seed(Buffer.from(randomBytes(32)));
    const backerActor = verifiedActor(backer);

    backersService.recordContribution({
      campaignId,
      backerAddress: backer.publicKey(),
      amount: "50",
      token: "XLM",
    });

    const question = createCampaignDiscussionComment({
      campaignId,
      authorName: "Backer",
      actor: backerActor,
      content: "How will the funds be used for the stretch goal?",
      category: "stretch_goal",
      creatorAddress: creator.publicKey(),
      now: 100,
    });

    expect(() =>
      createCampaignDiscussionComment({
        campaignId,
        parentId: question.id,
        authorName: "Backer",
        actor: backerActor,
        content: "Following!",
        officialAnswer: true,
        creatorAddress: creator.publicKey(),
      }),
    ).toThrow("Only the creator can mark a reply as an official answer.");

    const answer = createCampaignDiscussionComment({
      campaignId,
      parentId: question.id,
      authorName: "Campaign creator",
      actor: creatorActor,
      content: "Funds go directly toward sensor deployment.",
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
    const creator = Keypair.fromRawEd25519Seed(Buffer.from(randomBytes(32)));
    const creatorActor = verifiedActor(creator);

    const comment = createCampaignDiscussionComment({
      campaignId,
      authorName: "Creator",
      actor: creatorActor,
      content: "Feature suggestion: add GPS tracking",
      category: "feature_suggestion",
      creatorAddress: creator.publicKey(),
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

  it("allows only the creator to pin comments and sorts pinned announcements first", () => {
    const creator = Keypair.fromRawEd25519Seed(Buffer.from(randomBytes(32)));
    const creatorActor = verifiedActor(creator);
    const backer = Keypair.fromRawEd25519Seed(Buffer.from(randomBytes(32)));
    const backerActor = verifiedActor(backer);

    backersService.recordContribution({
      campaignId,
      backerAddress: backer.publicKey(),
      amount: "200",
      token: "XLM",
    });

    const first = createCampaignDiscussionComment({
      campaignId,
      authorName: "Creator",
      actor: creatorActor,
      content: "Announcement: Stretch goal 2 unlocked!",
      category: "announcement",
      creatorAddress: creator.publicKey(),
      now: 100,
    });
    const second = createCampaignDiscussionComment({
      campaignId,
      authorName: "Backer",
      actor: backerActor,
      content: "Awesome news!",
      category: "general",
      creatorAddress: creator.publicKey(),
      now: 200,
    });

    expect(() =>
      toggleCampaignDiscussionPin({
        campaignId,
        commentId: first.id,
        actor: backerActor,
        creatorAddress: creator.publicKey(),
      }),
    ).toThrow("Only the campaign creator can perform this action.");

    toggleCampaignDiscussionPin({
      campaignId,
      commentId: first.id,
      actor: creatorActor,
      creatorAddress: creator.publicKey(),
    });

    expect(listCampaignDiscussionComments(campaignId).map(({ id }) => id)).toEqual([first.id, second.id]);
    expect(listCampaignDiscussionComments(campaignId)[0].pinned).toBe(true);
  });
});
