"use client";

import { useEffect } from "react";
import { useWallet } from "@/providers/StellarWalletProvider";
import { recordCampaignView } from "@/lib/campaign-recommendation-preferences";

export function CampaignViewTracker({ campaignId }: { campaignId: string }) {
  const { address } = useWallet();

  useEffect(() => {
    if (address) recordCampaignView(address, campaignId);
  }, [address, campaignId]);

  return null;
}
