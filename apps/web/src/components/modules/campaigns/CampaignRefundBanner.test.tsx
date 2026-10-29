import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { mockUseWallet, mockClaimRefund } = vi.hoisted(() => ({
  mockUseWallet: vi.fn(),
  mockClaimRefund: vi.fn(),
}));

vi.mock("@/providers/StellarWalletProvider", () => ({ useWallet: mockUseWallet }));
vi.mock("@/services/campaign-refund.service", () => ({ claimCampaignRefund: mockClaimRefund }));

import { CampaignRefundBanner } from "./CampaignRefundBanner";

const props = {
  campaignId: "42",
  status: "Active",
  totalRaised: "3000",
  minTarget: "5000",
  deadline: 1,
  contractId: "C_CAMPAIGN_CONTRACT",
};

describe("CampaignRefundBanner", () => {
  beforeEach(() => {
    mockUseWallet.mockReset();
    mockClaimRefund.mockReset();
    mockUseWallet.mockReturnValue({
      address: "G_BACKER",
      isConnected: true,
      openModal: vi.fn(),
      signTransaction: vi.fn().mockResolvedValue("signed-xdr"),
    });
    mockClaimRefund.mockResolvedValue("transaction-hash");
  });

  it("shows the prominent refund action for an overdue campaign below its soft cap", () => {
    render(<CampaignRefundBanner {...props} />);

    expect(screen.getByRole("button", { name: "Claim Refund" })).toBeTruthy();
    expect(screen.getByText(/No platform fee is deducted/)).toBeTruthy();
  });

  it("submits the contributor's refund using their connected wallet", async () => {
    render(<CampaignRefundBanner {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Claim Refund" }));

    await waitFor(() => expect(mockClaimRefund).toHaveBeenCalledWith(expect.objectContaining({
      campaignId: 42n,
      contributor: "G_BACKER",
    })));
    expect(await screen.findByText(/Your full pledge was refunded/)).toBeTruthy();
  });

  it("does not show a refund action before the deadline or when the soft cap is met", () => {
    const { rerender } = render(<CampaignRefundBanner {...props} deadline={Date.now() / 1000 + 3600} />);
    expect(screen.queryByTestId("campaign-refund-banner")).toBeNull();

    rerender(<CampaignRefundBanner {...props} totalRaised="5000" />);
    expect(screen.queryByTestId("campaign-refund-banner")).toBeNull();
  });
});