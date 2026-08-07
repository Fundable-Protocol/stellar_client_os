import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import DashboardOverview, { processChartData } from "./DashboardOverview";

// Mock recharts to avoid jsdom layout/canvas issue in unit test environment
vitest.mock("recharts", async () => {
  const original = await vitest.importActual<typeof import("recharts")>("recharts");
  return {
    ...original,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container">{children}</div>
    ),
  };
});

describe("processChartData", () => {
  it("returns empty array for empty or undefined input", () => {
    expect(processChartData([])).toEqual([]);
    expect(processChartData(undefined as any)).toEqual([]);
  });

  it("adds dummy padding entry for single-point dataset", () => {
    const singlePoint = [{ name: "Jan", value: 100 }];
    const processed = processChartData(singlePoint);
    expect(processed).toHaveLength(2);
    expect(processed[0].name).toBe("Jan ");
    expect(processed[0].isPadding).toBe(true);
    expect(processed[0].value).toBe(100);
    expect(processed[1]).toEqual(singlePoint[0]);
  });

  it("preserves multi-point datasets without modification", () => {
    const multiPoint = [
      { name: "Jan", value: 100 },
      { name: "Feb", value: 200 },
    ];
    const processed = processChartData(multiPoint);
    expect(processed).toHaveLength(2);
    expect(processed).toEqual(multiPoint);
  });
});

describe("DashboardOverview component", () => {
  it("renders with default props without crashing", () => {
    render(<DashboardOverview />);
    expect(screen.getByText("Overview")).toBeDefined();
    expect(screen.getByTestId("responsive-container")).toBeDefined();
  });

  it("handles single-point datasets safely without rendering errors", () => {
    const singlePointData = [{ name: "July", value: 500 }];
    render(<DashboardOverview data={singlePointData} title="Single Point Test" />);
    expect(screen.getByText("Single Point Test")).toBeDefined();
    expect(screen.getByTestId("responsive-container")).toBeDefined();
  });

  it("handles empty datasets safely", () => {
    render(<DashboardOverview data={[]} title="Empty Data Test" />);
    expect(screen.getByText("Empty Data Test")).toBeDefined();
    expect(screen.getByTestId("responsive-container")).toBeDefined();
  });
});
