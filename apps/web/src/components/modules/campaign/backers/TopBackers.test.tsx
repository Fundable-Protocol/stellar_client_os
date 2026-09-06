import React from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { TopBackers } from "./TopBackers";
import { backersService } from "@/services/campaign-backers.service";
import { ANONYMOUS_BACKER_LABEL } from "@/types/campaign-backers";

const CAMPAIGN = "camp-ui";
const CREATOR = "GCREATOR...AAAA";
const VIEWER = "GVIEWER...VVVV";

function seed() {
  backersService.reset();
  backersService.registerCampaignCreator(CAMPAIGN, CREATOR);
  backersService.recordContribution({ campaignId: CAMPAIGN, backerAddress: "GAlice...AAAA", amount: "1500", token: "XLM", displayName: "Alice Adams", contributedAt: 1_000 });
  backersService.recordContribution({ campaignId: CAMPAIGN, backerAddress: "GBob...BBBB", amount: "900", token: "XLM", displayName: "Bob Bale", contributedAt: 2_000 });
  backersService.recordContribution({ campaignId: CAMPAIGN, backerAddress: "GCarol...CCCC", amount: "400", token: "USDC", displayName: "Carol Cruz", contributedAt: 3_000 });
}

describe("TopBackers", () => {
  beforeEach(seed);

  it("renders the backers ranked by total contribution", () => {
    render(<TopBackers campaignId={CAMPAIGN} />);

    expect(screen.getByText("Top 10 Backers")).toBeTruthy();
    expect(screen.getByText("Alice Adams")).toBeTruthy();
    expect(screen.getByText("1,500")).toBeTruthy();

    const rows = screen.getAllByTestId(/^backer-row-/);
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText("Alice Adams")).toBeTruthy();
    expect(within(rows[1]).getByText("Bob Bale")).toBeTruthy();
    expect(within(rows[2]).getByText("Carol Cruz")).toBeTruthy();
  });

  it("shows at most ten rows", () => {
    for (let i = 0; i < 12; i += 1) {
      backersService.recordContribution({
        campaignId: CAMPAIGN,
        backerAddress: `GExtra${i}...ZZZZ`,
        amount: String(10 + i),
        contributedAt: 9_000 + i,
      });
    }
    render(<TopBackers campaignId={CAMPAIGN} />);
    expect(screen.getAllByTestId(/^backer-row-/)).toHaveLength(10);
  });

  it("redacts anonymous backers while keeping their rank", () => {
    backersService.setPrivacyPreference({ campaignId: CAMPAIGN, backerAddress: "GBob...BBBB", visibility: "ANONYMOUS" });
    render(<TopBackers campaignId={CAMPAIGN} viewerAddress={VIEWER} />);

    expect(screen.queryByText("Bob Bale")).toBeNull();
    expect(screen.getByText(ANONYMOUS_BACKER_LABEL)).toBeTruthy();
    expect(screen.getByText("Anonymous")).toBeTruthy();
    // Still ranked #2 by amount.
    expect(within(screen.getByTestId("backer-row-2")).getByText(ANONYMOUS_BACKER_LABEL)).toBeTruthy();
  });

  it("hides the amount when an anonymous backer asks for it", () => {
    backersService.setPrivacyPreference({
      campaignId: CAMPAIGN,
      backerAddress: "GBob...BBBB",
      visibility: "ANONYMOUS",
      showAmount: false,
    });
    render(<TopBackers campaignId={CAMPAIGN} viewerAddress={VIEWER} />);
    expect(screen.getByText("Amount hidden")).toBeTruthy();
  });

  it("excludes private backers and tells the viewer how many are hidden", () => {
    backersService.setPrivacyPreference({ campaignId: CAMPAIGN, backerAddress: "GCarol...CCCC", visibility: "PRIVATE" });
    backersService.setPrivacyPreference({ campaignId: CAMPAIGN, backerAddress: "GBob...BBBB", visibility: "PRIVATE" });
    render(<TopBackers campaignId={CAMPAIGN} viewerAddress={VIEWER} />);

    expect(screen.queryByText("Carol Cruz")).toBeNull();
    expect(screen.queryByText("Bob Bale")).toBeNull();
    expect(screen.getAllByTestId(/^backer-row-/)).toHaveLength(1);
    expect(screen.getByText(/2 backers keep their support private/)).toBeTruthy();
  });

  it("only offers featuring to the campaign creator", () => {
    const { unmount } = render(<TopBackers campaignId={CAMPAIGN} creatorAddress={CREATOR} viewerAddress={VIEWER} />);
    expect(screen.queryByRole("button", { name: /feature/i })).toBeNull();
    unmount();

    render(<TopBackers campaignId={CAMPAIGN} creatorAddress={CREATOR} viewerAddress={CREATOR} />);
    expect(screen.getAllByRole("button", { name: /feature/i }).length).toBe(3);
    expect(screen.getByText(/0\/3 featured/)).toBeTruthy();
  });

  it("pins a backer to the top when the creator features them", () => {
    render(<TopBackers campaignId={CAMPAIGN} creatorAddress={CREATOR} viewerAddress={CREATOR} />);

    const carolRow = screen.getByTestId("backer-row-3");
    fireEvent.click(within(carolRow).getByRole("button", { name: /feature/i }));

    const firstRow = screen.getAllByTestId(/^backer-row-/)[0];
    expect(within(firstRow).getByText("Carol Cruz")).toBeTruthy();
    expect(within(firstRow).getByText("Featured")).toBeTruthy();
    expect(screen.getByText(/1\/3 featured/)).toBeTruthy();

    // Un-featuring restores amount order.
    fireEvent.click(within(firstRow).getByRole("button", { name: /un-feature/i }));
    const afterUnfeature = screen.getAllByTestId(/^backer-row-/)[0];
    expect(within(afterUnfeature).getByText("Alice Adams")).toBeTruthy();
  });

  it("surfaces the service error when featuring is not allowed", () => {
    backersService.setPrivacyPreference({ campaignId: CAMPAIGN, backerAddress: "GBob...BBBB", allowFeaturing: false });
    render(<TopBackers campaignId={CAMPAIGN} creatorAddress={CREATOR} viewerAddress={CREATOR} />);

    const bobRow = screen.getByTestId("backer-row-2");
    fireEvent.click(within(bobRow).getByRole("button", { name: /feature/i }));

    expect(screen.getByRole("alert").textContent).toMatch(/opted out of being featured/);
  });

  it("lets a backer change their own privacy preference", () => {
    render(<TopBackers campaignId={CAMPAIGN} creatorAddress={CREATOR} viewerAddress="GAlice...AAAA" />);

    expect(screen.getByText("Your privacy preference")).toBeTruthy();
    expect(screen.getByText("You")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Private" }));

    expect(backersService.getPrivacyPreference(CAMPAIGN, "GAlice...AAAA").visibility).toBe("PRIVATE");
    expect(screen.getByRole("button", { name: "Private" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps the privacy controls reachable for a backer who went anonymous", () => {
    backersService.setPrivacyPreference({ campaignId: CAMPAIGN, backerAddress: "GBob...BBBB", visibility: "ANONYMOUS" });
    render(<TopBackers campaignId={CAMPAIGN} creatorAddress={CREATOR} viewerAddress="GBob...BBBB" />);

    // Bob still resolves his own row (and can undo the choice) even though the
    // row is redacted for everybody else.
    expect(screen.getByText("Bob Bale")).toBeTruthy();
    const bobRow = screen.getByTestId("backer-row-2");
    expect(within(bobRow).getByText("Anonymous")).toBeTruthy();
    expect(screen.getByText("Your privacy preference")).toBeTruthy();
    expect(screen.getByText("You")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Anonymous" }).getAttribute("aria-pressed")).toBe("true");

    // A third party still sees the redacted row.
    expect(
      backersService
        .getTopBackers(CAMPAIGN, { viewerAddress: "GOTHER...OOOO" })
        .backers.some((entry) => entry.displayName === ANONYMOUS_BACKER_LABEL),
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Public" }));
    expect(backersService.getPrivacyPreference(CAMPAIGN, "GBob...BBBB").visibility).toBe("PUBLIC");
    expect(within(screen.getByTestId("backer-row-2")).queryByText("Anonymous")).toBeNull();
  });

  it("renders an empty state before the first contribution", () => {
    backersService.reset();
    render(<TopBackers campaignId="camp-empty" />);
    expect(screen.getByText("No backers yet")).toBeTruthy();
  });
});
