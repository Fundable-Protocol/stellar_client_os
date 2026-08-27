// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OfframpSwapWidget } from "./OfframpSwapWidget";

// ── Mock the offramp service ──────────────────────────────────────────────────

const mockGetAggregatedRates = vi.fn();

vi.mock("@/services/offramp.service", () => ({
  offrampService: {
    getAggregatedRates: mockGetAggregatedRates,
  },
}));

// ── Mock useOfframpQuote to control state in component tests ──────────────────

const mockQuote = {
  amountIn: 100,
  currency: "NGN",
  rate: 1550,
  totalFee: 500,
  youReceive: 154_500,
  slippagePercent: 0.3,
  providers: [
    { name: "Paycrest", rate: 1550, fee: 500, youReceive: 154_500, isBest: true },
    { name: "YellowCard", rate: 1540, fee: 600, youReceive: 153_400, isBest: false },
  ],
  bestProvider: "Paycrest",
  expiresAt: new Date(Date.now() + 30_000).toISOString(),
};

const mockUseOfframpQuote = vi.fn();

vi.mock("@/hooks/use-offramp-quote", () => ({
  useOfframpQuote: (...args: unknown[]) => mockUseOfframpQuote(...args),
}));

// ── Default mock return value ─────────────────────────────────────────────────

function defaultHookReturn(overrides = {}) {
  return {
    quote: null,
    isLoading: false,
    isInitialLoading: false,
    isRefreshing: false,
    error: null,
    refresh: vi.fn(),
    expiresInSeconds: null,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  mockUseOfframpQuote.mockReturnValue(defaultHookReturn());
});

// ── Rendering ─────────────────────────────────────────────────────────────────

