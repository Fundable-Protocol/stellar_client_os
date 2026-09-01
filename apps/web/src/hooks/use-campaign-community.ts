"use client";

import { useState, useCallback, useEffect } from "react";
import {
  CommunitySpace,
  CommunityMembership,
  CreateCommunitySpaceInput,
} from "@/types/campaign-community";
import { communityService } from "@/services/campaign-community.service";

export interface UseCampaignCommunityOptions {
  campaignId: string;
  currentUserAddress?: string;
}

/**
 * Backer community spaces (Discord/Telegram) — Issue #788.
 * Mirrors the collaboration hook pattern: read-through from the in-memory
 * service on mount, mutation helpers refresh local state after mutation.
 */
export function useCampaignCommunity({
  campaignId,
  currentUserAddress = "GD6W...X892",
}: UseCampaignCommunityOptions) {
  const [spaces, setSpaces] = useState<CommunitySpace[]>([]);
  const [memberships, setMemberships] = useState<CommunityMembership[]>([]);

  const reloadData = useCallback(() => {
    setSpaces([...communityService.getSpaces(campaignId)]);
    setMemberships([...communityService.getMemberships(campaignId)]);
  }, [campaignId]);

  useEffect(() => {
    reloadData();
  }, [reloadData]);

  const createSpace = useCallback(
    (input: Omit<CreateCommunitySpaceInput, "campaignId" | "linkedBy">) => {
      try {
        const space = communityService.createSpace({
          ...input,
          campaignId,
          linkedBy: currentUserAddress,
        });
        reloadData();
        return { ok: true as const, space };
      } catch (err) {
        return {
          ok: false as const,
          error: err instanceof Error ? err.message : "Failed to link community space",
        };
      }
    },
    [campaignId, currentUserAddress, reloadData]
  );

  const removeSpace = useCallback(
    (spaceId: string) => {
      communityService.removeSpace(campaignId, spaceId);
      reloadData();
    },
    [campaignId, reloadData]
  );

  const joinSpace = useCallback(
    (spaceId: string) => {
      const result = communityService.joinSpace({ spaceId, memberAddress: currentUserAddress });
      reloadData();
      return result;
    },
    [currentUserAddress, reloadData]
  );

  const leaveSpace = useCallback(
    (spaceId: string) => {
      communityService.leaveSpace(spaceId, currentUserAddress);
      reloadData();
    },
    [currentUserAddress, reloadData]
  );

  const hasJoined = useCallback(
    (spaceId: string) =>
      communityService.hasJoined(spaceId, currentUserAddress),
    [currentUserAddress]
  );

  return {
    spaces,
    memberships,
    createSpace,
    removeSpace,
    joinSpace,
    leaveSpace,
    hasJoined,
    reloadData,
  };
}
