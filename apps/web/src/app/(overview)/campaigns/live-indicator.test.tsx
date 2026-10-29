import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/components/modules/campaign/success-stories/SuccessStories", () => ({
  default: () => <div data-testid="mock-success-stories">Success Stories</div>,
}));

// jsdom has no layout, so the real virtualiser produces zero visible rows.
// Stub it to render every row the page asks for.
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (options: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: options.count }, (_, index) => ({
        key: index,
        index,
        start: index * 280,
        end: index * 280 + 280,
        size: 280,
      })),
    getTotalSize: () => options.count * 280,
    measureElement: () => undefined,
  }),
}));

const baseCampaign = {
  id: "camp-live-1",
  title: "Campaign that is streaming",
  category: "Environmental & Reforestation",
  raisedAmount: "10,000",
  goalAmount: "50,000",
  token: "XLM",
  sponsorCount: 3,
  collaboratorCount: 0,
  status: "ACTIVE",
  description: "A campaign with a live broadcast.",
};

vi.mock("@/hooks/use-campaigns", () => ({
  useCampaigns: () => ({
    campaigns: [
      { ...baseCampaign, streamStatus: "live" },
      { ...baseCampaign, id: "camp-live-2", title: "Campaign that is offline", streamStatus: "offline" },
      { ...baseCampaign, id: "camp-live-3", title: "Campaign with unknown status", streamStatus: "unknown" },
      { ...baseCampaign, id: "camp-live-4", title: "Campaign without a stream" },
    ],
    isLoading: false,
    hasMore: false,
  }),
}));

import CampaignsDirectoryPage from "./page";

describe("campaign cards live indicator (issue #1225)", () => {
  // The directory page tree is heavy; renders can exceed the default 5s
  // timeout when the suite runs alongside the other feature tests.
  it("shows the live badge only when the provider confirmed the stream is live", () => {
    render(<CampaignsDirectoryPage />);

    const badges = screen.getAllByTestId("live-stream-badge");
    expect(badges).toHaveLength(1);

    const cardContaining = (title: string) => {
      const heading = screen.getByRole("heading", { level: 3, name: title });
      return heading.parentElement?.querySelector('[data-testid="live-stream-badge"]') ?? null;
    };

    expect(cardContaining("Campaign that is streaming")).not.toBeNull();
    expect(cardContaining("Campaign that is offline")).toBeNull();
    expect(cardContaining("Campaign with unknown status")).toBeNull();
    expect(cardContaining("Campaign without a stream")).toBeNull();
  }, 30_000);
});