describe("OfframpSwapWidget — rendering", () => {
  it("renders the widget header", () => {
    render(<OfframpSwapWidget />);
    expect(screen.getByRole("heading", { name: /offramp quote/i })).toBeTruthy();
  });

  it("renders You pay and You receive labels", () => {
    render(<OfframpSwapWidget />);
    expect(screen.getByLabelText(/you pay/i)).toBeTruthy();
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("renders token selector with default USDC", () => {
    render(<OfframpSwapWidget />);
    const tokenSelect = screen.getByLabelText(/select token/i) as HTMLSelectElement;
    expect(tokenSelect.value).toBe("USDC");
  });

  it("renders all supported tokens in the token selector", () => {
    render(<OfframpSwapWidget />);
    const tokenSelect = screen.getByLabelText(/select token/i);
    expect(tokenSelect.innerHTML).toContain("USDC");
    expect(tokenSelect.innerHTML).toContain("USDT");
    expect(tokenSelect.innerHTML).toContain("EURC");
  });

  it("renders corridor selector with default NGN", () => {
    render(<OfframpSwapWidget />);
    const corridorSelect = screen.getByLabelText(/select country/i) as HTMLSelectElement;
    expect(corridorSelect.value).toBe("NG");
  });

  it("renders proceed button as disabled when no quote", () => {
    render(<OfframpSwapWidget />);
    const btn = screen.getByRole("button", { name: /proceed to offramp/i });
    expect(btn).toBeDisabled();
  });

  it("has accessible section label", () => {
    render(<OfframpSwapWidget />);
    expect(screen.getByRole("region", { name: /offramp quote widget/i })).toBeTruthy();
  });

  it("renders with data-testid", () => {
    render(<OfframpSwapWidget />);
    expect(screen.getByTestId("offramp-swap-widget")).toBeTruthy();
  });
});

// ── Loading states ────────────────────────────────────────────────────────────

describe("OfframpSwapWidget — loading states", () => {
  it("shows fetching message during initial load", () => {
    mockUseOfframpQuote.mockReturnValue(
      defaultHookReturn({ isLoading: true, isInitialLoading: true })
    );
    render(<OfframpSwapWidget defaultAmount="100" />);
    expect(screen.getByText(/fetching quote/i)).toBeTruthy();
  });

  it("shows spinner on refresh (not initial load)", () => {
    mockUseOfframpQuote.mockReturnValue(
      defaultHookReturn({ isLoading: true, isRefreshing: true, quote: mockQuote })
    );
    render(<OfframpSwapWidget defaultAmount="100" />);
    // The receive field still shows the previous quote amount
    expect(screen.getByText("154,500")).toBeTruthy();
  });

  it("proceed button is disabled while loading", () => {
    mockUseOfframpQuote.mockReturnValue(
      defaultHookReturn({ isLoading: true, isInitialLoading: true })
    );
    render(<OfframpSwapWidget defaultAmount="100" />);
    const btn = screen.getByRole("button", { name: /fetching quote/i });
    expect(btn).toBeDisabled();
  });
});

// ── Quote display ─────────────────────────────────────────────────────────────

describe("OfframpSwapWidget — quote display", () => {
  beforeEach(() => {
    mockUseOfframpQuote.mockReturnValue(
      defaultHookReturn({ quote: mockQuote, expiresInSeconds: 28 })
    );
  });

  it("displays the youReceive amount when quote is available", () => {
    render(<OfframpSwapWidget defaultAmount="100" />);
    expect(screen.getByText("154,500")).toBeTruthy();
  });

  it("displays the exchange rate", () => {
    render(<OfframpSwapWidget defaultAmount="100" />);
    expect(screen.getByText(/1 USDC = 1,550 NGN/i)).toBeTruthy();
  });

  it("displays the fee", () => {
    render(<OfframpSwapWidget defaultAmount="100" />);
    expect(screen.getByText(/500 NGN/i)).toBeTruthy();
  });

  it("displays the best provider", () => {
    render(<OfframpSwapWidget defaultAmount="100" />);
    expect(screen.getByText("Paycrest")).toBeTruthy();
  });

  it("displays the quote expiry countdown", () => {
    render(<OfframpSwapWidget defaultAmount="100" />);
    expect(screen.getByText("28s")).toBeTruthy();
  });

  it("expiry countdown turns red when <= 10s remaining", () => {
    mockUseOfframpQuote.mockReturnValue(
      defaultHookReturn({ quote: mockQuote, expiresInSeconds: 8 })
    );
    render(<OfframpSwapWidget defaultAmount="100" />);
    const countdown = screen.getByText("8s");
    expect(countdown.className).toContain("red");
  });

  it("displays the slippage badge", () => {
    render(<OfframpSwapWidget defaultAmount="100" />);
    expect(screen.getByLabelText(/slippage/i)).toBeTruthy();
  });

  it("enables the proceed button when quote is available and amount > 0", () => {
    render(<OfframpSwapWidget defaultAmount="100" />);
    const btn = screen.getByRole("button", { name: /proceed to offramp/i });
    expect(btn).not.toBeDisabled();
  });

  it("shows compare providers button when multiple providers", () => {
    render(<OfframpSwapWidget defaultAmount="100" />);
    expect(screen.getByRole("button", { name: /compare/i })).toBeTruthy();
  });

  it("expands provider list when compare button is clicked", () => {
    render(<OfframpSwapWidget defaultAmount="100" />);
    fireEvent.click(screen.getByRole("button", { name: /compare/i }));
    expect(screen.getByText("YellowCard")).toBeTruthy();
  });

  it("collapses provider list on second click", () => {
    render(<OfframpSwapWidget defaultAmount="100" />);
    const btn = screen.getByRole("button", { name: /compare/i });
    fireEvent.click(btn);
    expect(screen.getByText("YellowCard")).toBeTruthy();
    fireEvent.click(btn);
    expect(screen.queryByText("YellowCard")).toBeNull();
  });
});

// ── Error state ───────────────────────────────────────────────────────────────

describe("OfframpSwapWidget — error state", () => {
  it("displays error message with role=alert", () => {
    mockUseOfframpQuote.mockReturnValue(
      defaultHookReturn({ error: "Failed to fetch rates" })
    );
    render(<OfframpSwapWidget defaultAmount="100" />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Failed to fetch rates");
  });

  it("amount input has aria-invalid=true when error", () => {
    mockUseOfframpQuote.mockReturnValue(
      defaultHookReturn({ error: "Rate unavailable" })
    );
    render(<OfframpSwapWidget defaultAmount="100" />);
    const input = screen.getByLabelText(/you pay/i) as HTMLInputElement;
    expect(input.getAttribute("aria-invalid")).toBe("true");
  });
});

// ── Interactions ──────────────────────────────────────────────────────────────

describe("OfframpSwapWidget — interactions", () => {
  it("calls onProceed with correct params when proceed button clicked", () => {
    mockUseOfframpQuote.mockReturnValue(
      defaultHookReturn({ quote: mockQuote })
    );
    const onProceed = vi.fn();
    render(<OfframpSwapWidget defaultAmount="100" onProceed={onProceed} />);
    fireEvent.click(screen.getByRole("button", { name: /proceed to offramp/i }));
    expect(onProceed).toHaveBeenCalledOnce();
    expect(onProceed).toHaveBeenCalledWith(
      expect.objectContaining({
        token: "USDC",
        amount: "100",
        currency: "NGN",
        quote: mockQuote,
      })
    );
  });

  it("calls refresh when refresh button is clicked", () => {
    const refresh = vi.fn();
    mockUseOfframpQuote.mockReturnValue(
      defaultHookReturn({ refresh, quote: mockQuote })
    );
    render(<OfframpSwapWidget defaultAmount="100" />);
    fireEvent.click(screen.getByRole("button", { name: /refresh quote/i }));
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("updates amount input value", async () => {
    render(<OfframpSwapWidget />);
    const input = screen.getByLabelText(/you pay/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "250" } });
    expect(input.value).toBe("250");
  });

  it("updates token selector value", async () => {
    render(<OfframpSwapWidget />);
    const select = screen.getByLabelText(/select token/i) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "USDT" } });
    expect(select.value).toBe("USDT");
  });

  it("updates corridor selector value", () => {
    render(<OfframpSwapWidget />);
    const select = screen.getByLabelText(/select country/i) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "GH" } });
    expect(select.value).toBe("GH");
    expect(screen.getByText(/ghana/i)).toBeTruthy();
  });
});

