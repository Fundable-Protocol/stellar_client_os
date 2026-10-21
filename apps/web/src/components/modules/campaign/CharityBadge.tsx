"use client";

import React, { useEffect, useState } from "react";
import { BadgeCheck } from "lucide-react";
import type { CampaignCharityBadge, CharityBadgeType } from "@/services/campaign.service";

const LABELS: Record<CharityBadgeType, string> = {
  TAX_EXEMPT: "Tax-Exempt",
  CHARITY_VERIFIED: "Charity Verified",
};

/** Badge pill; clicking opens the supporting documentation in a new tab. */
export function CharityBadge({ badge }: { badge?: Pick<CampaignCharityBadge, "type" | "documentationUrl"> | null }) {
  if (!badge || !LABELS[badge.type]) return null;
  const label = LABELS[badge.type];
  return (
    <a
      href={badge.documentationUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${label} - view supporting documentation`}
      title="View supporting documentation"
      data-testid="charity-badge"
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-sky-500/40 bg-sky-950/40 px-2 py-0.5 text-[10px] font-semibold text-sky-300 hover:border-sky-400 hover:text-sky-200"
    >
      <BadgeCheck className="h-3 w-3" aria-hidden="true" />
      {label}
    </a>
  );
}

/** Loads a campaign's badge from the public API and renders it (nothing when absent). */
export function CampaignCharityBadge({ campaignId }: { campaignId: string }) {
  const [badge, setBadge] = useState<CampaignCharityBadge | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/charity-badge`);
        if (!res?.ok) return;
        const data = await res.json();
        if (!cancelled) setBadge(data?.charityBadge ?? null);
      } catch {
        // The badge is optional; failing to load it must not affect the page.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  return <CharityBadge badge={badge} />;
}
