import type { ReactNode } from "react";
import { generateCampaignShareMetadata } from "@/lib/campaign-share-metadata";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  return generateCampaignShareMetadata(id);
}

export default function CampaignPublicLayout({ children }: { children: ReactNode }) {
  return children;
}
