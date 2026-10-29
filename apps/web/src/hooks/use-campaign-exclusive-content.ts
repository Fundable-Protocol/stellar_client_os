"use client";

import { useCallback, useState } from "react";
import {
  CreateExclusiveContentInput,
  ExclusiveContentFeedResult,
} from "@/types/campaign-exclusive-content";
import {
  exclusiveContentService,
  seedDemoExclusiveContent,
} from "@/services/campaign-exclusive-content.service";
import { backersService } from "@/services/campaign-backers.service";

export interface UseCampaignExclusiveContentOptions {
  campaignId: string;
  viewerAddress?: string;
  creatorAddress?: string;
  seedDemoData?: boolean;
}

const sameAddress = (a?: string, b?: string) =>
  Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());

/**
 * Hook for reading and managing a campaign's backer-only exclusive content
 * area (#1267). Evaluates the pledge gate for `viewerAddress` and exposes
 * creator publishing and deletion helpers.
 */
export function useCampaignExclusiveContent({
  campaignId,
  viewerAddress,
  creatorAddress,
  seedDemoData = true,
}: UseCampaignExclusiveContentOptions) {
  const [prevKey, setPrevKey] = useState(`${campaignId}:${viewerAddress ?? ""}:${creatorAddress ?? ""}`);
  const [error, setError] = useState<string | null>(null);

  const loadFeed = useCallback((): ExclusiveContentFeedResult => {
    if (seedDemoData) seedDemoExclusiveContent(campaignId);
    return exclusiveContentService.getFeed(campaignId, {
      viewerAddress,
      creatorAddress,
    });
  }, [campaignId, viewerAddress, creatorAddress, seedDemoData]);

  const [feed, setFeed] = useState<ExclusiveContentFeedResult>(loadFeed);

  const currentKey = `${campaignId}:${viewerAddress ?? ""}:${creatorAddress ?? ""}`;
  if (prevKey !== currentKey) {
    setPrevKey(currentKey);
    setFeed(loadFeed());
    setError(null);
  }

  const reload = useCallback(() => {
    setFeed(loadFeed());
  }, [loadFeed]);

  const resolvedCreator =
    creatorAddress ?? backersService.getCampaignCreator(campaignId) ?? undefined;
  const isCreator = sameAddress(viewerAddress, resolvedCreator);

  const publishPost = useCallback(
    (input: Omit<CreateExclusiveContentInput, "campaignId" | "creatorAddress">) => {
      const actingCreator = viewerAddress ?? resolvedCreator;
      if (!actingCreator) {
        const message = "Connect your creator wallet to publish exclusive content";
        setError(message);
        return { ok: false as const, error: message };
      }

      const outcome = exclusiveContentService.publishPost({
        ...input,
        campaignId,
        creatorAddress: actingCreator,
      });
      setError(outcome.ok ? null : outcome.error);
      reload();
      return outcome;
    },
    [campaignId, viewerAddress, resolvedCreator, reload],
  );

  const deletePost = useCallback(
    (postId: string) => {
      const actingCreator = viewerAddress ?? resolvedCreator;
      if (!actingCreator) {
        const message = "Connect your creator wallet to delete exclusive content";
        setError(message);
        return { ok: false as const, error: message };
      }

      const outcome = exclusiveContentService.deletePost({
        campaignId,
        postId,
        creatorAddress: actingCreator,
      });
      setError(outcome.ok ? null : outcome.error);
      reload();
      return outcome;
    },
    [campaignId, viewerAddress, resolvedCreator, reload],
  );

  return {
    feed,
    posts: feed.posts,
    gateStatus: feed.gateStatus,
    totalPosts: feed.totalPosts,
    unlockedCount: feed.unlockedCount,
    lockedCount: feed.lockedCount,
    isCreator,
    creatorAddress: resolvedCreator,
    error,
    publishPost,
    deletePost,
    reload,
  };
}
