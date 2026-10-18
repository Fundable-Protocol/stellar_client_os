import { notFound } from "next/navigation";
import { getCampaign } from "@/services/campaign.service";
import { CampaignRefundQueue } from "@/components/modules/campaign/refunds/CampaignRefundQueue";

export const runtime = "nodejs";

export default async function CampaignRefundRequestsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) notFound();
  return <CampaignRefundQueue campaignId={campaign.id} campaignName={campaign.name} />;
}
