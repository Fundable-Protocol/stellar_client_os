import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { LeaderboardPage } from "./LeaderboardPage";
import { recordPlanterCompletion, recordSponsorContribution } from "@/services/leaderboard.service";

describe("LeaderboardPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
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

  it("switches to the planters tab and shows planter-specific units", () => {
    recordPlanterCompletion("GPLANTER0000000000", 12);

    render(<LeaderboardPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Top Planters" }));

    expect(screen.getByText(/12 trees/)).toBeTruthy();
  });
});
