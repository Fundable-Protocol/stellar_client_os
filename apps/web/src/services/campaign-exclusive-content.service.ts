import {
  CreateExclusiveContentInput,
  ExclusiveContentAttachment,
  ExclusiveContentFeedResult,
  ExclusiveContentPost,
  ExclusiveContentPostType,
  GetExclusiveContentOptions,
  MAX_EXCLUSIVE_FILE_SIZE_BYTES,
  MAX_EXCLUSIVE_RICH_TEXT_LENGTH,
  MAX_EXCLUSIVE_TEASER_LENGTH,
  MAX_EXCLUSIVE_TITLE_LENGTH,
  PledgeGateStatus,
  deriveTeaserFromRichText,
  isExclusivePostType,
} from "@/types/campaign-exclusive-content";
import { formatTokenAmount, parseTokenAmount } from "@/types/campaign-backers";
import {
  DEMO_CAMPAIGN_ID,
  DEMO_CREATOR_ADDRESS,
  backersService,
  seedDemoBackers,
} from "./campaign-backers.service";

/**
 * Backer-only exclusive content service (#1267).
 *
 * Responsibilities:
 *  1. Content gate (`checkPledgeStatus`): verifies whether a viewer address is
 *     the campaign creator or has a positive verified pledge recorded for the
 *     campaign (and optionally meets a post's `minPledgeAmount` threshold).
 *  2. Creator publishing (`publishPost` / `deletePost`): allows the campaign
 *     creator to publish rich-text updates and upload file attachments to the
 *     backer-only area.
 *  3. Gated feed (`getFeed`): returns full rich-text content and file download
 *     URLs to verified backers/creators, and redacts sensitive fields to `null`
 *     for non-backers while keeping the teaser text for the blurred preview UI.
 */

export type ExclusiveContentActionResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

interface StoredExclusivePost {
  id: string;
  campaignId: string;
  creatorAddress: string;
  title: string;
  teaser: string;
  postType: ExclusiveContentPostType;
  richTextContent: string | null;
  attachments: Array<{
    id: string;
    fileName: string;
    mimeType: string;
    fileSizeBytes: number;
    downloadUrl: string;
  }>;
  minPledgeAmount?: string;
  createdAt: number;
  updatedAt: number;
}

const sameAddress = (a?: string | null, b?: string | null): boolean =>
  Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());

class CampaignExclusiveContentService {
  private posts = new Map<string, StoredExclusivePost[]>();

  private resolveCreator(campaignId: string, creatorOverride?: string): string | undefined {
    const explicit = creatorOverride?.trim();
    if (explicit) return explicit;
    return backersService.getCampaignCreator(campaignId?.trim() ?? "");
  }

  /**
   * Check whether `viewerAddress` passes the pledge gate for `campaignId`.
   *
   * - Campaign creators always pass (`reason: "creator"`).
   * - Viewers with a positive total contribution pass (`reason: "verified_backer"`),
   *   unless `minPledgeAmount` is set and their total pledge is below that threshold
   *   (`reason: "insufficient_pledge"`).
   * - Unconnected viewers (`reason: "no_wallet"`) and non-backers (`reason: "no_pledge"`)
   *   do not pass.
   */
  checkPledgeStatus(
    campaignId: string,
    viewerAddress?: string,
    options: { creatorAddress?: string; minPledgeAmount?: string } = {},
  ): PledgeGateStatus {
    const id = campaignId?.trim() ?? "";
    const viewer = viewerAddress?.trim() || undefined;
    const creator = this.resolveCreator(id, options.creatorAddress);

    const contributions = viewer
      ? backersService
          .getContributions(id)
          .filter((entry) => sameAddress(entry.backerAddress, viewer))
      : [];

    let totalScaled = 0n;
    let token = "XLM";
    for (const entry of contributions) {
      const parsed = parseTokenAmount(entry.amount);
      if (parsed !== null && parsed > 0n) {
        totalScaled += parsed;
        token = entry.token || token;
      }
    }

    const pledgedAmount = formatTokenAmount(totalScaled);
    const isVerifiedBacker = totalScaled > 0n;
    const isCreator = sameAddress(viewer, creator);

    if (isCreator) {
      return {
        hasAccess: true,
        isVerifiedBacker,
        isCreator: true,
        viewerAddress: viewer,
        pledgedAmount,
        token,
        contributionCount: contributions.length,
        reason: "creator",
      };
    }

    if (!viewer) {
      return {
        hasAccess: false,
        isVerifiedBacker: false,
        isCreator: false,
        pledgedAmount: "0",
        token,
        contributionCount: 0,
        reason: "no_wallet",
      };
    }

    if (!isVerifiedBacker) {
      return {
        hasAccess: false,
        isVerifiedBacker: false,
        isCreator: false,
        viewerAddress: viewer,
        pledgedAmount: "0",
        token,
        contributionCount: 0,
        reason: "no_pledge",
      };
    }

    if (options.minPledgeAmount) {
      const minScaled = parseTokenAmount(options.minPledgeAmount);
      if (minScaled !== null && minScaled > 0n && totalScaled < minScaled) {
        return {
          hasAccess: false,
          isVerifiedBacker: true,
          isCreator: false,
          viewerAddress: viewer,
          pledgedAmount,
          token,
          contributionCount: contributions.length,
          reason: "insufficient_pledge",
        };
      }
    }

    return {
      hasAccess: true,
      isVerifiedBacker: true,
      isCreator: false,
      viewerAddress: viewer,
      pledgedAmount,
      token,
      contributionCount: contributions.length,
      reason: "verified_backer",
    };
  }

