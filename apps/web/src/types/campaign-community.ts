/**
 * Types for Backer community spaces (Discord/Telegram) — Issue #788
 *
 * Backers who sponsor a campaign get access to per-campaign community
 * spaces. A campaign creator links one or more community spaces (Discord
 * servers, Telegram groups) to the campaign; backers then join them.
 */

export type CommunityPlatform = "DISCORD" | "TELEGRAM";

export type CommunitySpaceVisibility = "PUBLIC" | "BACKERS_ONLY";

export interface CommunitySpace {
  id: string;
  campaignId: string;
  platform: CommunityPlatform;
  /** Human-readable space name, e.g. "Save the Amazon — Discord". */
  name: string;
  /** Invite URL for the space (discord.gg/... or t.me/...). */
  inviteUrl: string;
  /** Optional landing description shown on the join card. */
  description?: string;
  visibility: CommunitySpaceVisibility;
  /** Address that linked the space (campaign creator). */
  linkedBy: string;
  createdAt: number; // timestamp ms
  /** Member count as reported at link time (informational). */
  memberCount?: number;
}

export interface CommunityMembership {
  id: string;
  spaceId: string;
  campaignId: string;
  /** Backer Stellar address that joined. */
  memberAddress: string;
  platform: CommunityPlatform;
  joinedAt: number; // timestamp ms
}

export interface CreateCommunitySpaceInput {
  campaignId: string;
  platform: CommunityPlatform;
  name: string;
  inviteUrl: string;
  description?: string;
  visibility?: CommunitySpaceVisibility;
  linkedBy: string;
  memberCount?: number;
}

export interface JoinCommunityInput {
  spaceId: string;
  memberAddress: string;
}

/** Platform metadata used by UI + validation (display name, URL check, icon key). */
export const COMMUNITY_PLATFORMS: Record<
  CommunityPlatform,
  { label: string; urlPattern: RegExp; urlHint: string }
> = {
  DISCORD: {
    label: "Discord",
    urlPattern: /^https:\/\/(discord\.gg|discord\.com\/invite)\/[\w-]+$/,
    urlHint: "https://discord.gg/...",
  },
  TELEGRAM: {
    label: "Telegram",
    urlPattern: /^https:\/\/t\.me\/[\w-]+$/,
    urlHint: "https://t.me/...",
  },
};

export function validateCommunityInviteUrl(
  platform: CommunityPlatform,
  url: string
): boolean {
  return COMMUNITY_PLATFORMS[platform].urlPattern.test(url.trim());
}
