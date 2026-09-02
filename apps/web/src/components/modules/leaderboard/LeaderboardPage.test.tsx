import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LeaderboardPage } from "./LeaderboardPage";
import { recordPlanterCompletion, recordSponsorContribution } from "@/services/leaderboard.service";

describe("LeaderboardPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("shows an empty state when no one has been recorded this month", () => {
    render(<LeaderboardPage />);

    expect(screen.getByText(/No sponsorships recorded yet this month/i)).toBeTruthy();
  });

  it("lists sponsors ranked by points with a bonus badge on rank 1", () => {
    recordSponsorContribution("GABCDEFGH123456789", 500);
    recordSponsorContribution("GZYXWVUTS987654321", 900);

    render(<LeaderboardPage />);

    expect(screen.getByText("XLM bonus")).toBeTruthy();
  });

  it("shows top campaigns ranked by trees planted with creator and impact", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [
            { id: "campaign-1", name: "Mangrove restoration", creator: "GAAAAAAAAAAAAAAAAAAA", treeCount: 1200, raisedAmount: "5000" },
            { id: "campaign-2", name: "Urban canopy", creator: "GZZZZZZZZZZZZZZZZZZZ", treeCount: 800, raisedAmount: "3000" },
          ],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<LeaderboardPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Top Campaigns" }));

    expect(await screen.findByText("Mangrove restoration")).toBeTruthy();
    expect(screen.getByText(/Creator: GAAAAA/)).toBeTruthy();
    expect(screen.getByText("1,200 trees planted")).toBeTruthy();
    expect(screen.getByText("Urban canopy")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/campaigns?sort=treeCount&direction=desc&limit=10",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("switches to the planters tab and shows planter-specific units", () => {
    recordPlanterCompletion("GPLANTER0000000000", 12);

    render(<LeaderboardPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Top Planters" }));

    expect(screen.getByText(/12 trees/)).toBeTruthy();
  });
});
