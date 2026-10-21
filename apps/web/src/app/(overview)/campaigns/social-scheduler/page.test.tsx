import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import CampaignSocialSchedulerPage from "./page";

describe("CampaignSocialSchedulerPage (Issue #1266)", () => {
  it("renders the social media post scheduler with creator settings, calendar UI, and post preview", () => {
    render(<CampaignSocialSchedulerPage />);

    expect(screen.getByTestId("campaign-social-scheduler")).toBeTruthy();
    expect(screen.getByText("Social Media Post Scheduler")).toBeTruthy();
    expect(
      screen.getByText("Creator Settings: Social Media Account Connections"),
    ).toBeTruthy();
    expect(screen.getByText("Promotion Calendar")).toBeTruthy();
    expect(screen.getByText("Post Preview Before Scheduling")).toBeTruthy();
  });

  it("links back to the campaigns dashboard", () => {
    render(<CampaignSocialSchedulerPage />);

    const backLink = screen.getByRole("link", { name: /Back to Campaigns/i });
    expect(backLink.getAttribute("href")).toBe("/campaigns");
  });
});
