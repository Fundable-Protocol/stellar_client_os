import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CampaignImpactCalculator } from "./CampaignImpactCalculator";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);

describe("CampaignImpactCalculator", () => {
  it("renders the calculator header", () => {
    render(<CampaignImpactCalculator />);
    expect(
      screen.getByRole("heading", { name: /campaign impact calculator/i }),
    ).toBeDefined();
  });

  it("defaults to oak with 10 trees and shows the projected offset", () => {
    render(<CampaignImpactCalculator />);
    // Oak = 21 kg/tree/yr × 10 trees = 210 kg / year.
    expect(screen.getByText("210")).toBeDefined();
  });

  it("updates the projection when the quantity changes", () => {
    render(<CampaignImpactCalculator />);
    const input = screen.getByLabelText(/number of trees/i);
    fireEvent.change(input, { target: { value: "100" } });
    // Oak = 21 kg/tree/yr × 100 trees = 2100 kg / year.
    expect(screen.getByText("2,100")).toBeDefined();
  });

  it("clamps an empty or invalid quantity to zero", () => {
    render(<CampaignImpactCalculator />);
    const input = screen.getByLabelText(/number of trees/i);
    fireEvent.change(input, { target: { value: "" } });
    // With zero trees every metric card shows 0.
    expect(screen.getAllByText("0").length).toBeGreaterThan(0);
  });

  it("shows a 20-year cumulative forecast and 95% confidence interval", () => {
    render(<CampaignImpactCalculator />);

    expect(screen.getByRole("heading", { name: /20-year CO2 sequestration forecast/i })).toBeDefined();
    expect(screen.getByRole("img", { name: /twenty-year cumulative CO2 forecast with 95% confidence interval/i })).toBeDefined();
    expect(screen.getByText(/95% confidence interval:/i)).toBeDefined();
  });

  it("provides accessible annual forecast rows", () => {
    render(<CampaignImpactCalculator />);
    fireEvent.click(screen.getByText("View annual forecast data"));

    expect(screen.getByRole("table", { name: /annual cumulative CO2 sequestration estimate/i })).toBeDefined();
    expect(screen.getAllByRole("row")).toHaveLength(21);
  it("updates the projection as sponsors contribute more trees (issue #907)", () => {
    // Simulate the live counter feeding the calculator: the campaign starts
    // with 100 trees funded and sponsors add more over time.
    const { rerender } = render(
      <CampaignImpactCalculator campaignTreeCount={100} readOnly />,
    );
    // Oak = 21 kg/tree/yr × 100 trees = 2,100 kg / year.
    expect(screen.getByText("2,100")).toBeDefined();

    rerender(<CampaignImpactCalculator campaignTreeCount={125} readOnly />);
    // Oak = 21 kg/tree/yr × 125 trees = 2,625 kg / year.
    expect(screen.getByText("2,625")).toBeDefined();
  });

  it("maps a campaign tree type to its species profile in read-only mode", () => {
    render(
      <CampaignImpactCalculator campaignSpeciesId="Mangrove" campaignTreeCount={10} readOnly />,
    );
    // The Mangrove campaign profile maps to the teak uptake rate (24 kg/tree/yr).
    expect(screen.getAllByText("Teak").length).toBeGreaterThan(0);
    // 24 kg/tree/yr × 10 trees = 240 kg / year.
    expect(screen.getByText("240")).toBeDefined();
  });

  it("keeps the projection deterministic regardless of the current season", () => {
    render(<CampaignImpactCalculator campaignTreeCount={10} readOnly />);
    // Oak baseline is 21 kg/tree/yr × 10 trees = 210 kg / year — never the
    // 420 kg a rainy-month run would have produced.
    expect(screen.getByText("210")).toBeDefined();
  });
});
