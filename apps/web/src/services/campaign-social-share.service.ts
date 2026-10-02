import type { CampaignRecord } from "./campaign.service";

export interface CampaignSocialShareLinks {
  campaignId: string;
  campaignUrl: string;
  message: string;
  links: {
    twitter: string;
    facebook: string;
  };
  impact: {
    treeCount: number;
    co2Sequestration: string | null;
  };
}

function formatCo2Impact(value: string | undefined): string {
  if (
    value === undefined ||
    !/^\d+(?:\.\d+)?$/.test(value) ||
    !Number.isFinite(Number(value))
  ) {
    return "CO₂ impact not yet reported";
  }

  const tonnes = new Intl.NumberFormat("en", {
    maximumFractionDigits: 2,
  }).format(Number(value));
  return `${tonnes} metric tonnes of CO₂ sequestered`;
}

/** Build public Twitter and Facebook share intents from the current campaign data. */
export function buildCampaignSocialShareLinks(
  campaign: Pick<
    CampaignRecord,
    "id" | "name" | "treeCount" | "co2Sequestration"
  >,
  origin: string,
): CampaignSocialShareLinks {
  const campaignUrl = new URL(
    `/campaigns/${encodeURIComponent(campaign.id)}`,
    origin,
  ).toString();
  const treeCount =
    Number.isSafeInteger(campaign.treeCount) && campaign.treeCount >= 0
      ? campaign.treeCount
      : 0;
  const message = `Support “${campaign.name}”! ${treeCount.toLocaleString("en")} trees planted; ${formatCo2Impact(campaign.co2Sequestration)}. Sponsor this campaign and help grow the impact!`;

  const twitterParams = new URLSearchParams({
    text: message,
    url: campaignUrl,
  });
  const facebookParams = new URLSearchParams({
    u: campaignUrl,
    quote: message,
  });

  return {
    campaignId: campaign.id,
    campaignUrl,
    message,
    links: {
      twitter: `https://twitter.com/intent/tweet?${twitterParams.toString()}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?${facebookParams.toString()}`,
    },
    impact: {
      treeCount,
      co2Sequestration: campaign.co2Sequestration ?? null,
    },
  };
}
