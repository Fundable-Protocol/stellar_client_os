import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/components/modules/campaign/success-stories/SuccessStories", () => ({
  default: () => <div data-testid="mock-success-stories">Success Stories</div>,
}));

import CampaignsDirectoryPage from "./page";

describe("CampaignsDirectoryPage", () => {
  it("renders campaign list with sustainability score badges", () => {
    render(<CampaignsDirectoryPage />);

    expect(screen.getByText("Campaigns Dashboard")).toBeTruthy();
    expect(screen.getByText("Save the Amazon RainForest Reserve")).toBeTruthy();
    expect(screen.getByText("Clean Water Wells for Sub-Saharan Communities")).toBeTruthy();

    const badges = screen.getAllByTestId("sustainability-score-badge");
    expect(badges.length).toBe(2);
  });
});
