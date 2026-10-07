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
        end: (index + 1) * 280,
        size: 280,
      })),
    getTotalSize: () => options.count * 280,
    measureElement: () => undefined,
  }),
}));

import CampaignsDirectoryPage from "./page";

describe("CampaignsDirectoryPage", () => {
  it("renders the dashboard header and demo campaigns", () => {
    render(<CampaignsDirectoryPage />);

    expect(screen.getByText("Campaigns Dashboard")).toBeTruthy();
    expect(screen.getByText("Save the Amazon RainForest Reserve")).toBeTruthy();
    expect(screen.getByText("Clean Water Wells for Sub-Saharan Communities")).toBeTruthy();

    const wishlistButtons = screen.getAllByLabelText(/to wishlist/);
    expect(wishlistButtons.length).toBe(2);
  });

  it("links to the marketing templates toolkit (Issue #895)", () => {
    render(<CampaignsDirectoryPage />);

    const toolkitLink = screen.getByRole("link", {
      name: /Marketing Templates/i,
    });
    expect(toolkitLink.getAttribute("href")).toBe("/campaigns/toolkit");
  });
});
