import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import MarketingTemplatesPage from "./page";

describe("MarketingTemplatesPage (Issue #895)", () => {
  it("renders the marketing templates toolkit", () => {
    render(<MarketingTemplatesPage />);

    expect(screen.getByTestId("marketing-templates")).toBeTruthy();
    expect(
      screen.getByText("Campaign Creator Toolkit: Marketing Templates"),
    ).toBeTruthy();
    expect(screen.getByText("Email Templates")).toBeTruthy();
    expect(screen.getByText("Social Media Graphics")).toBeTruthy();
    expect(screen.getByText("Fundraising Pitch Decks")).toBeTruthy();
  });

  it("links back to the campaigns dashboard", () => {
    render(<MarketingTemplatesPage />);

    const backLink = screen.getByRole("link", { name: /Back to Campaigns/i });
    expect(backLink.getAttribute("href")).toBe("/campaigns");
  });
});
