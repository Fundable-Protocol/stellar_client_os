import type { Metadata } from "next";
import type { ReactNode } from "react";
import { resolveCampaignSeo } from "@/lib/campaign-seo";
import { getCampaign } from "@/services/campaign.service";
import { campaignSeoService } from "@/services/campaign-seo.service";

type Props = { params: Promise<{ id: string }> };

/**
 * Applies the creator's SEO overrides (#1222) to the campaign page <head>:
 * title tag, meta description and Open Graph / Twitter card image.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const campaign = await getCampaign(id).catch(() => null);
  const seo = campaignSeoService.getSeo(id);
  if (!campaign && !seo) return {};

  const resolved = resolveCampaignSeo(seo, {
    name: campaign?.name ?? "Fundable campaign",
    description: campaign?.description,
  });
  const images = resolved.ogImageUrl ? [{ url: resolved.ogImageUrl }] : undefined;

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
      images: resolved.ogImageUrl ? [resolved.ogImageUrl] : undefined,
    },
  };
}

export default function CampaignLayout({ children }: { children: ReactNode }) {
  return children;
}
