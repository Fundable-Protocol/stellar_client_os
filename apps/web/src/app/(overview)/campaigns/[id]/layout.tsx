import type { ReactNode } from "react";
import { generateCampaignShareMetadata } from "@/lib/campaign-share-metadata";

type Props = { params: Promise<{ id: string }> };

/**
 * Applies the creator's SEO overrides (#1222) and dynamic OG cards (#1346).
 */
export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  return generateCampaignShareMetadata(id);
}

export default function CampaignLayout({ children }: { children: ReactNode }) {
  return children;
}
