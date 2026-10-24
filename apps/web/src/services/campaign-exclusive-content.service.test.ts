import { beforeEach, describe, expect, it } from "vitest";
import { backersService } from "./campaign-backers.service";
import {
  exclusiveContentService,
  seedDemoExclusiveContent,
} from "./campaign-exclusive-content.service";
import {
  deriveTeaserFromRichText,
  formatFileSize,
} from "@/types/campaign-exclusive-content";

const CAMPAIGN = "camp-exc-1";
const CREATOR = "GCREATOR...AAAA";
const BACKER = "GBACKER...BBBB";
const SMALL_BACKER = "GSMALL...CCCC";
const NON_BACKER = "GNONBACKER...DDDD";

beforeEach(() => {
  backersService.reset();
  exclusiveContentService.reset();
  backersService.registerCampaignCreator(CAMPAIGN, CREATOR);
  backersService.recordContribution({
    campaignId: CAMPAIGN,
    backerAddress: BACKER,
    amount: "500",
    token: "XLM",
    displayName: "Alice Backer",
  });
  backersService.recordContribution({
    campaignId: CAMPAIGN,
    backerAddress: SMALL_BACKER,
    amount: "50",
    token: "XLM",
    displayName: "Bob Small",
  });
});

describe("checkPledgeStatus (AC1: content gate checks pledge status)", () => {
  it("grants access to verified backers and reports their pledged amount", () => {
    const status = exclusiveContentService.checkPledgeStatus(CAMPAIGN, BACKER);
    expect(status).toEqual({
      hasAccess: true,
      isVerifiedBacker: true,
      isCreator: false,
      viewerAddress: BACKER,
      pledgedAmount: "500",
      token: "XLM",
      contributionCount: 1,
      reason: "verified_backer",
    });
  });

  it("grants full access to the campaign creator even without a self-pledge", () => {
    const status = exclusiveContentService.checkPledgeStatus(CAMPAIGN, CREATOR);
    expect(status.hasAccess).toBe(true);
    expect(status.isCreator).toBe(true);
    expect(status.reason).toBe("creator");
  });

  it("denies access to non-backers and unconnected viewers", () => {
    const nonBacker = exclusiveContentService.checkPledgeStatus(CAMPAIGN, NON_BACKER);
    expect(nonBacker.hasAccess).toBe(false);
    expect(nonBacker.isVerifiedBacker).toBe(false);
    expect(nonBacker.reason).toBe("no_pledge");

    const anonymous = exclusiveContentService.checkPledgeStatus(CAMPAIGN, undefined);
    expect(anonymous.hasAccess).toBe(false);
    expect(anonymous.reason).toBe("no_wallet");
  });

  it("enforces optional minimum pledge threshold per post", () => {
    const insufficient = exclusiveContentService.checkPledgeStatus(CAMPAIGN, SMALL_BACKER, {
      minPledgeAmount: "200",
    });
    expect(insufficient.hasAccess).toBe(false);
    expect(insufficient.isVerifiedBacker).toBe(true);
    expect(insufficient.reason).toBe("insufficient_pledge");

    const sufficient = exclusiveContentService.checkPledgeStatus(CAMPAIGN, BACKER, {
      minPledgeAmount: "200",
    });
    expect(sufficient.hasAccess).toBe(true);
    expect(sufficient.reason).toBe("verified_backer");
  });
});

