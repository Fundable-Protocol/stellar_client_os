import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { useOfframpBridge } from "./useOfframpBridge";

// --- Mocks ---

vi.mock("@/providers/StellarWalletProvider", () => ({
    useWallet: vi.fn(),
}));

vi.mock("@/services/offramp.service", () => ({
    offrampService: {
        getBankList: vi.fn(),
        verifyBankAccount: vi.fn(),
        getAggregatedRates: vi.fn(),
        createOfframp: vi.fn(),
        updateQuoteTxHash: vi.fn(),
        getQuoteStatus: vi.fn(),
        getUserLimits: vi.fn(),
        getProviderLimits: vi.fn(),
    },
}));

vi.mock("@/services/offramp.mock", () => ({
    isOfframpMockEnabled: false,
    getMockDelay: vi.fn(() => 0),
    getMockBridgeQuote: vi.fn(),
    createMockTxHash: vi.fn(() => "mock-tx-hash"),
}));

vi.mock("@/lib/api", () => ({
    fetchAccountInfo: vi.fn().mockResolvedValue({
        balances: [{ assetCode: "USDC", balance: "100.00" }],
    }),
}));

import { useWallet } from "@/providers/StellarWalletProvider";
import { offrampService } from "@/services/offramp.service";

const mockWallet = {
    address: "GABC123",
    isConnected: true,
    signTransaction: vi.fn().mockResolvedValue("signed-xdr"),
    network: "testnet",
};

const mockQuote = {
    providerId: "cashwyre",
    displayName: "Cashwyre",
    cryptoAmount: 10,
    fiatAmount: 15500,
    rate: 1550,
    fee: 62,
    currency: "NGN",
    token: "USDC",
    network: "polygon",
    expiresAt: new Date(Date.now() + 300000).toISOString(),
};

const mockOfframpData = {
    providerId: "cashwyre",
    reference: "ref-123",
    depositAddress: "polygon-addr",
    depositAmount: 10,
    depositToken: "USDC",
    depositNetwork: "polygon",
    fiatAmount: 15500,
    currency: "NGN",
    status: "pending",
    expiresAt: new Date(Date.now() + 600000).toISOString(),
};

function createWrapper() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    const Wrapper = ({ children }: { children: React.ReactNode }) =>
        createElement(QueryClientProvider, { client: queryClient }, children);
    Wrapper.displayName = "QueryClientWrapper";
    return Wrapper;
}

async function drainTimers() {
    await act(async () => {
        await vi.runAllTimersAsync();
    });
}

