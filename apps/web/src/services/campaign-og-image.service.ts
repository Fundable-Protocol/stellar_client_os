import {
  computeFundedPercent,
  creatorAvatarFallback,
  formatDaysLeftLabel,
  type CampaignOgMetrics,
} from "@/lib/campaign-og";

interface CampaignApiRecord {
  name: string;
  creator: string;
  raisedAmount: string;
  goalAmount: string;
  deadline?: number;
}

interface PortfolioApiRecord {
  displayName?: string;
  profileImageUrl?: string;
}

function requestOrigin(request: Request): string {
  return process.env.NEXT_PUBLIC_URL ?? new URL(request.url).origin;
}

function normalizeAvatarUrl(url: string, creator: string): string {
  if (url.includes("dicebear.com") && url.includes("/svg?")) {
    return url.replace("/svg?", "/png?");
  }
  return url || creatorAvatarFallback(creator);
}

/**
 * Loads live campaign metrics for OG rendering via internal APIs (edge-safe).
 */
export async function loadCampaignOgMetrics(request: Request, campaignId: string): Promise<CampaignOgMetrics | null> {
  const origin = requestOrigin(request);
  const campaignRes = await fetch(`${origin}/api/campaigns/${encodeURIComponent(campaignId)}`, {
    cache: "no-store",
  });
  if (!campaignRes.ok) return null;

  const campaign = (await campaignRes.json()) as CampaignApiRecord;
  const portfolioRes = await fetch(`${origin}/api/creators/${encodeURIComponent(campaign.creator)}/portfolio`, {
    cache: "no-store",
  });
  const portfolio = portfolioRes.ok ? ((await portfolioRes.json()) as PortfolioApiRecord) : null;

  return {
    title: campaign.name,
    creatorName: portfolio?.displayName ?? `Creator ${campaign.creator.slice(0, 8)}`,
    creatorAvatarUrl: normalizeAvatarUrl(portfolio?.profileImageUrl ?? "", campaign.creator),
    fundedPercent: computeFundedPercent(campaign.raisedAmount, campaign.goalAmount),
    daysLeftLabel: formatDaysLeftLabel(campaign.deadline),
    raisedAmount: campaign.raisedAmount,
    goalAmount: campaign.goalAmount,
  };
}