describe("publishPost & getFeed (AC2 & AC3: creator uploads & gated feed)", () => {
  it("allows the creator to publish rich-text posts and file uploads", () => {
    const richPost = exclusiveContentService.publishPost(
      {
        campaignId: CAMPAIGN,
        creatorAddress: CREATOR,
        title: "Monthly Field Report",
        richTextContent: "### Patrol Summary\n\nAll **1,200 saplings** are thriving.",
      },
      1_000,
    );
    expect(richPost.ok).toBe(true);

    const filePost = exclusiveContentService.publishPost(
      {
        campaignId: CAMPAIGN,
        creatorAddress: CREATOR,
        title: "Orthomosaic Map Pack",
        postType: "FILE",
        attachments: [
          {
            fileName: "canopy-orthomosaic.pdf",
            mimeType: "application/pdf",
            fileSizeBytes: 2_097_152,
            downloadUrl: "https://example.com/files/canopy-orthomosaic.pdf",
          },
        ],
      },
      2_000,
    );
    expect(filePost.ok).toBe(true);

    // Verified backer receives unlocked rich-text and file download URLs
    const backerFeed = exclusiveContentService.getFeed(CAMPAIGN, { viewerAddress: BACKER });
    expect(backerFeed.totalPosts).toBe(2);
    expect(backerFeed.unlockedCount).toBe(2);
    expect(backerFeed.lockedCount).toBe(0);
    expect(backerFeed.posts[0].locked).toBe(false);
    expect(backerFeed.posts[0].attachments[0].downloadUrl).toBe(
      "https://example.com/files/canopy-orthomosaic.pdf",
    );
    expect(backerFeed.posts[1].richTextContent).toContain("1,200 saplings");

    // Non-backer receives locked posts with teaser preserved and sensitive fields redacted
    const publicFeed = exclusiveContentService.getFeed(CAMPAIGN, { viewerAddress: NON_BACKER });
    expect(publicFeed.unlockedCount).toBe(0);
    expect(publicFeed.lockedCount).toBe(2);
    expect(publicFeed.posts[0].locked).toBe(true);
    expect(publicFeed.posts[0].attachments[0].fileName).toBe("canopy-orthomosaic.pdf");
    expect(publicFeed.posts[0].attachments[0].downloadUrl).toBeNull();
    expect(publicFeed.posts[1].locked).toBe(true);
    expect(publicFeed.posts[1].richTextContent).toBeNull();
    expect(publicFeed.posts[1].teaser).toContain("Patrol Summary");
  });

  it("rejects non-creators, empty posts, and oversized files", () => {
    const nonCreator = exclusiveContentService.publishPost({
      campaignId: CAMPAIGN,
      creatorAddress: BACKER,
      title: "Unauthorized Post",
      richTextContent: "Should fail",
    });
    expect(nonCreator).toEqual({
      ok: false,
      error: "Only the campaign creator can publish exclusive content",
    });

    const empty = exclusiveContentService.publishPost({
      campaignId: CAMPAIGN,
      creatorAddress: CREATOR,
      title: "Empty Post",
    });
    expect(empty.ok).toBe(false);

    const oversized = exclusiveContentService.publishPost({
      campaignId: CAMPAIGN,
      creatorAddress: CREATOR,
      title: "Huge File",
      attachments: [
        {
          fileName: "huge.zip",
          mimeType: "application/zip",
          fileSizeBytes: 60 * 1024 * 1024,
          downloadUrl: "https://example.com/huge.zip",
        },
      ],
    });
    expect(oversized.ok).toBe(false);
  });

  it("lets only the creator delete a post", () => {
    const published = exclusiveContentService.publishPost({
      campaignId: CAMPAIGN,
      creatorAddress: CREATOR,
      title: "Deletable Update",
      richTextContent: "Temporary update",
    });
    expect(published.ok).toBe(true);
    if (!published.ok) return;

    const denied = exclusiveContentService.deletePost({
      campaignId: CAMPAIGN,
      postId: published.value.id,
      creatorAddress: BACKER,
    });
    expect(denied.ok).toBe(false);

    const allowed = exclusiveContentService.deletePost({
      campaignId: CAMPAIGN,
      postId: published.value.id,
      creatorAddress: CREATOR,
    });
    expect(allowed.ok).toBe(true);
    expect(exclusiveContentService.getFeed(CAMPAIGN, { viewerAddress: CREATOR }).totalPosts).toBe(0);
  });

  it("seeds demo exclusive content idempotently", () => {
    expect(seedDemoExclusiveContent()).toBe(true);
    expect(seedDemoExclusiveContent()).toBe(false);
    expect(formatFileSize(1536)).toBe("1.5 KB");
    expect(deriveTeaserFromRichText("### Title\n\n**Bold** text", 10)).toBe("Title Bol…");
  });
});
