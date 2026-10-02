import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ImpactComparison from "./ImpactComparison";
import type { SponsorImpact } from "@/services/impact.service";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockUseWallet = vi.fn();

vi.mock("@/providers/StellarWalletProvider", () => ({
  useWallet: () => mockUseWallet(),
}));

const mockFetchSponsorImpact = vi.fn();

vi.mock("@/services/impact.service", () => ({
  fetchSponsorImpact: (...args: unknown[]) => mockFetchSponsorImpact(...args),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TEST_ADDRESS = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

const IMPACT: SponsorImpact = {
  address: TEST_ADDRESS,
  myVolumeUsd: "2500",
  myCo2OffsetKg: 2500,
  globalAverageVolumeUsd: "320",
  globalAverageCo2OffsetKg: 320,
  globalSponsorCount: 1234,
  percentile: 90,
  rankingBand: "top_10",
  co2PerUsdKg: 1,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

function mockWallet(address: string | null) {
  mockUseWallet.mockReturnValue({
    address,
    isConnected: !!address,
    openModal: vi.fn(),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ImpactComparison", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("prompts to connect a wallet when none is connected", () => {
    mockWallet(null);
    renderWithQuery(<ImpactComparison />);
    expect(screen.getByText("Connect your wallet")).toBeDefined();
  });

  it("shows a loading state while the impact data is being fetched", () => {
    mockWallet(TEST_ADDRESS);
    mockFetchSponsorImpact.mockReturnValue(new Promise(() => {})); // never resolves
    const { unmount } = renderWithQuery(<ImpactComparison />);
    expect(
      screen.getByLabelText(/loading impact comparison/i)
    ).toBeDefined();
    unmount();
  });

  it("renders the sponsor's impact vs the global average", async () => {
    mockWallet(TEST_ADDRESS);
    mockFetchSponsorImpact.mockResolvedValue(IMPACT);
    renderWithQuery(<ImpactComparison />);

    await waitFor(() => {
      expect(screen.getByText("Your Impact vs. the Global Average")).toBeDefined();
    });

    // My impact stat
    const myCo2 = await waitFor(() => screen.getByTestId("impact-my-co2"));
    expect(myCo2.textContent).toContain("2,500");
    expect(myCo2.textContent).toContain("kg CO₂e");
    expect(myCo2.textContent).toContain("$2,500");

    // Global average stat
    const avgCo2 = await waitFor(() => screen.getByTestId("impact-average-co2"));
    expect(avgCo2.textContent).toContain("320");
    expect(avgCo2.textContent).toContain("kg CO₂e");
    expect(avgCo2.textContent).toContain("$320");

    // Ranking band + detail
    expect(screen.getByTestId("impact-ranking-band").textContent).toBe(
      "Top 10%"
    );
    const detail = screen.getByTestId("impact-ranking-detail");
    expect(detail.textContent).toContain("90%");
    expect(detail.textContent).toContain("1,234");

    // Footnote discloses the estimation factor
    expect(screen.getByText(/1 kg CO₂e per \$1 funded/i)).toBeDefined();
  });

  it("shows an empty state when there is no comparison data", async () => {
    mockWallet(TEST_ADDRESS);
    mockFetchSponsorImpact.mockResolvedValue({
      ...IMPACT,
      globalSponsorCount: 0,
      percentile: null,
      rankingBand: null,
    });
    renderWithQuery(<ImpactComparison />);

    await waitFor(() => {
      expect(screen.getByTestId("impact-empty")).toBeDefined();
    });
    expect(screen.getByText("No comparison data yet")).toBeDefined();
  });

  it("shows an error state and recovers on retry", async () => {
    mockWallet(TEST_ADDRESS);
    mockFetchSponsorImpact
      .mockRejectedValueOnce(new Error("Gateway unavailable"))
      .mockResolvedValueOnce(IMPACT);
    renderWithQuery(<ImpactComparison />);

    await waitFor(() => {
      expect(screen.getByTestId("impact-error")).toBeDefined();
    });
    expect(screen.getByText("Gateway unavailable")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    await waitFor(() => {
      expect(screen.getByTestId("impact-ranking-band").textContent).toBe(
        "Top 10%"
      );
    });
    expect(mockFetchSponsorImpact).toHaveBeenCalledTimes(2);
  });
});
