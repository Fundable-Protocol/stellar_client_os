"use client";

import { useCallback, useState } from "react";
import {
  BackerPrivacyPreference,
  BackerVisibility,
  TOP_BACKERS_LIMIT,
  TopBackersResult,
} from "@/types/campaign-backers";
import { backersService, seedDemoBackers } from "@/services/campaign-backers.service";

export interface UseTopBackersOptions {
  campaignId: string;
  /** Address of the person viewing the page. */
  viewerAddress?: string;
  /** Campaign creator address — creators may feature backers. */
  creatorAddress?: string;
  limit?: number;
  /** Seed the mock campaign's demo backers (campaign detail page demo data). */
  seedDemoData?: boolean;
}

const sameAddress = (a?: string, b?: string) =>
  Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());

/**
 * Top backers leaderboard — ranks a campaign's backers by total contribution,
 * lets the creator feature up to a handful of them, and applies each backer's
 * privacy preference before anything reaches the UI.
 */
export function useTopBackers({
  campaignId,
  viewerAddress,
  creatorAddress,
  limit = TOP_BACKERS_LIMIT,
  seedDemoData = true,
}: UseTopBackersOptions) {
  const [prevCampaignId, setPrevCampaignId] = useState(campaignId);
  const [error, setError] = useState<string | null>(null);

  const loadResult = useCallback((): TopBackersResult => {
    if (seedDemoData) seedDemoBackers(campaignId);
    return backersService.getTopBackers(campaignId, { limit, viewerAddress, creatorAddress });
  }, [campaignId, limit, viewerAddress, creatorAddress, seedDemoData]);

  const [result, setResult] = useState<TopBackersResult>(loadResult);

  if (prevCampaignId !== campaignId) {
    setPrevCampaignId(campaignId);
    setResult(loadResult());
    setError(null);
  }

  // Refresh the leaderboard without touching the current error banner — the
  // caller decides whether an action succeeded.
  const reload = useCallback(() => {
    setResult(loadResult());
  }, [loadResult]);

  const creator = creatorAddress ?? backersService.getCampaignCreator(campaignId) ?? undefined;
  const isCreator = sameAddress(viewerAddress, creator);

  const toggleFeatured = useCallback(
    (backerAddress: string, note?: string) => {
      if (!viewerAddress) {
        const message = "Connect your wallet to feature backers";
        setError(message);
        return { ok: false as const, error: message };
      }

      const outcome = backersService.toggleFeatured({
        campaignId,
        backerAddress,
        featuredBy: viewerAddress,
        campaignCreator: creator,
        note,
      });
      setError(outcome.ok ? null : outcome.error);
      reload();
      return outcome;
    },
    [campaignId, viewerAddress, creator, reload],
  );

  const setPrivacy = useCallback(
    (
      backerAddress: string,
      update: { visibility?: BackerVisibility; showAmount?: boolean; allowFeaturing?: boolean },
    ) => {
      try {
        const outcome = backersService.setPrivacyPreference({
          campaignId,
          backerAddress,
          ...update,
        });
        setError(null);
        reload();
        return { ok: true as const, ...outcome };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to update privacy preference";
        setError(message);
        return { ok: false as const, error: message };
      }
    },
    [campaignId, reload],
  );

  // Match on the service's `isSelf` flag rather than the address: an anonymous
  // row has its address redacted, so address matching would lose the viewer's
  // own entry (and with it their privacy controls).
  const myEntry = result.backers.find((entry) => entry.isSelf);

  const myPrivacy: BackerPrivacyPreference | undefined = viewerAddress
    ? backersService.getPrivacyPreference(campaignId, viewerAddress)
    : undefined;

  return {
    result,
    backers: result.backers,
    totalBackers: result.totalBackers,
    privateBackers: result.privateBackers,
    totalAmount: result.totalAmount,
    featuredCount: result.featuredCount,
    isCreator,
    creatorAddress: creator,
    myEntry,
    myPrivacy,
    error,
    toggleFeatured,
    setPrivacy,
    reload,
  };
}
