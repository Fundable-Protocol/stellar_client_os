import { fireEvent, render, screen } from "@testing-library/react";
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

  it("displays daily XLM pledged over campaign lifetime", () => {
    render(
      <CampaignFundingVelocityChart
        startDate="2026-08-01"
        endDate="2026-10-31"
        currency="XLM"
        granularity="daily"
      />
    );

    expect(screen.getByText("Funding velocity")).toBeTruthy();
    expect(screen.getByText(/Campaign lifetime/i)).toBeTruthy();
    expect(screen.getByText(/\/day/i)).toBeTruthy();

    // Screen reader table should contain daily data over lifetime
    const table = screen.getByRole("table", { hidden: true });
    expect(table).toBeTruthy();
    expect(screen.getByText(/Campaign funding velocity: daily pledges/i)).toBeTruthy();
  });

  it("shows hourly granularity in the creator analytics version", () => {
    render(
      <CampaignFundingVelocityChart
        isCreator={true}
        variant="creator"
        currency="XLM"
      />
    );

    expect(screen.getByText(/Creator analytics/i)).toBeTruthy();
    expect(screen.getByText(/Past 24 hours/i)).toBeTruthy();
    expect(screen.getByText(/\/hr/i)).toBeTruthy();

    const hourlyTab = screen.getByRole("tab", { name: /hourly/i });
    expect(hourlyTab.getAttribute("aria-selected")).toBe("true");

    const tableCaption = screen.getByText(/Campaign funding velocity: hourly pledges/i);
    expect(tableCaption).toBeTruthy();
  });

  it("allows toggling between daily and hourly granularity when enabled", () => {
    render(
      <CampaignFundingVelocityChart
        allowGranularityToggle={true}
        granularity="daily"
        currency="XLM"
      />
    );

    const dailyBtn = screen.getByRole("tab", { name: /daily/i });
    const hourlyBtn = screen.getByRole("tab", { name: /hourly/i });

    expect(dailyBtn.getAttribute("aria-selected")).toBe("true");
    expect(hourlyBtn.getAttribute("aria-selected")).toBe("false");

    fireEvent.click(hourlyBtn);
    expect(hourlyBtn.getAttribute("aria-selected")).toBe("true");
    expect(dailyBtn.getAttribute("aria-selected")).toBe("false");
    expect(screen.getByText(/Past 24 hours/i)).toBeTruthy();

    fireEvent.click(dailyBtn);
    expect(dailyBtn.getAttribute("aria-selected")).toBe("true");
    expect(hourlyBtn.getAttribute("aria-selected")).toBe("false");
  });

  it("is accessible with keyboard navigation and screen reader labels", () => {
    render(
      <CampaignFundingVelocityChart
        data={[
          { label: "Day 1", raised: 1000, contributions: 5 },
          { label: "Day 2", raised: 2500, contributions: 12 },
          { label: "Day 3", raised: 4000, contributions: 18 },
        ]}
        currency="XLM"
      />
    );

    // Accessible container
    const chartRegion = screen.getByRole("region");
    expect(chartRegion).toBeTruthy();
    expect(chartRegion.getAttribute("aria-roledescription")).toBe("line chart");
    expect(chartRegion.getAttribute("aria-label")).toContain("Campaign funding velocity line chart");
    expect(chartRegion.getAttribute("aria-describedby")).toBe("velocity-chart-instructions");
    expect(chartRegion.getAttribute("tabIndex")).toBe("0");

    // Instructions available for screen reader users
    expect(screen.getByText(/Interactive line chart showing/i)).toBeTruthy();

    // Keyboard navigation: focus the chart
    fireEvent.focus(chartRegion);
    expect(screen.getByTestId("keyboard-focused-point")).toBeTruthy();
    expect(screen.getByText(/Point 1 of 3 \(Day 1\):/i)).toBeTruthy();
    expect(screen.getByText(/1,000 XLM pledged/i)).toBeTruthy();

    // ArrowRight moves to next point
    fireEvent.keyDown(chartRegion, { key: "ArrowRight" });
    expect(screen.getByText(/Point 2 of 3 \(Day 2\):/i)).toBeTruthy();
    expect(screen.getByText(/2,500 XLM pledged/i)).toBeTruthy();

    // ArrowRight moves to last point
    fireEvent.keyDown(chartRegion, { key: "ArrowRight" });
    expect(screen.getByText(/Point 3 of 3 \(Day 3\):/i)).toBeTruthy();
    expect(screen.getByText(/4,000 XLM pledged/i)).toBeTruthy();

    // ArrowLeft moves back to previous point
    fireEvent.keyDown(chartRegion, { key: "ArrowLeft" });
    expect(screen.getByText(/Point 2 of 3 \(Day 2\):/i)).toBeTruthy();

    // Home jumps to first point
    fireEvent.keyDown(chartRegion, { key: "Home" });
    expect(screen.getByText(/Point 1 of 3 \(Day 1\):/i)).toBeTruthy();

    // End jumps to last point
    fireEvent.keyDown(chartRegion, { key: "End" });
    expect(screen.getByText(/Point 3 of 3 \(Day 3\):/i)).toBeTruthy();

    // Screen reader accessible data table
    const table = screen.getByRole("table", { hidden: true });
    expect(table).toBeTruthy();
    expect(screen.getByText(/1,000 XLM/i)).toBeTruthy();
    expect(screen.getByText(/2,500 XLM/i)).toBeTruthy();
    expect(screen.getByText(/4,000 XLM/i)).toBeTruthy();
  });
});
