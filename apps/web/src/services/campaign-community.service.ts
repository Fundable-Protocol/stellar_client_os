import {
  CommunityMembership,
  CommunityPlatform,
  CommunitySpace,
  CreateCommunitySpaceInput,
  JoinCommunityInput,
  COMMUNITY_PLATFORMS,
  validateCommunityInviteUrl,
} from "@/types/campaign-community";

/**
 * Backer community spaces (Discord/Telegram) — Issue #788.
 *
 * Campaign creators link community spaces to a campaign; backers join them.
 * Mirrors the in-memory singleton pattern of campaign-collaboration.service
 * until a persistent data source lands.
 */
class CampaignCommunityService {
  private spaces = new Map<string, CommunitySpace[]>();
  private memberships = new Map<string, CommunityMembership[]>();

  getSpaces(campaignId: string): CommunitySpace[] {
    return this.spaces.get(campaignId) || [];
  }

  getMemberships(campaignId: string): CommunityMembership[] {
    return this.memberships.get(campaignId) || [];
  }

  getMembershipsForSpace(spaceId: string): CommunityMembership[] {
    return this.getMembershipsForSpaceInternal(spaceId);
  }

  private getMembershipsForSpaceInternal(spaceId: string): CommunityMembership[] {
    for (const list of this.memberships.values()) {
      const hit = list.filter((m) => m.spaceId === spaceId);
      if (hit.length) return hit;
    }
    return [];
  }

  createSpace(input: CreateCommunitySpaceInput): CommunitySpace {
    if (!input.campaignId) throw new Error("campaignId is required");
    if (!input.name?.trim()) throw new Error("Space name is required");
    if (!COMMUNITY_PLATFORMS[input.platform]) throw new Error(`Unknown platform: ${input.platform}`);
    if (!validateCommunityInviteUrl(input.platform, input.inviteUrl ?? "")) {
      throw new Error(
        `Invalid ${COMMUNITY_PLATFORMS[input.platform].label} invite URL (expected ${COMMUNITY_PLATFORMS[input.platform].urlHint})`
      );
    }

    const space: CommunitySpace = {
      id: `space-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      campaignId: input.campaignId,
      platform: input.platform,
      name: input.name.trim(),
      inviteUrl: input.inviteUrl.trim(),
      description: input.description?.trim() || undefined,
      visibility: input.visibility ?? "BACKERS_ONLY",
      linkedBy: input.linkedBy,
      createdAt: Date.now(),
      memberCount: input.memberCount,
    };

    const list = this.spaces.get(input.campaignId) || [];
    // One space per platform per campaign: relinking replaces the old link.
    const updated = list.filter((s) => s.platform !== input.platform);
    updated.push(space);
    this.spaces.set(input.campaignId, updated);
    return space;
  }

  removeSpace(campaignId: string, spaceId: string): boolean {
    const list = this.spaces.get(campaignId) || [];
    const updated = list.filter((s) => s.id !== spaceId);
    this.spaces.set(campaignId, updated);
    return updated.length !== list.length;
  }

  joinSpace(input: JoinCommunityInput): { success: boolean; membership?: CommunityMembership; error?: string } {
    const space = this.findSpace(input.spaceId);
    if (!space) return { success: false, error: "Community space not found." };

    const list = this.memberships.get(space.campaignId) || [];
    const existing = list.find(
      (m) => m.spaceId === input.spaceId && m.memberAddress.toLowerCase() === input.memberAddress.toLowerCase()
    );
    if (existing) return { success: true, membership: existing };

    const membership: CommunityMembership = {
      id: `mem-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      spaceId: space.id,
      campaignId: space.campaignId,
      memberAddress: input.memberAddress,
      platform: space.platform,
      joinedAt: Date.now(),
    };
    list.push(membership);
    this.memberships.set(space.campaignId, list);
    return { success: true, membership };
  }

  leaveSpace(spaceId: string, memberAddress: string): boolean {
    for (const [campaignId, list] of this.memberships.entries()) {
      const updated = list.filter(
        (m) =>
          !(
            m.spaceId === spaceId &&
            m.memberAddress.toLowerCase() === memberAddress.toLowerCase()
          )
      );
      if (updated.length !== list.length) {
        this.memberships.set(campaignId, updated);
        return true;
      }
    }
    return false;
  }

  hasJoined(spaceId: string, memberAddress: string): boolean {
    return this.getMembershipsForSpaceInternal(spaceId).some(
      (m) => m.memberAddress.toLowerCase() === memberAddress.toLowerCase()
    );
  }

  private findSpace(spaceId: string): CommunitySpace | null {
    for (const list of this.spaces.values()) {
      const hit = list.find((s) => s.id === spaceId);
      if (hit) return hit;
    }
    return null;
  }
}

export const communityService = new CampaignCommunityService();
