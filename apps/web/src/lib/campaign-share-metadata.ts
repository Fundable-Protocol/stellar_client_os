import type { Metadata } from "next";
import { campaignOgImageUrl } from "@/lib/campaign-og";
import { resolveCampaignSeo } from "@/lib/campaign-seo";
import { getCampaign } from "@/services/campaign.service";
import { campaignSeoService } from "@/services/campaign-seo.service";

/**
 * Shared Open Graph / Twitter metadata for campaign detail routes (#1346).
 * Creator SEO image overrides win; otherwise a dynamic 1200×630 card is used.
 */
export async function generateCampaignShareMetadata(campaignId: string): Promise<Metadata> {
  const campaign = await getCampaign(campaignId).catch(() => null);
  const seo = campaignSeoService.getSeo(campaignId);
  if (!campaign && !seo) return {};

  const resolved = resolveCampaignSeo(seo, {
    name: campaign?.name ?? "Fundable campaign",
    description: campaign?.description,
  });

  const dynamicOg = campaign ? campaignOgImageUrl(campaignId) : undefined;
  const ogImageUrl = resolved.ogImageUrl ?? dynamicOg;
  const images = ogImageUrl ? [{ url: ogImageUrl, width: 1200, height: 630, alt: resolved.title }] : undefined;

  return {
    title: resolved.title,
    description: resolved.description,
    openGraph: {
      title: resolved.title,
      description: resolved.description,
      type: "website",
      images,
    },
    twitter: {
      card: images ? "summary_large_image" : "summary",
      title: resolved.title,
      description: resolved.description,
      images: ogImageUrl ? [ogImageUrl] : undefined,
    },
  };
}
