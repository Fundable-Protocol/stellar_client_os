import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { CampaignFundingVelocityChart } from "./FundingVelocityChart";

vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="velocity-chart-responsive-container">{children}</div>
    ),
  };
});

describe("CampaignFundingVelocityChart", () => {
  it("renders the funding velocity signal and trend direction", () => {
    render(
      <CampaignFundingVelocityChart
        data={[
          { day: "Mon", raised: 1400 },
          { day: "Tue", raised: 1800 },
          { day: "Wed", raised: 2300 },
          { day: "Thu", raised: 2100 },
          { day: "Fri", raised: 2900 },
          { day: "Sat", raised: 3400 },
          { day: "Sun", raised: 3900 },
        ]}
      />
    );

    expect(screen.getByText("Funding velocity")).toBeTruthy();
    expect(screen.getByText(/Trending up/i)).toBeTruthy();
    expect(screen.getByText(/This week/i)).toBeTruthy();
  });
});
