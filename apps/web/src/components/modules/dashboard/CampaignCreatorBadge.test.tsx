import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import CampaignCreatorBadge from "./CampaignCreatorBadge";

const TEST_ADDRESS = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
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

describe("CampaignCreatorBadge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseWallet.mockReturnValue({ address: TEST_ADDRESS });
  });

  it("shows progress and earned tiers for the connected creator", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: Array.from({ length: 50 }, (_, index) => ({ id: `campaign-${index}` })) }),
      }),
    );

    renderWithQuery(<CampaignCreatorBadge />);

    await waitFor(() => expect(screen.getByTestId("campaign-creator-badge-status").textContent).toContain("Campaign Builder badge earned"));
    expect(screen.getByLabelText("Campaign Starter badge, earned")).toBeTruthy();
    expect(screen.getByLabelText("Campaign Builder badge, earned")).toBeTruthy();
    expect(screen.getByLabelText("Campaign Champion badge, locked")).toBeTruthy();
    expect(screen.getByText(/50\s+campaigns\s+created/)).toBeTruthy();
  });

  it("asks an unconnected creator to connect a wallet", () => {
    mockUseWallet.mockReturnValue({ address: null });

    renderWithQuery(<CampaignCreatorBadge />);

    expect(screen.getByText("Connect your wallet to view your progress.")).toBeTruthy();
  });
});
