import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { CreatorRecurringRevenueReportView } from "./CreatorRecurringRevenueReportView";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockReport = {
  creatorAddress: "GCREATOR",
  generatedAt: 1000,
  activeSubscribersCount: 12,
  pausedSubscribersCount: 2,
  cancelledSubscribersCount: 1,
  totalMonthlyRecurringRevenue: "450.00",
  totalAnnualRecurringRevenue: "5400.00",
  totalLifetimeVolume: "3200.00",
  token: "USDC",
  campaigns: [
    {
      campaignId: "c1",
      campaignTitle: "Amazon Reforestation",
      activeSubscribersCount: 12,
      monthlyRecurringRevenue: "450.00",
      annualRecurringRevenue: "5400.00",
      totalLifetimeVolume: "3200.00",
      token: "USDC",
    },
  ],
};

describe("CreatorRecurringRevenueReportView", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.restoreAllMocks();
  });

  const renderComponent = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <CreatorRecurringRevenueReportView creatorAddress="GCREATOR" />
      </QueryClientProvider>
    );

  it("renders recurring revenue statistics and campaign breakdown", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ report: mockReport }),
      })
    );

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("450.00 USDC")).toBeTruthy();
    });
    expect(screen.getByText("5400.00 USDC")).toBeTruthy();
    expect(screen.getByText("Amazon Reforestation")).toBeTruthy();
    expect(screen.getByTestId("export-recurring-report-btn")).toBeTruthy();
  });
});
