/**
 * Campaign authorization helpers.
 *
 * The web app has no session layer: a viewer's identity is the Stellar address
 * of the connected wallet. Creator-only campaign routes therefore compare the
 * address supplied by the caller with the campaign's recorded creator.
 *
 * When a campaign is not present in the campaign data source (demo/mock
 * campaigns that only exist in the UI) there is nothing to compare against, so
 * the check is skipped and a warning is logged. Campaigns that *do* exist are
 * always enforced.
 */

import { getCampaign } from "@/services/campaign.service";

export interface AuthorizationResult {
  ok: boolean;
  status: number;
  error?: string;
}

/** Resolve the creator address of a campaign, if the campaign is indexed. */
export async function resolveCampaignCreator(
  campaignId: string,
): Promise<string | undefined> {
  const campaign = await getCampaign(campaignId);
  return campaign?.creator;
}

/** Case-insensitive address comparison. */
export function sameAddress(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Authorize an action that only the campaign creator may perform.
 *
 * Returns `{ ok: true }` when the actor is the creator, and an error result
 * with the matching HTTP status otherwise (401 when no actor was supplied,
 * 403 when the actor is not the creator).
 */
export async function authorizeCampaignCreator(
  campaignId: string,
  actor: string | undefined | null,
): Promise<AuthorizationResult> {
  if (!actor?.trim()) {
    return { ok: false, status: 401, error: "A creator address is required." };
  }

  const creator = await resolveCampaignCreator(campaignId);
  if (!creator) {
    // The campaign is not indexed (demo data): fall through and allow, but make
    // the gap visible in the server log.
    console.warn(
      `[campaign-authorization] Campaign "${campaignId}" is not indexed; skipping creator check.`,
    );
    return { ok: true };
  }

  if (!sameAddress(creator, actor)) {
    return {
      ok: false,
      status: 403,
      error: "Only the campaign creator may perform this action.",
    };
  }

  return { ok: true };
}
