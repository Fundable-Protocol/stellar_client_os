import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CampaignABTestingEditor } from "./CampaignABTestingEditor";

describe("CampaignABTestingEditor", () => {
  it("renders with default 50/50 split and variants", () => {
    render(
      <CampaignABTestingEditor
        campaignId="test-camp-123"
        defaultHeadline="Save Our Forests"
        defaultHeroImageUrl="https://test.com/forest.jpg"
        defaultCtaText="Plant a Tree"
      />
    );

    // Click enable if not initially enabled
    const enableBtn = screen.getByRole("button", { name: /enable a\/b testing/i });
    fireEvent.click(enableBtn);

    expect(screen.getByText(/Campaign A\/B Testing/i)).toBeDefined();
    expect(screen.getByText(/Traffic Allocation Split/i)).toBeDefined();
    expect(screen.getAllByText(/50%/i).length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue("Save Our Forests")).toBeDefined();
  });

  it("switches winner selection mode between significance and manual", () => {
    render(
      <CampaignABTestingEditor
        campaignId="test-camp-mode"
        defaultHeadline="Renewable Energy Fund"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /enable a\/b testing/i }));

    const manualBtn = screen.getByRole("button", { name: /manual selection/i });
    fireEvent.click(manualBtn);

    const autoBtn = screen.getByRole("button", { name: /auto by significance/i });
    expect(autoBtn).toBeDefined();
    fireEvent.click(autoBtn);
  });

  it("locks in a winner variant manually", () => {
    render(
      <CampaignABTestingEditor
        campaignId="test-camp-lock"
        defaultHeadline="Ocean Cleanup"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /enable a\/b testing/i }));

    const lockButtons = screen.getAllByRole("button", { name: /lock in as winner/i });
    expect(lockButtons.length).toBeGreaterThan(0);

    fireEvent.click(lockButtons[0]);

    expect(screen.getByText(/Winning Variant Locked In/i)).toBeDefined();
    expect(screen.getByText(/★ Locked Winner/i)).toBeDefined();
  });
});