// ── Accessibility ─────────────────────────────────────────────────────────────

describe("OfframpSwapWidget — accessibility", () => {
  it("amount input has associated label", () => {
    render(<OfframpSwapWidget />);
    expect(screen.getByLabelText(/you pay/i)).toBeTruthy();
  });

  it("token selector has sr-only label", () => {
    render(<OfframpSwapWidget />);
    expect(screen.getByLabelText(/select token/i)).toBeTruthy();
  });

  it("corridor selector has sr-only label", () => {
    render(<OfframpSwapWidget />);
    expect(screen.getByLabelText(/select country/i)).toBeTruthy();
  });

  it("receive area has role=status and aria-live=polite", () => {
    render(<OfframpSwapWidget />);
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.getAttribute("aria-atomic")).toBe("true");
  });

  it("refresh button is disabled when no valid amount", () => {
    render(<OfframpSwapWidget />);
    const btn = screen.getByRole("button", { name: /refresh quote/i });
    expect(btn).toBeDisabled();
  });

  it("refresh button is disabled while loading", () => {
    mockUseOfframpQuote.mockReturnValue(
      defaultHookReturn({ isLoading: true })
    );
    render(<OfframpSwapWidget defaultAmount="100" />);
    expect(screen.getByRole("button", { name: /refresh quote/i })).toBeDisabled();
  });

  it("compare providers button has aria-expanded", () => {
    mockUseOfframpQuote.mockReturnValue(
      defaultHookReturn({ quote: mockQuote })
    );
    render(<OfframpSwapWidget defaultAmount="100" />);
    const btn = screen.getByRole("button", { name: /compare/i });
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
  });

  it("empty receive state shows helpful placeholder", () => {
    render(<OfframpSwapWidget />);
    expect(screen.getByText(/enter an amount above/i)).toBeTruthy();
  });
});
