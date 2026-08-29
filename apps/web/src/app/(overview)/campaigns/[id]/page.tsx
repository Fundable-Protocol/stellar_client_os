import React from "react";
import CampaignDetail from "@/components/modules/campaigns/CampaignDetail";

export const metadata = {
  title: "Campaign Detail | Stellar Client OS",
  description: "View live tree planted ticker counter and goal progress bar for funding campaign.",
};

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function CampaignDetailPage({ params }: PageProps) {
  const resolvedParams = await params;
  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      <CampaignDetail campaignId={resolvedParams.id} />
    </div>
  );
}
