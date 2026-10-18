import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BackerSubscriptionsManager } from "./BackerSubscriptionsManager";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockSubscriptions = [
  {
    id: "sub_1",
    campaignId: "c1",
    campaignTitle: "Reforest the Coast",
    creatorAddress: "GCREATOR",
    backerAddress: "GBACKER",
    amount: "25",
    token: "USDC",
    frequency: "MONTHLY",
    cadence: "monthly",
    status: "ACTIVE",
    createdAt: 1000,
    updatedAt: 1000,
    nextChargeAt: Date.now() + 86400000,
    totalChargedAmount: "25",
    successfulCyclesCount: 1,
  },
];

vi.mock("@/providers/StellarWalletProvider", () => ({
  useWallet: () => ({
    address: "GBACKER",
    isConnected: true,
  }),
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("react-hot-toast", () => ({ default: toast }));

describe("BackerSubscriptionsManager", () => {
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
        <BackerSubscriptionsManager />
      </QueryClientProvider>
    );

  it("renders subscriptions list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ subscriptions: mockSubscriptions }),
      })
    );

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("Reforest the Coast")).toBeTruthy();
    });
    expect(screen.getByText("25 USDC/month")).toBeTruthy();
    expect(screen.getByTestId("pause-btn-sub_1")).toBeTruthy();
    expect(screen.getByTestId("cancel-btn-sub_1")).toBeTruthy();
  });

  it("allows pausing an active subscription", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            subscription: { ...mockSubscriptions[0], status: "PAUSED" },
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ subscriptions: mockSubscriptions }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId("pause-btn-sub_1")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("pause-btn-sub_1"));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Subscription paused");
    });
  });
});
