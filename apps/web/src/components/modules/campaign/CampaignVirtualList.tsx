"use client";

import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

export interface VirtualCampaignItem {
  id: string;
  title: string;
  description?: string;
  location?: string;
  species?: string[];
  raisedAmount: string;
  goalAmount: string;
  sponsorCount: number;
  category?: string;
  token?: string;
  collaboratorCount?: number;
  status?: string;
}

interface CampaignVirtualListProps {
  campaigns: VirtualCampaignItem[];
  renderCampaign: (campaign: VirtualCampaignItem) => React.ReactNode;
}

/**
 * Windowed campaign list. Only visible rows are mounted, so a discovery result
 * containing thousands of campaigns does not create thousands of DOM nodes.
 */
export function CampaignVirtualList({ campaigns, renderCampaign }: CampaignVirtualListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: campaigns.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 190,
    overscan: 6,
  });

  return (
    <div ref={parentRef} className="max-h-[70vh] overflow-auto" aria-label="Campaign results">
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((item) => {
          const campaign = campaigns[item.index];
          return (
            <div
              key={campaign.id}
              data-index={item.index}
              ref={virtualizer.measureElement}
              className="absolute left-0 top-0 w-full pb-4"
              style={{ transform: `translateY(${item.start}px)` }}
            >
              {renderCampaign(campaign)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