  /**
   * Publish a rich-text post or file upload to the campaign's backer-only area.
   * Only the campaign creator is permitted to publish.
   */
  publishPost(
    input: CreateExclusiveContentInput,
    now = Date.now(),
  ): ExclusiveContentActionResult<ExclusiveContentPost> {
    const campaignId = input.campaignId?.trim();
    const creatorAddress = input.creatorAddress?.trim();
    const title = input.title?.trim();

    if (!campaignId) return { ok: false, error: "campaignId is required" };
    if (!creatorAddress) return { ok: false, error: "creatorAddress is required" };
    if (!title) return { ok: false, error: "Post title is required" };
    if (title.length > MAX_EXCLUSIVE_TITLE_LENGTH) {
      return {
        ok: false,
        error: `Post title must be at most ${MAX_EXCLUSIVE_TITLE_LENGTH} characters`,
      };
    }

    const registeredCreator = backersService.getCampaignCreator(campaignId);
    if (registeredCreator && !sameAddress(registeredCreator, creatorAddress)) {
      return {
        ok: false,
        error: "Only the campaign creator can publish exclusive content",
      };
    }
    if (!registeredCreator) {
      backersService.registerCampaignCreator(campaignId, creatorAddress);
    }

    if (input.postType !== undefined && !isExclusivePostType(input.postType)) {
      return { ok: false, error: "postType must be RICH_TEXT or FILE" };
    }

    const richTextContent = input.richTextContent?.trim() || null;
    if (richTextContent && richTextContent.length > MAX_EXCLUSIVE_RICH_TEXT_LENGTH) {
      return {
        ok: false,
        error: `Rich-text content must be at most ${MAX_EXCLUSIVE_RICH_TEXT_LENGTH} characters`,
      };
    }

    const rawAttachments = input.attachments ?? [];
    const attachments: StoredExclusivePost["attachments"] = [];
    for (let i = 0; i < rawAttachments.length; i += 1) {
      const item = rawAttachments[i];
      const fileName = item.fileName?.trim();
      const mimeType = item.mimeType?.trim() || "application/octet-stream";
      const downloadUrl = item.downloadUrl?.trim();
      const fileSizeBytes = Number(item.fileSizeBytes ?? 0);

      if (!fileName) {
        return { ok: false, error: "Attachment fileName is required" };
      }
      if (!downloadUrl) {
        return { ok: false, error: `Attachment "${fileName}" is missing a downloadUrl` };
      }
      if (!Number.isFinite(fileSizeBytes) || fileSizeBytes <= 0) {
        return { ok: false, error: `Attachment "${fileName}" must have a positive file size` };
      }
      if (fileSizeBytes > MAX_EXCLUSIVE_FILE_SIZE_BYTES) {
        return {
          ok: false,
          error: `Attachment "${fileName}" exceeds the 50 MB size limit`,
        };
      }

      attachments.push({
        id: `att-${now}-${i}-${Math.random().toString(36).slice(2, 7)}`,
        fileName,
        mimeType,
        fileSizeBytes,
        downloadUrl,
      });
    }

    if (!richTextContent && attachments.length === 0) {
      return {
        ok: false,
        error: "Provide rich-text content or upload at least one file",
      };
    }

    if (input.minPledgeAmount !== undefined && input.minPledgeAmount.trim() !== "") {
      const minScaled = parseTokenAmount(input.minPledgeAmount);
      if (minScaled === null || minScaled <= 0n) {
        return {
          ok: false,
          error: "minPledgeAmount must be a positive decimal amount",
        };
      }
    }

    const postType: ExclusiveContentPostType =
      input.postType ?? (attachments.length > 0 && !richTextContent ? "FILE" : "RICH_TEXT");

    const explicitTeaser = input.teaser?.trim();
    if (explicitTeaser && explicitTeaser.length > MAX_EXCLUSIVE_TEASER_LENGTH) {
      return {
        ok: false,
        error: `Teaser must be at most ${MAX_EXCLUSIVE_TEASER_LENGTH} characters`,
      };
    }

    const teaser =
      explicitTeaser ||
      (richTextContent
        ? deriveTeaserFromRichText(richTextContent)
        : `Exclusive file pack (${attachments.map((a) => a.fileName).join(", ")}) available to verified backers.`);

    const stored: StoredExclusivePost = {
      id: `exc-${now}-${Math.random().toString(36).slice(2, 8)}`,
      campaignId,
      creatorAddress,
      title,
      teaser,
      postType,
      richTextContent,
      attachments,
      minPledgeAmount: input.minPledgeAmount?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };

    const existing = this.posts.get(campaignId) ?? [];
    this.posts.set(campaignId, [stored, ...existing]);

    return {
      ok: true,
      value: this.toViewPost(stored, true),
    };
  }

