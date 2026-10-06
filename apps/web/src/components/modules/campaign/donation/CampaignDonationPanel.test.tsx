import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CampaignDonationPanel } from "./CampaignDonationPanel";

const wallet = vi.hoisted(() => ({ connected: true, openModal: vi.fn() }));
vi.mock("@/providers/StellarWalletProvider", () => ({
  useWallet: () => ({
    address: "GDONOR1234ABCD",
    isConnected: wallet.connected,
    openModal: wallet.openModal,
  }),
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("react-hot-toast", () => ({ default: toast }));

const fetchMock = vi.fn();

const receipt = {
  receiptId: "rc-dn-1",
  reference: "DON-camp-1-AB12CD",
  donationId: "dn-1",
  campaignId: "camp-1",
  campaignName: "Amazon reforestation",
  donorAddress: "GDONOR1234ABCD",
  amount: "25",
  token: "XLM",
  allocation: "CREATOR_DISCRETION",
  allocationLabel: "Creator's discretion",
  allocationDescription: "The full amount is released to the campaign creator.",
  status: "CONFIRMED",
  issuedAt: 1,
};

const renderPanel = () => render(<CampaignDonationPanel campaignId="camp-1" campaignName="Rainforest" />);

const okResponse = () => Promise.resolve({ ok: true, json: async () => ({ receipt }) });

describe("CampaignDonationPanel (#1001)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    wallet.connected = true;
    wallet.openModal.mockReset();
  });

  it("explains that funds go to the creator's discretion", () => {
    renderPanel();
    expect(screen.getByText(/released to the campaign creator/i)).toBeTruthy();
    expect(screen.getByTestId("donation-preset-25")).toBeTruthy();
  });

  it("fills the amount from a preset", () => {
    renderPanel();
    fireEvent.click(screen.getByTestId("donation-preset-25"));
    expect((screen.getByTestId("donation-amount") as HTMLInputElement).value).toBe("25");
    expect(screen.getByTestId("donation-submit").textContent).toContain("25");
  });

  it("blocks submission with an invalid amount", () => {
    renderPanel();
    fireEvent.change(screen.getByTestId("donation-amount"), { target: { value: "0" } });
    fireEvent.click(screen.getByTestId("donation-submit"));

    expect(screen.getByTestId("donation-error").textContent).toMatch(/greater than zero/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("records a donation and shows the receipt", async () => {
    fetchMock.mockImplementation(okResponse);
    renderPanel();

    fireEvent.change(screen.getByTestId("donation-amount"), { target: { value: "25" } });
    fireEvent.change(screen.getByTestId("donation-message"), { target: { value: "Great work" } });
    fireEvent.click(screen.getByTestId("donation-submit"));

    await waitFor(() => expect(screen.getByTestId("donation-receipt")).toBeTruthy());
    expect(screen.getByTestId("donation-reference").textContent).toBe("DON-camp-1-AB12CD");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/campaigns/camp-1/donations");
    expect(JSON.parse(String(init.body))).toMatchObject({
      donorAddress: "GDONOR1234ABCD",
      amount: "25",
      token: "XLM",
      message: "Great work",
      anonymous: false,
    });
    expect(toast.success).toHaveBeenCalled();
  });

  it("surfaces an API error without showing a receipt", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "This campaign is not accepting donations.", code: "CAMPAIGN_NOT_ACCEPTING" }),
    });
    renderPanel();

    fireEvent.change(screen.getByTestId("donation-amount"), { target: { value: "25" } });
    fireEvent.click(screen.getByTestId("donation-submit"));

    await waitFor(() =>
      expect(screen.getByTestId("donation-error").textContent).toMatch(/not accepting donations/i),
    );
    expect(screen.queryByTestId("donation-receipt")).toBeNull();
    expect(toast.error).toHaveBeenCalled();
  });

  it("prompts the donor to connect a wallet", () => {
    wallet.connected = false;
    renderPanel();

    fireEvent.change(screen.getByTestId("donation-amount"), { target: { value: "25" } });
    fireEvent.click(screen.getByTestId("donation-submit"));

    expect(screen.getByTestId("donation-error").textContent).toMatch(/connect your wallet/i);
    expect(wallet.openModal).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("hides the donor address on anonymous receipts", async () => {
    fetchMock.mockImplementation(okResponse);
    renderPanel();

    fireEvent.change(screen.getByTestId("donation-amount"), { target: { value: "25" } });
    fireEvent.click(screen.getByTestId("donation-anonymous"));
    fireEvent.click(screen.getByTestId("donation-submit"));

    await waitFor(() => expect(screen.getByTestId("donation-receipt")).toBeTruthy());
    expect(screen.getByText("Anonymous")).toBeTruthy();
  });
});
