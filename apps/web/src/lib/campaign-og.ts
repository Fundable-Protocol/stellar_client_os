/** Cache TTL for generated campaign OG images (5 minutes). */
export const CAMPAIGN_OG_CACHE_SECONDS = 300;

export interface CampaignOgMetrics {
  title: string;
  creatorName: string;
  creatorAvatarUrl: string;
  fundedPercent: number;
  daysLeftLabel: string;
  raisedAmount: string;
  goalAmount: string;
}

export function getSiteOrigin(): string {
  return process.env.NEXT_PUBLIC_URL ?? "https://fundable.network";
}

export function campaignOgImagePath(campaignId: string): string {
  return `/api/og/campaign/${encodeURIComponent(campaignId)}`;
}

export function campaignOgImageUrl(campaignId: string, origin = getSiteOrigin()): string {
  return new URL(campaignOgImagePath(campaignId), origin).toString();
}

export function computeFundedPercent(raisedAmount: string, goalAmount: string): number {
  const goal = BigInt(goalAmount || "0");
  if (goal <= 0n) return 0;
  const raised = BigInt(raisedAmount || "0");
  const basisPoints = Number((raised * 10000n) / goal);
  return Math.min(100, Math.round(basisPoints / 10) / 10);
}

export function formatDaysLeftLabel(deadline?: number, now = Date.now()): string {
  if (!deadline) return "Open campaign";
  const remainingMs = deadline - now;
  if (remainingMs <= 0) return "Campaign ended";
  const days = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
  if (days === 1) return "1 day left";
  return `${days} days left`;
}

export function creatorAvatarFallback(creatorAddress: string): string {
  const seed = encodeURIComponent(creatorAddress.trim().toLowerCase());
  return `https://api.dicebear.com/7.x/avataaars/png?seed=${seed}`;
}
