// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { PlanterProfile } from "./PlanterProfile";
import * as socialService from "@/services/social.service";

// Mock StellarWalletProvider
const mockUseWallet = vi.fn();
vi.mock("@/providers/StellarWalletProvider", () => ({
  useWallet: () => mockUseWallet(),
}));

// Mock qrcode
vi.mock("qrcode", () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,mockqrcode"),
  },
}));

describe("PlanterProfile", () => {
  beforeEach(() => {
    mockUseWallet.mockReturnValue({
      address: "GBJABCDEF1234567890XYZ",
      isConnected: true,
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders prompt when wallet is not connected", () => {
    mockUseWallet.mockReturnValue({
      address: null,
      isConnected: false,
    });

    render(<PlanterProfile />);
    expect(screen.getByText("Connect Planter Wallet")).toBeTruthy();
    expect(screen.getByText(/manage your unique referral link/i)).toBeTruthy();
  });

  it("renders planter profile and referral URL for connected wallet", () => {
    render(<PlanterProfile initialAddress="GBJABCDEF1234567890XYZ" />);

    expect(screen.getByTestId("planter-profile-header")).toBeTruthy();
    expect(screen.getByText("Planter Profile")).toBeTruthy();
    expect(screen.getByText("Verified Planter")).toBeTruthy();

    const input = screen.getByTestId("referral-url-input") as HTMLInputElement;
    expect(input.value).toContain("GBJABCDEF1234567890XYZ");
  });

  it("displays the 5 XLM bonus commission messaging", () => {
    render(<PlanterProfile initialAddress="GBJABCDEF1234567890XYZ" />);

    expect(screen.getAllByText(/5 XLM/i).length).toBeGreaterThan(0);
    expect(screen.getByText("Earn 5 XLM Bonus")).toBeTruthy();
  });

  it("handles copy referral link with visual feedback", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(<PlanterProfile initialAddress="GBJABCDEF1234567890XYZ" />);

    const copyBtn = screen.getByTestId("copy-referral-btn");
    expect(screen.getByText("Copy Link")).toBeTruthy();

    fireEvent.click(copyBtn);

    expect(writeTextMock).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByText("Copied!")).toBeTruthy();
    });
  });

  it("toggles QR code display", async () => {
    render(<PlanterProfile initialAddress="GBJABCDEF1234567890XYZ" />);

    const qrBtn = screen.getByTestId("qr-toggle-btn");
    expect(screen.getByText("Show QR")).toBeTruthy();

    fireEvent.click(qrBtn);

    await waitFor(() => {
      expect(screen.getByTestId("referral-qr-image")).toBeTruthy();
      expect(screen.getByText("Hide QR")).toBeTruthy();
    });
  });

  it("renders referral metrics and reward table when rewards exist", () => {
    const mockRewards = [
      {
        referrer: "GBJABCDEF1234567890XYZ",
        referredSponsor: "GSPONSOR1234567890",
        rewardStroops: "50000000",
        month: "2026-08",
        createdAt: "2026-08-20T10:00:00Z",
      },
    ];

    vi.spyOn(socialService, "getPlanterReferralStats").mockReturnValue({
      totalReferrals: 1,
      totalRewardsStroops: "50000000",
      totalBonusXlm: 5,
      monthlyCount: 1,
      monthlyCap: 10,
      rewards: mockRewards,
    });

    render(<PlanterProfile initialAddress="GBJABCDEF1234567890XYZ" />);

    expect(screen.getByTestId("total-bonus-xlm").textContent).toContain("5.00");
    expect(screen.getByTestId("total-referrals-count").textContent).toBe("1");
    expect(screen.getByTestId("referral-history-table")).toBeTruthy();
    expect(screen.getByText("+5.00 XLM")).toBeTruthy();
  });
});
