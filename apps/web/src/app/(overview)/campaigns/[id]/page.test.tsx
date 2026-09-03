import React from "react";
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

// The page reads its route params with React 19's `use(params)`. jsdom's
// scheduler never flushes that suspension, so resolve the promise inline for
// tests — the component code path is otherwise untouched.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    use: (value: unknown) =>
      value instanceof Promise ? { id: "camp-101" } : (actual as { use: (v: unknown) => unknown }).use(value),
  };
});

// Recharts measures its container; jsdom has no layout engine, so stub the
// observer the charts rely on.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

import CampaignDetailPage from "./page";
import { TopBackers } from "@/components/modules/campaign/backers/TopBackers";
import { backersService, DEMO_CAMPAIGN_ID, DEMO_CREATOR_ADDRESS } from "@/services/campaign-backers.service";

const renderPage = () => render(<CampaignDetailPage params={Promise.resolve({ id: DEMO_CAMPAIGN_ID })} />);

const openBackersTab = async () => {
  const tab = screen.getByRole("tab", { name: /top backers/i });
  // Radix selects a tab on pointer-down rather than on click.
  fireEvent.mouseDown(tab);
  fireEvent.click(tab);
  await act(async () => {
    await Promise.resolve();
  });
};

describe("Campaign detail page — top backers tab", () => {
  it("exposes a Top Backers tab that renders the ranked leaderboard", async () => {
    renderPage();
    await openBackersTab();

    expect(screen.getByText("Top 10 Backers")).toBeTruthy();
    expect(screen.getAllByTestId(/^backer-row-/)).toHaveLength(10);
    // The mock page renders as the campaign creator, who may resolve every
    // backer, but opted-out backers are still badged so featuring is explained.
    expect(screen.getByText("Anonymous")).toBeTruthy();
    expect(screen.getByText(/0\/3 featured/)).toBeTruthy();
  });

  it("redacts the anonymous backer for everyone but the creator", async () => {
    renderPage();
    await openBackersTab();

    // Same campaign, public viewer: identity hidden, rank kept.
    const publicBoard = backersService.getTopBackers(DEMO_CAMPAIGN_ID, { viewerAddress: "GPUBLIC...PPPP" });
    expect(publicBoard.backers.map((entry) => entry.displayName)).toContain("Anonymous backer");
    expect(publicBoard.backers.some((entry) => entry.displayName === "Ken Adeyemi")).toBe(false);
    expect(publicBoard.privateBackers).toBe(1);

    // ...and a public viewer is told how many backers stay off the board.
    render(<TopBackers campaignId={DEMO_CAMPAIGN_ID} viewerAddress="GPUBLIC...PPPP" />);
    expect(screen.getByText(/1 backer keeps their support private/)).toBeTruthy();
    expect(screen.getByText("Anonymous backer")).toBeTruthy();
  });

  it("lets the creator feature a backer from the detail page", async () => {
    renderPage();
    await openBackersTab();

    // The mock page renders as the campaign creator, so featuring is available.
    expect(backersService.getCampaignCreator(DEMO_CAMPAIGN_ID)).toBe(DEMO_CREATOR_ADDRESS);
    const featureButtons = screen.getAllByRole("button", { name: /feature/i });
    expect(featureButtons.length).toBeGreaterThan(0);

    fireEvent.click(featureButtons[0]);
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText("Featured")).toBeTruthy();
    expect(screen.getByText(/1\/3 featured/)).toBeTruthy();
  });

  it("renders one clean tab list after the merge repair", async () => {
    renderPage();

    expect(screen.getAllByRole("tablist")).toHaveLength(1);
    expect(screen.getAllByRole("tab")).toHaveLength(8);
    // Only the active tab's content is mounted.
    expect(screen.getByText("Full Campaign Story")).toBeTruthy();
    // The duplicated insurance-claim modal is gone: exactly one trigger.
    expect(screen.getAllByRole("button", { name: /submit insurance claim/i })).toHaveLength(1);
  });
});
