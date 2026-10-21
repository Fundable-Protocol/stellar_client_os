"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { CampaignARVisualizer } from "@/components/modules/campaign/ar/CampaignARVisualizer";

export default function CampaignARPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;
  const router = useRouter();

  // Default / fallback campaign metadata for direct AR view
  const campaign = {
    id: id || "camp-101",
    title: "Save the Amazon RainForest Reserve",
    treeType: "Oak",
    treesPlanted: 1500,
    location: "Amazon Basin, Brazil",
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black">
      <CampaignARVisualizer
        campaignId={campaign.id}
        campaignTitle={campaign.title}
        treeType={campaign.treeType}
        treesPlanted={campaign.treesPlanted}
        location={campaign.location}
        onClose={() => {
          router.push(`/campaigns/${campaign.id}/carbon-credits`);
        }}
      />
    </div>
  );
}
