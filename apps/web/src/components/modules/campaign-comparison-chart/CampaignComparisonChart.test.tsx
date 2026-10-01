import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { CampaignComparisonChart } from "./CampaignComparisonChart";
import { CampaignAnalyticsService } from "@/services/campaignAnalytics";

// Mock recharts ResponsiveContainer
vi.mock("recharts", async () => {
  const original = await vi.importActual("recharts");
  return {
    ...original,
    ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
  };
});

describe("CampaignComparisonChart Component (Issue #879)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(CampaignAnalyticsService, "getAvailableCampaigns").mockReturnValue([
      { id: "c1", name: "Amazon Forest" },
      { id: "c2", name: "Congo Basin" },
    ] as any);

    vi.spyOn(CampaignAnalyticsService, "getCampaignComparison").mockResolvedValue([
      {
        campaignId: "c1",
        campaignName: "Amazon Forest",
        dataPoints: [
          { date: "2026-01-01", co2Sequestration: 100, treesCount: 500 },
          { date: "2026-02-01", co2Sequestration: 250, treesCount: 1200 },
        ],
        baselineModel: {
          species: "Cedar",
          growthRate: "Medium",
          dataPoints: [
            { date: "2026-01-01", expectedCO2: 80 },
            { date: "2026-02-01", expectedCO2: 200 },
          ],
        },
        similarCampaigns: [],
      },
    ] as any);
  });

  it("renders the comparison chart interface", async () => {
    render(<CampaignComparisonChart initialCampaignIds={["c1"]} />);

    expect(screen.getByText("Campaign Comparison & Impact Analysis")).toBeDefined();
    expect(screen.getByText("Compare historical CO2 sequestration, growth trajectories, and peer benchmarks")).toBeDefined();
  });

  it("displays tab navigation for comparison, baseline, and similar campaigns", async () => {
    render(<CampaignComparisonChart initialCampaignIds={["c1"]} />);

    expect(screen.getByRole("tab", { name: /Multi-Campaign/i })).toBeDefined();
    expect(screen.getByRole("tab", { name: /Growth Baseline/i })).toBeDefined();
    expect(screen.getByRole("tab", { name: /Peer Campaigns/i })).toBeDefined();
  });

  it("loads campaign comparison data", async () => {
    render(<CampaignComparisonChart initialCampaignIds={["c1"]} />);

    await waitFor(() => {
      expect(CampaignAnalyticsService.getCampaignComparison).toHaveBeenCalled();
    });
  });
});