  /**
   * Delete an exclusive post. Only the campaign creator may remove posts.
   */
  deletePost(input: {
    campaignId: string;
    postId: string;
    creatorAddress: string;
  }): ExclusiveContentActionResult<{ deleted: boolean }> {
    const campaignId = input.campaignId?.trim();
    const postId = input.postId?.trim();
    const creatorAddress = input.creatorAddress?.trim();

    if (!campaignId || !postId || !creatorAddress) {
      return { ok: false, error: "campaignId, postId, and creatorAddress are required" };
    }

    const registeredCreator = backersService.getCampaignCreator(campaignId);
    if (registeredCreator && !sameAddress(registeredCreator, creatorAddress)) {
      return {
        ok: false,
        error: "Only the campaign creator can delete exclusive content",
      };
    }

    const list = this.posts.get(campaignId) ?? [];
    const post = list.find((entry) => entry.id === postId);
    if (!post) {
      return { ok: false, error: "Exclusive content post not found" };
    }
    if (!sameAddress(post.creatorAddress, creatorAddress) && !sameAddress(registeredCreator, creatorAddress)) {
      return {
        ok: false,
        error: "Only the campaign creator can delete exclusive content",
      };
    }

    const updated = list.filter((entry) => entry.id !== postId);
    this.posts.set(campaignId, updated);
    return { ok: true, value: { deleted: true } };
  }

  hasPosts(campaignId: string): boolean {
    return (this.posts.get(campaignId?.trim() ?? "") ?? []).length > 0;
  }

  /**
   * Return the exclusive content feed for a campaign, gated by the viewer's
   * pledge status.
   */
  getFeed(
    campaignId: string,
    options: GetExclusiveContentOptions = {},
  ): ExclusiveContentFeedResult {
    const id = campaignId?.trim() ?? "";
    const gateStatus = this.checkPledgeStatus(id, options.viewerAddress, {
      creatorAddress: options.creatorAddress,
    });

    const storedList = [...(this.posts.get(id) ?? [])].sort(
      (a, b) => b.createdAt - a.createdAt,
    );

    let unlockedCount = 0;
    let lockedCount = 0;

    const posts = storedList.map((stored) => {
      const postGate = stored.minPledgeAmount
        ? this.checkPledgeStatus(id, options.viewerAddress, {
            creatorAddress: options.creatorAddress,
            minPledgeAmount: stored.minPledgeAmount,
          })
        : gateStatus;

      if (postGate.hasAccess) {
        unlockedCount += 1;
      } else {
        lockedCount += 1;
      }

      return this.toViewPost(stored, postGate.hasAccess);
    });

    return {
      campaignId: id,
      gateStatus,
      posts,
      totalPosts: posts.length,
      unlockedCount,
      lockedCount,
    };
  }

