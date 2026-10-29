"use client";

import { useEffect } from "react";
import { saveOfflineCampaign } from "@/lib/offline-campaigns";

export function OfflineCampaignCache({ campaign }: { campaign: unknown }) {
  useEffect(() => {
    void saveOfflineCampaign(campaign).catch(() => {
      // Offline storage is an enhancement; it must not interrupt campaign viewing.
    });
  }, [campaign]);

  return null;
}
