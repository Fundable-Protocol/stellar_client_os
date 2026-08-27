import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import CreatePaymentStream from "./CreatePaymentStream";

// Mock dependencies
vi.mock("@/providers/StellarWalletProvider", () => ({
  useWallet: () => ({
    address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    isConnected: true,
  }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
  }),
}));

vi.mock("react-hot-toast", () => ({
  default: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@/services/stellar.service", () => ({
  createTestnetService: () => ({
    getStreamCreationFeeEstimate: vi.fn().mockResolvedValue("~0.0001 XLM"),
  }),
}));

vi.mock("@/lib/stellar", () => ({
  StellarService: {
    validateStellarAddress: (addr: string) => addr.startsWith("G") && addr.length === 56,
    createPaymentStream: vi.fn().mockResolvedValue("1234567890abcdef"),
  },
}));

vi.mock("@/hooks/use-debounce-callback", () => ({
  useDebouncedCallback: (fn: any) => fn,
}));

vi.mock("@/hooks/use-balance-validation", () => ({
  useBalanceValidation: () => ({
    balanceError: null,
    insufficientBalance: false,
  }),
}));

vi.mock("@/hooks/use-unsaved-changes", () => ({
  useUnsavedChanges: vi.fn(),
}));

describe("CreatePaymentStream Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the wizard title and main form elements", () => {
    render(<CreatePaymentStream />);

    expect(screen.getByText("Create New Stream")).toBeTruthy();
    expect(
      screen.getByText("Set up a continuous payment stream on the Stellar network")
    ).toBeTruthy();
    expect(screen.getByText("Stream Name")).toBeTruthy();
    expect(screen.getByText("Total Amount")).toBeTruthy();
    expect(screen.getByText("Recipient Address")).toBeTruthy();
  });

  it("renders stream summary sidebar section", () => {
    render(<CreatePaymentStream />);

    // Stream summary should be present in DOM
    const summaries = screen.getAllByText("Stream Summary");
    expect(summaries.length).toBeGreaterThan(0);
  });

  it("allows entering stream parameters and updates form fields", () => {
    render(<CreatePaymentStream />);

    const nameInput = screen.getByPlaceholderText("e.g., Monthly Salary") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Test Stream" } });
    expect(nameInput.value).toBe("Test Stream");

    const amountInput = screen.getByPlaceholderText("Enter total amount to stream") as HTMLInputElement;
    fireEvent.change(amountInput, { target: { value: "100" } });
    expect(amountInput.value).toBe("100");

    const recipientInput = screen.getByPlaceholderText(
      "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
    ) as HTMLInputElement;
    fireEvent.change(recipientInput, {
      target: {
        value: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      },
    });
    expect(recipientInput.value).toBe(
      "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"
    );
  });

  it("shows Proceed button in form layout", () => {
    render(<CreatePaymentStream />);

    const proceedButton = screen.getByRole("button", { name: /proceed/i });
    expect(proceedButton).toBeTruthy();
  });
});