  private toViewPost(stored: StoredExclusivePost, unlocked: boolean): ExclusiveContentPost {
    const attachments: ExclusiveContentAttachment[] = stored.attachments.map((att) => ({
      id: att.id,
      fileName: att.fileName,
      mimeType: att.mimeType,
      fileSizeBytes: att.fileSizeBytes,
      downloadUrl: unlocked ? att.downloadUrl : null,
    }));

    return {
      id: stored.id,
      campaignId: stored.campaignId,
      creatorAddress: stored.creatorAddress,
      title: stored.title,
      teaser: stored.teaser,
      postType: stored.postType,
      richTextContent: unlocked ? stored.richTextContent : null,
      attachments,
      minPledgeAmount: stored.minPledgeAmount,
      createdAt: stored.createdAt,
      updatedAt: stored.updatedAt,
      locked: !unlocked,
    };
  }

  /** Test helper — wipes all stored exclusive content posts. */
  reset(): void {
    this.posts.clear();
  }
}

export const exclusiveContentService = new CampaignExclusiveContentService();

/**
 * Seed initial exclusive content posts for the demo campaign (`camp-101`) so
 * the campaign detail page demonstrates both rich-text updates and downloadable
 * backer-only files out of the box.
 */
export function seedDemoExclusiveContent(
  campaignId: string = DEMO_CAMPAIGN_ID,
): boolean {
  if (campaignId !== DEMO_CAMPAIGN_ID || exclusiveContentService.hasPosts(campaignId)) {
    return false;
  }

  seedDemoBackers(campaignId);
  backersService.registerCampaignCreator(campaignId, DEMO_CREATOR_ADDRESS);

  exclusiveContentService.publishPost(
    {
      campaignId,
      creatorAddress: DEMO_CREATOR_ADDRESS,
      title: "High-Resolution Canopy Lidar & GPS Boundary Dataset",
      teaser:
        "Download the raw Q3 satellite orthomosaic PDF report and verified GeoJSON perimeter coordinates for the 50,000-hectare reserve.",
      postType: "FILE",
      richTextContent:
        "### Q3 Satellite & Lidar Deliverable\n\nVerified backers can download the complete **orthomosaic field report** and **GeoJSON boundary coordinates** captured during the September patrol sweep.",
      attachments: [
        {
          fileName: "amazon-reserve-q3-lidar-report.pdf",
          mimeType: "application/pdf",
          fileSizeBytes: 3_481_600,
          downloadUrl: "/api/reports/campaign/camp-101?attachment=lidar-report.pdf",
        },
        {
          fileName: "north-canopy-corridor-perimeter.geojson",
          mimeType: "application/geo+json",
          fileSizeBytes: 524_288,
          downloadUrl: "data:application/geo+json;charset=utf-8,%7B%22type%22%3A%22FeatureCollection%22%7D",
        },
      ],
    },
    1_768_400_000_000,
  );

  exclusiveContentService.publishPost(
    {
      campaignId,
      creatorAddress: DEMO_CREATOR_ADDRESS,
      title: "Q3 Ranger Patrol & Biodiversity Field Notes",
      teaser:
        "Behind-the-scenes field log from our indigenous guardian teams: camera-trap jaguar sightings, seedling survival rates, and stream disbursement breakdown.",
      postType: "RICH_TEXT",
      richTextContent:
        "### Indigenous Guardian Field Update\n\nOver the past 30 days, our **12 community patrol units** logged **480 verifiable patrol hours** across the northern river corridor:\n\n- **94.2% survival rate** across 1,500 planted mangrove and native canopy saplings\n- **7 camera-trap sightings** of jaguar (*Panthera onca*) and giant river otter families\n- **Zero illegal logging incursions** inside the Stellar-stream-funded boundary zone\n\n> Thank you for backing this reserve — your on-chain pledge directly sustains our field rangers.",
    },
    1_768_500_000_000,
  );

  return true;
}
