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
  });
});