describe("useOfframpBridge", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        (useWallet as ReturnType<typeof vi.fn>).mockReturnValue(mockWallet);
        (offrampService.getBankList as ReturnType<typeof vi.fn>).mockResolvedValue({
            success: true,
            data: [{ code: "044", name: "Access Bank" }],
        });
        (offrampService.getAggregatedRates as ReturnType<typeof vi.fn>).mockResolvedValue({
            success: true,
            data: { best: mockQuote, all: [mockQuote], errors: [], timestamp: new Date().toISOString() },
        });
        (offrampService.getUserLimits as ReturnType<typeof vi.fn>).mockResolvedValue({
            success: true,
            data: {
                dailyLimit: 1000,
                dailyUsed: 0,
                remainingDaily: 1000,
                tier: "standard",
            },
        });
        (offrampService.getProviderLimits as ReturnType<typeof vi.fn>).mockResolvedValue({
            success: true,
            data: {
                minimumAmount: 10,
                providers: [
                    { providerId: "cashwyre", minimumAmount: 10 },
                    { providerId: "autoramp", minimumAmount: 10 },
                ],
            },
        });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    // --- Initial state ---

    it("returns correct initial state", () => {
        const { result } = renderHook(() => useOfframpBridge(), { wrapper: createWrapper() });

        expect(result.current.step).toBe("form");
        expect(result.current.error).toBeNull();
        expect(result.current.isLoading).toBe(false);
        expect(result.current.quote).toBeNull();
        expect(result.current.offrampData).toBeNull();
        expect(result.current.bridgeTxHash).toBeNull();
        expect(result.current.payoutStatus).toBeNull();
        expect(result.current.userLimits).toBeNull();
        expect(result.current.isLoadingLimits).toBe(true);
        expect(result.current.formState).toEqual({
            token: "USDC",
            amount: "",
            country: "NG",
            bankCode: "",
            accountNumber: "",
            accountName: "",
        });
    });

    // --- handleFormChange ---

    it("handleFormChange updates form field", () => {
        const { result } = renderHook(() => useOfframpBridge(), { wrapper: createWrapper() });

        act(() => { result.current.handleFormChange("amount", "50"); });

        expect(result.current.formState.amount).toBe("50");
    });

    it("handleFormChange clears accountName when bankCode changes", () => {
        const { result } = renderHook(() => useOfframpBridge(), { wrapper: createWrapper() });

        act(() => { result.current.handleFormChange("bankCode", "044"); });

        expect(result.current.formState.accountName).toBe("");
    });

    it("handleFormChange clears quote and quoteError when amount changes", async () => {
        const { result } = renderHook(() => useOfframpBridge(), { wrapper: createWrapper() });

        act(() => { result.current.handleFormChange("amount", "10"); });
        await drainTimers();
        expect(result.current.quote).toEqual(mockQuote);

        act(() => { result.current.handleFormChange("amount", "20"); });
        expect(result.current.quote).toBeNull();
        expect(result.current.quoteError).toBeNull();
    });

    // --- Quote fetching (real-time effect) ---

    it("fetches quote when amount is set", async () => {
        const { result } = renderHook(() => useOfframpBridge(), { wrapper: createWrapper() });

        act(() => { result.current.handleFormChange("amount", "10"); });
        await drainTimers();

        expect(result.current.quote).toEqual(mockQuote);
        expect(result.current.quoteError).toBeNull();
    });

    it("sets quoteError when rate fetch fails", async () => {
        (offrampService.getAggregatedRates as ReturnType<typeof vi.fn>).mockResolvedValue({
            success: false,
            error: "No rates available",
        });

        const { result } = renderHook(() => useOfframpBridge(), { wrapper: createWrapper() });

        act(() => { result.current.handleFormChange("amount", "10"); });
        await drainTimers();

        expect(result.current.quoteError).toBe("No rates available");
        expect(result.current.quote).toBeNull();
    });

    it("sets quoteError on network error during rate fetch", async () => {
        (offrampService.getAggregatedRates as ReturnType<typeof vi.fn>).mockRejectedValue(
            new Error("Network error")
        );

        const { result } = renderHook(() => useOfframpBridge(), { wrapper: createWrapper() });

        act(() => { result.current.handleFormChange("amount", "10"); });
        await drainTimers();

        expect(result.current.quoteError).toBe("Failed to fetch rates");
    });

    it("rejects an amount below the provider minimum", async () => {
        const { result } = renderHook(() => useOfframpBridge(), { wrapper: createWrapper() });

        act(() => { result.current.handleFormChange("amount", "5"); });
        await drainTimers();

        expect(result.current.providerMinimumAmount).toBe(10);
        await act(async () => { await result.current.getQuote({ ...result.current.formState }); });

        expect(result.current.error).toBe("Amount must be at least 10 USDC");
        expect(offrampService.createOfframp).not.toHaveBeenCalled();
    });

    it("falls back to the token minimum when provider limits are unavailable", async () => {
        (offrampService.getProviderLimits as ReturnType<typeof vi.fn>).mockResolvedValue({
            success: false,
            error: "Provider limits unavailable",
        });
        const { result } = renderHook(() => useOfframpBridge(), { wrapper: createWrapper() });

        await drainTimers();

        expect(result.current.providerMinimumAmount).toBe(1);
        expect(result.current.isLoadingProviderMinimum).toBe(false);
    });

    // --- getQuote (form → quote step) ---

    it("getQuote transitions step to 'quote' on success", async () => {
        (offrampService.createOfframp as ReturnType<typeof vi.fn>).mockResolvedValue({
            success: true,
            data: mockOfframpData,
        });

        const { result } = renderHook(() => useOfframpBridge(), { wrapper: createWrapper() });

        act(() => { result.current.handleFormChange("amount", "10"); });
        await drainTimers();
        expect(result.current.quote).not.toBeNull();

        await act(async () => { await result.current.getQuote({ ...result.current.formState }); });

        expect(result.current.step).toBe("quote");
        expect(result.current.offrampData).toEqual(mockOfframpData);
        expect(result.current.isLoading).toBe(false);
    });

    it("getQuote sets error when wallet not connected", async () => {
        (useWallet as ReturnType<typeof vi.fn>).mockReturnValue({ ...mockWallet, isConnected: false, address: null });

        const { result } = renderHook(() => useOfframpBridge(), { wrapper: createWrapper() });

        await act(async () => { await result.current.getQuote(result.current.formState); });

        expect(result.current.error).toBe("Please connect your wallet first");
        expect(result.current.step).toBe("form");
    });

    it("getQuote sets error when no quote available", async () => {
        const { result } = renderHook(() => useOfframpBridge(), { wrapper: createWrapper() });

        await act(async () => { await result.current.getQuote(result.current.formState); });

        expect(result.current.error).toBe("No valid quote available. Please check your input.");
    });

    it("getQuote sets error when createOfframp fails", async () => {
        (offrampService.createOfframp as ReturnType<typeof vi.fn>).mockResolvedValue({
            success: false,
            error: "Offramp creation failed",
        });

        const { result } = renderHook(() => useOfframpBridge(), { wrapper: createWrapper() });

        act(() => { result.current.handleFormChange("amount", "10"); });
        await drainTimers();
        expect(result.current.quote).not.toBeNull();

        await act(async () => { await result.current.getQuote({ ...result.current.formState }); });

        expect(result.current.error).toBe("Offramp creation failed");
        expect(result.current.step).toBe("form");
    });

    // --- getQuote daily tier limit validation ---

    it("getQuote sets error when amount exceeds daily tier limit", async () => {
        const { result } = renderHook(() => useOfframpBridge(), { wrapper: createWrapper() });

        // Set amount to 5000 which exceeds the mock daily limit of 1000
        act(() => { result.current.handleFormChange("amount", "5000"); });
        await drainTimers();
        expect(result.current.userLimits).not.toBeNull();
        expect(result.current.quote).not.toBeNull();

        await act(async () => { await result.current.getQuote({ ...result.current.formState }); });

        expect(result.current.error).toContain("Amount exceeds your daily offramp limit");
        expect(result.current.step).toBe("form");
    });

    it("getQuote allows amount within daily tier limit", async () => {
        (offrampService.createOfframp as ReturnType<typeof vi.fn>).mockResolvedValue({
            success: true,
            data: mockOfframpData,
        });

        const { result } = renderHook(() => useOfframpBridge(), { wrapper: createWrapper() });

        // Set amount to 500 which is within the mock daily limit of 1000
        act(() => { result.current.handleFormChange("amount", "500"); });
        await drainTimers();
        expect(result.current.userLimits).not.toBeNull();
        expect(result.current.quote).not.toBeNull();

        await act(async () => { await result.current.getQuote({ ...result.current.formState }); });

        expect(result.current.step).toBe("quote");
        expect(result.current.offrampData).toEqual(mockOfframpData);
    });

    it("getQuote allows submission when user limits fetch fails (graceful degradation)", async () => {
        (offrampService.getUserLimits as ReturnType<typeof vi.fn>).mockResolvedValue({
            success: false,
            error: "Failed to fetch limits",
        });
        (offrampService.createOfframp as ReturnType<typeof vi.fn>).mockResolvedValue({
            success: true,
            data: mockOfframpData,
        });

        const { result } = renderHook(() => useOfframpBridge(), { wrapper: createWrapper() });

        act(() => { result.current.handleFormChange("amount", "5000"); });
        await drainTimers();
        expect(result.current.userLimits).toBeNull();
        expect(result.current.quote).not.toBeNull();

        await act(async () => { await result.current.getQuote({ ...result.current.formState }); });

        // Should succeed because limits fetch failed → validation skipped
        expect(result.current.step).toBe("quote");
        expect(result.current.offrampData).toEqual(mockOfframpData);
    });

    // --- confirmAndBridge ---

    async function setupToQuoteStep(result: { current: ReturnType<typeof useOfframpBridge> }) {
        act(() => { result.current.handleFormChange("amount", "10"); });
        await drainTimers();
        expect(result.current.quote).not.toBeNull();
        await act(async () => { await result.current.getQuote({ ...result.current.formState }); });
        expect(result.current.step).toBe("quote");
    }

    it("confirmAndBridge transitions to processing and starts polling", async () => {
        (offrampService.createOfframp as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, data: mockOfframpData });
        (offrampService.getQuoteStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
            success: true,
            data: { status: "pending", providerMessage: "Pending" },
        });

        const { result } = renderHook(() => useOfframpBridge(), { wrapper: createWrapper() });
        await setupToQuoteStep(result);

        await act(async () => { await result.current.confirmAndBridge(); });
        expect(result.current.step).toBe("processing");

        expect(result.current.step).toBe("processing");
    });

    it("confirmAndBridge sets error when missing required data", async () => {
        const { result } = renderHook(() => useOfframpBridge(), { wrapper: createWrapper() });

        await act(async () => { await result.current.confirmAndBridge(); });

        // Advance timers again — polling should have stopped, no additional calls
        const callCount = (offrampService.getQuoteStatus as ReturnType<typeof vi.fn>).mock.calls.length;
        await act(async () => { vi.advanceTimersByTime(30000); });
        await act(async () => { await Promise.resolve(); });
        expect((offrampService.getQuoteStatus as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callCount);
    });

    it("payout polling transitions to 'completed' on 'confirmed' status", async () => {
        (offrampService.createOfframp as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, data: mockOfframpData });
        (offrampService.getQuoteStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
            success: true,
            data: { status: "confirmed", providerMessage: "Confirmed" },
        });

        const { result } = renderHook(() => useOfframpBridge(), { wrapper: createWrapper() });
        await setupToQuoteStep(result);
        await act(async () => { await result.current.confirmAndBridge(); });
        expect(result.current.step).toBe("processing");

        await act(async () => { vi.advanceTimersByTime(10000); });
        await act(async () => { await Promise.resolve(); });
        expect(result.current.step).toBe("completed");
    });

    it("payout polling transitions to 'failed' and stops polling", async () => {
        (offrampService.createOfframp as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, data: mockOfframpData });
        (offrampService.getQuoteStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
            success: true,
            data: { status: "failed", providerMessage: "Payout rejected" },
        });

        const { result } = renderHook(() => useOfframpBridge(), { wrapper: createWrapper() });
        await setupToQuoteStep(result);

        await act(async () => { vi.advanceTimersByTime(10000); });
        await act(async () => { await Promise.resolve(); });
        expect(result.current.step).toBe("failed");
        expect(result.current.error).toBe("Payout rejected");

        const callCount = (offrampService.getQuoteStatus as ReturnType<typeof vi.fn>).mock.calls.length;
        await act(async () => { vi.advanceTimersByTime(30000); });
        await act(async () => { await Promise.resolve(); });
        expect((offrampService.getQuoteStatus as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callCount);
    });

    // --- goBack ---

    it("goBack from 'quote' returns to 'form' and clears quote data", async () => {
        (offrampService.createOfframp as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, data: mockOfframpData });

        const { result } = renderHook(() => useOfframpBridge(), { wrapper: createWrapper() });
        await setupToQuoteStep(result);

        act(() => { result.current.goBack(); });

        expect(result.current.step).toBe("form");
        expect(result.current.offrampData).toBeNull();
        expect(result.current.error).toBeNull();
    });

    // --- reset ---

    it("reset returns hook to initial state", async () => {
        (offrampService.createOfframp as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, data: mockOfframpData });

        const { result } = renderHook(() => useOfframpBridge(), { wrapper: createWrapper() });
        await setupToQuoteStep(result);

        act(() => { result.current.reset(); });

        expect(result.current.step).toBe("form");
        expect(result.current.error).toBeNull();
        expect(result.current.isLoading).toBe(false);
        expect(result.current.formState.amount).toBe("");
        expect(result.current.formState.bankCode).toBe("");
        expect(result.current.formState.accountNumber).toBe("");
        expect(result.current.formState.accountName).toBe("");
        expect(result.current.offrampData).toBeNull();
        expect(result.current.payoutStatus).toBeNull();
    });
});
