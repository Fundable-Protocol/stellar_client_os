"use client";

import { useCallback, useState } from "react";
import {
  CampaignFollow,
  DEFAULT_FOLLOW_PREFS,
  FollowNotificationPrefs,
} from "@/types/campaign-follow";
import { followService } from "@/services/campaign-follow.service";

export interface UseCampaignFollowOptions {
  campaignId: string;
  currentUserAddress?: string;
}

/**
 * Campaign follows — Issue #942 (v1).
 * Mirrors the community hook pattern: read-through from the in-memory
 * service, mutation helpers refresh local state after mutation.
 */
export function useCampaignFollow({
  campaignId,
  currentUserAddress = "GD6W...X892",
}: UseCampaignFollowOptions) {
  const [prevCampaignId, setPrevCampaignId] = useState(campaignId);
  const [follows, setFollows] = useState<CampaignFollow[]>(() => [
    ...followService.getFollows(campaignId),
  ]);

  if (prevCampaignId !== campaignId) {
    setPrevCampaignId(campaignId);
    setFollows([...followService.getFollows(campaignId)]);
  }

  const reloadData = useCallback(() => {
    setFollows([...followService.getFollows(campaignId)]);
  }, [campaignId]);

  const isFollowing = useCallback(
    () => followService.isFollowing(campaignId, currentUserAddress),
    [campaignId, currentUserAddress]
  );

  const getFollow = useCallback(
    (): CampaignFollow | null =>
      followService.getFollow(campaignId, currentUserAddress),
    [campaignId, currentUserAddress]
  );

  const followerCount = follows.length;

  const follow = useCallback(
    (prefs?: Partial<FollowNotificationPrefs>) => {
      try {
        const result = followService.follow({
          campaignId,
          followerAddress: currentUserAddress,
          prefs,
        });
        reloadData();
        return { ok: true as const, follow: result };
      } catch (err) {
        return {
          ok: false as const,
          error: err instanceof Error ? err.message : "Failed to follow campaign",
        };
      }
    },
    [campaignId, currentUserAddress, reloadData]
  );

  const updatePrefs = useCallback(
    (prefs: Partial<FollowNotificationPrefs>) => {
      const result = followService.updatePrefs(
        campaignId,
        currentUserAddress,
        prefs
      );
      reloadData();
      return result
        ? { ok: true as const, follow: result }
        : { ok: false as const, error: "Follow not found" };
    },
    [campaignId, currentUserAddress, reloadData]
  );

  const unfollow = useCallback(() => {
    const removed = followService.unfollow(campaignId, currentUserAddress);
    reloadData();
    return removed;
  }, [campaignId, currentUserAddress, reloadData]);

  return {
    follows,
    followerCount,
    isFollowing,
    getFollow,
    follow,
    updatePrefs,
    unfollow,
    reloadData,
    defaultPrefs: DEFAULT_FOLLOW_PREFS,
  };
}
