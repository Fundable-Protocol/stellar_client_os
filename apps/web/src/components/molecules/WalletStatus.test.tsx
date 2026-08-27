import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { WalletStatus } from "./WalletStatus";

const mockUseWallet = vi.fn();

vi.mock("@/providers/StellarWalletProvider", () => ({
  useWallet: () => mockUseWallet(),
}));

describe("WalletStatus", () => {
  beforeEach(() => {
    mockUseWallet.mockReset();
  });

  it("renders Locked badge when extension wallet is locked (#393)", () => {
    mockUseWallet.mockReturnValue({
      isConnected: false,
      isConnecting: false,
      isLocked: true,
      address: null,
      openModal: vi.fn(),
    });

    render(<WalletStatus />);

    expect(screen.getByRole("status").textContent).toContain("Locked");
    expect(screen.getByLabelText(/wallet is locked/i)).toBeTruthy();
  });

  it("does not show Locked badge for generic disconnected state", () => {
    mockUseWallet.mockReturnValue({
      isConnected: false,
      isConnecting: false,
      isLocked: false,
      address: null,
      openModal: vi.fn(),
    });

    const { container } = render(<WalletStatus />);
    expect(container.innerHTML).toBe("");
    expect(screen.queryByText("Locked")).toBeNull();
  });

  it("renders Connected badge when connected with address", () => {
    mockUseWallet.mockReturnValue({
      isConnected: true,
      isConnecting: false,
      isLocked: false,
      address: "GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFGHIJKLMNOP",
      openModal: vi.fn(),
    });

    render(<WalletStatus />);
    expect(screen.getByText("Connected")).toBeTruthy();
  });

  it("renders Connecting status while connecting", () => {
    mockUseWallet.mockReturnValue({
      isConnected: false,
      isConnecting: true,
      isLocked: false,
      address: null,
      openModal: vi.fn(),
    });

    render(<WalletStatus />);
    expect(screen.getByLabelText(/connecting wallet/i)).toBeTruthy();
  });
});
