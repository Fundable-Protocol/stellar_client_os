import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CampaignSideBySideComparison } from "./campaign-side-by-side-comparison";
import {
  compareCampaigns,
  type ComparisonCampaignRecord,
} from "@/services/campaign-comparison.service";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function campaign(
  id: string,
  title: string,
  overrides: Partial<ComparisonCampaignRecord> = {},
): ComparisonCampaignRecord {
  return {
    id,
    title,
    creator: "GCREATOR",
    status: "Active",
    createdAt: 0,
    completedAt: null,
    targetAmount: "10000000000",
    totalRaised: "5000000000",
    sponsorCount: 10,
    species: [{ speciesId: "oak", trees: 100 }],
    location: { country: "Kenya", region: "Lamu" },
    ...overrides,
  };
}

const CAMPAIGNS = [
  campaign("1", "Mangrove Belt"),
  campaign("2", "Pine Corridor", {
    sponsorCount: 50,
    species: [{ speciesId: "pine", trees: 1000 }],
    location: { country: "Ethiopia", region: "Amhara" },
  }),
  campaign("3", "Sahel Shelterbelt", { location: { country: "Niger", region: "Tahoua" } }),
  campaign("4", "Orchard Pilot", { location: { country: "Ghana", region: "Ashanti" } }),
];

const fetchMock = vi.fn(async (input: string) => {
  const url = new URL(input, "http://test");
  const ids = url.searchParams.get("ids");
  const body = ids
    ? { data: compareCampaigns(CAMPAIGNS, ids.split(",")) }
    : {
        data: {
          options: CAMPAIGNS.map((c) => ({
            campaignId: c.id,
            title: c.title,
            status: c.status,
            location: `${c.location.region}, ${c.location.country}`,
          })),
        },
      };
  return new Response(JSON.stringify(body), { status: 200 });
});

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CampaignSideBySideComparison", () => {
  it("shows an empty state until a campaign is selected", async () => {
    render(<CampaignSideBySideComparison />);

    expect(screen.getByText("No campaigns selected")).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/campaigns/compare", expect.anything()));
  });

  it("compares the initial campaigns across every detail row", async () => {
    render(<CampaignSideBySideComparison initialIds={["1", "2"]} />);

    await screen.findByText("Pine Corridor");
    const table = screen.getByRole("table");
    for (const label of ["Tree species", "Location", "Completion rate", "CO₂ impact", "Sponsors", "Cost per tree"]) {
      expect(within(table).getByText(label)).toBeTruthy();
    }
    expect(within(table).getByText("Amhara, Ethiopia")).toBeTruthy();
    expect(within(table).getByText("Pine")).toBeTruthy();
    // Pine Corridor: 500 XLM / 1,000 trees; Mangrove Belt: 500 XLM / 100 trees.
    expect(within(table).getByText("0.5 XLM")).toBeTruthy();
    expect(within(table).getByText("5 XLM")).toBeTruthy();
    expect(within(table).getByText("Most sponsors")).toBeTruthy();
    expect(within(table).getByText("Lowest cost")).toBeTruthy();
  });

  it("adds campaigns up to three and then hides the picker", async () => {
    render(<CampaignSideBySideComparison initialIds={["1", "2"]} />);
    await screen.findByText("Pine Corridor");

    const picker = await screen.findByLabelText("Add campaign to comparison");
    await waitFor(() => expect(within(picker).getAllByRole("option").length).toBeGreaterThan(1));
    fireEvent.change(picker, { target: { value: "3" } });

    await screen.findByText("Sahel Shelterbelt");
    expect(screen.queryByLabelText("Add campaign to comparison")).toBeNull();
    expect(fetchMock).toHaveBeenLastCalledWith("/api/campaigns/compare?ids=1,2,3", expect.anything());
  });

  it("removes a campaign from the comparison", async () => {
    render(<CampaignSideBySideComparison initialIds={["1", "2"]} />);
    await screen.findByText("Pine Corridor");

    fireEvent.click(screen.getByLabelText("Remove Pine Corridor from comparison"));

    await waitFor(() => expect(screen.queryByText("Pine Corridor")).toBeNull());
  });

  it("only uses the first three initial campaigns", async () => {
    render(<CampaignSideBySideComparison initialIds={["1", "2", "3", "4"]} />);

    await screen.findByText("Sahel Shelterbelt");
    expect(screen.queryByText("Orchard Pilot")).toBeNull();
  });

  it("reports a failed comparison", async () => {
    fetchMock.mockImplementation(async () => new Response("{}", { status: 500 }));
    render(<CampaignSideBySideComparison initialIds={["1"]} />);

    expect((await screen.findByRole("alert")).textContent).toMatch(/Could not load/);
  });
});
