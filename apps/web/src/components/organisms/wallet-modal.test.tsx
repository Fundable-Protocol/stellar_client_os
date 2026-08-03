import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { WalletModal } from "./wallet-modal";

// ---------------------------------------------------------------------------
// Mock the wallet context
// ---------------------------------------------------------------------------

const mockConnect = vi.fn();
const mockCloseModal = vi.fn();

const defaultWallets = [
  { id: "freighter", name: "Freighter", icon: "/icons/freighter.png" },
  { id: "albedo", name: "Albedo", icon: "/icons/albedo.png" },
  { id: "rango", name: "Rango", icon: "/icons/rango.png" },
];

let mockContextValue = {
  isModalOpen: true,
  closeModal: mockCloseModal,
  supportedWallets: defaultWallets,
  connect: mockConnect,
  isConnecting: false,
  isConnected: false,
};

vi.mock("@/providers/StellarWalletProvider", () => ({
  useWallet: () => mockContextValue,
}));

// Minimal Dialog stub — renders children when open
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogContent: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));

// framer-motion: render children directly in tests
vi.mock("framer-motion", () => ({
  motion: {
    span: ({ children, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
      <span {...props}>{children}</span>
    ),
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const renderModal = () => render(<WalletModal />);

beforeEach(() => {
  vi.clearAllMocks();
  mockContextValue = {
    isModalOpen: true,
    closeModal: mockCloseModal,
    supportedWallets: defaultWallets,
    connect: mockConnect,
    isConnecting: false,
    isConnected: false,
  };
});

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe("WalletModal – rendering", () => {
  it("renders the dialog when isModalOpen is true", () => {
    renderModal();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("does not render when isModalOpen is false", () => {
    mockContextValue = { ...mockContextValue, isModalOpen: false };
    renderModal();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders the 'Connect Wallet' heading", () => {
    renderModal();
    expect(screen.getByText("Connect Wallet")).toBeTruthy();
  });

  it("renders all supported wallets", () => {
    renderModal();
    expect(screen.getByText("Freighter")).toBeTruthy();
    expect(screen.getByText("Albedo")).toBeTruthy();
    expect(screen.getByText("Rango")).toBeTruthy();
  });

  it("renders wallet options as a radiogroup", () => {
    renderModal();
    expect(screen.getByRole("radiogroup")).toBeTruthy();
  });

  it("each wallet option has role=radio", () => {
    renderModal();
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(defaultWallets.length);
  });
});

// ---------------------------------------------------------------------------
// Wallet selection
// ---------------------------------------------------------------------------

describe("WalletModal – wallet selection", () => {
  it("Connect Now button is disabled by default (no selection)", () => {
    renderModal();
    const btn = screen.getByTestId("connect-now-button");
    expect(btn).toBeDisabled();
  });

  it("selecting a wallet marks it as aria-checked=true", () => {
    renderModal();
    const freighterBtn = screen.getByTestId("wallet-option-freighter");
    fireEvent.click(freighterBtn);
    expect(freighterBtn.getAttribute("aria-checked")).toBe("true");
  });

  it("other wallets become aria-checked=false after a new selection", () => {
    renderModal();
    fireEvent.click(screen.getByTestId("wallet-option-freighter"));
    fireEvent.click(screen.getByTestId("wallet-option-albedo"));
    expect(screen.getByTestId("wallet-option-freighter").getAttribute("aria-checked")).toBe("false");
    expect(screen.getByTestId("wallet-option-albedo").getAttribute("aria-checked")).toBe("true");
  });

  it("enables the Connect Now button after a wallet is selected", () => {
    renderModal();
    fireEvent.click(screen.getByTestId("wallet-option-freighter"));
    expect(screen.getByTestId("connect-now-button")).not.toBeDisabled();
  });

  it("Space key selects a wallet", () => {
    renderModal();
    const rangoBtn = screen.getByTestId("wallet-option-rango");
    fireEvent.keyDown(rangoBtn, { key: " " });
    expect(rangoBtn.getAttribute("aria-checked")).toBe("true");
  });

  it("Enter key selects a wallet", () => {
    renderModal();
    const rangoBtn = screen.getByTestId("wallet-option-rango");
    fireEvent.keyDown(rangoBtn, { key: "Enter" });
    expect(rangoBtn.getAttribute("aria-checked")).toBe("true");
  });
});

// ---------------------------------------------------------------------------
// Connect action
// ---------------------------------------------------------------------------

describe("WalletModal – connect action", () => {
  it("calls connect with the selected wallet id when Connect Now is clicked", async () => {
    renderModal();
    fireEvent.click(screen.getByTestId("wallet-option-freighter"));
    fireEvent.click(screen.getByTestId("connect-now-button"));
    expect(mockConnect).toHaveBeenCalledWith("freighter");
  });

  it("does not call connect when no wallet is selected", () => {
    renderModal();
    fireEvent.click(screen.getByTestId("connect-now-button"));
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it("shows 'Connecting…' text and disables wallet options while connecting", () => {
    mockContextValue = { ...mockContextValue, isConnecting: true };
    renderModal();
    expect(screen.getByText(/connecting/i)).toBeTruthy();
    // All wallet option buttons should be disabled
    const radios = screen.getAllByRole("radio");
    radios.forEach((r) => expect(r).toBeDisabled());
  });
});

// ---------------------------------------------------------------------------
// Auto-close
// ---------------------------------------------------------------------------

describe("WalletModal – auto-close", () => {
  it("calls closeModal when isConnected becomes true while modal is open", () => {
    const { rerender } = render(<WalletModal />);
    mockContextValue = { ...mockContextValue, isConnected: true };
    rerender(<WalletModal />);
    expect(mockCloseModal).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Accessibility
// ---------------------------------------------------------------------------

describe("WalletModal – accessibility", () => {
  it("Connect Now button has aria-disabled=true when disabled", () => {
    renderModal();
    const btn = screen.getByTestId("connect-now-button");
    expect(btn.getAttribute("aria-disabled")).toBe("true");
  });

  it("Connect Now button has aria-disabled=false when a wallet is selected", () => {
    renderModal();
    fireEvent.click(screen.getByTestId("wallet-option-freighter"));
    const btn = screen.getByTestId("connect-now-button");
    expect(btn.getAttribute("aria-disabled")).toBe("false");
  });

  it("radiogroup has an accessible label", () => {
    renderModal();
    const group = screen.getByRole("radiogroup", { name: /choose a wallet/i });
    expect(group).toBeTruthy();
  });
});
