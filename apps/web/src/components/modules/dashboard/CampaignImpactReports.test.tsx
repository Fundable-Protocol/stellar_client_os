import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CampaignImpactReports from "./CampaignImpactReports";

const TEST_CREATOR = "GCREATOR_TEST_123456789";
const mockUseWallet = vi.fn();

vi.mock("@/providers/StellarWalletProvider", () => ({
  useWallet: () => mockUseWallet(),
}));

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("CampaignImpactReports Dashboard Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseWallet.mockReturnValue({ address: TEST_CREATOR });
  });

  it("renders report card list when creator has completed campaigns", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            creator: TEST_CREATOR,
            count: 1,
            reports: [
              {
                id: "report-1",
                campaignId: "camp-forest-1",
                campaignName: "Amazon Forest Project",
                creator: TEST_CREATOR,
                status: "delivered",
                generatedAt: 1700000000000,
                closedAt: 1700000000000,
                publicUrl: "/campaigns/camp-forest-1/impact-report",
                publicShareUrl: "https://fundable.stellar/campaigns/camp-forest-1/impact-report",
                downloadUrl: "/api/reports/campaign/camp-forest-1",
                emailSent: true,
                treeCount: 5000,
                co2KgPerYear: 100000,
              },
            ],
          }),
      }),
    );

    renderWithQuery(<CampaignImpactReports />);

    await waitFor(() => {
      expect(screen.getByText("Amazon Forest Project")).toBeTruthy();
    });

    expect(screen.getByText("Report Ready")).toBeTruthy();
    expect(screen.getByText("5,000 trees")).toBeTruthy();
    expect(screen.getByText("View Report")).toBeTruthy();
    expect(screen.getByText("PDF")).toBeTruthy();
    expect(screen.getByText("Share Link")).toBeTruthy();
  });

  it("shows empty state when no closed campaign reports are available", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            creator: TEST_CREATOR,
            count: 0,
            reports: [],
          }),
      }),
    );

    renderWithQuery(<CampaignImpactReports />);

    await waitFor(() => {
      expect(screen.getByText("No closed campaign reports yet")).toBeTruthy();
    });
  });
});
