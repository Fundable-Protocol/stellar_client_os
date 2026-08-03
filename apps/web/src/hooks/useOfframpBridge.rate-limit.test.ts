import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import toast from "react-hot-toast";

import { useWallet } from "@/providers/StellarWalletProvider";
import { offrampService } from "@/services/offramp.service";

import { useOfframpBridge } from "./useOfframpBridge";

vi.mock("react-hot-toast", () => ({
    default: {
        error: vi.fn(),
    },
}));

vi.mock("@/providers/StellarWalletProvider", () => ({
    useWallet: vi.fn(),
}));

vi.mock("@/services/offramp.service", () => ({
    offrampService: {
        getBankList: vi.fn(),
        verifyBankAccount: vi.fn(),
        getAggregatedRates: vi.fn(),
        createOfframp: vi.fn(),
        getQuoteStatus: vi.fn(),
        getUserLimits: vi.fn(),
        getProviderLimits: vi.fn(),
    },
}));

const mockWallet = {
    address: "GABC123",
    isConnected: true,
};

async function requestQuote() {
    const hook = renderHook(() => useOfframpBridge());

    act(() => {
        hook.result.current.handleFormChange("amount", "10");
    });

    await act(async () => {
        await vi.runAllTimersAsync();
    });

    return hook;
}

describe("useOfframpBridge rate limit handling", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.mocked(useWallet).mockReturnValue(mockWallet as ReturnType<typeof useWallet>);
        vi.mocked(offrampService.getBankList).mockResolvedValue({
            success: true,
            data: [],
        });
        vi.mocked(offrampService.getUserLimits).mockResolvedValue({
            success: true,
            data: {
                dailyLimit: 1000,
                dailyUsed: 0,
                remainingDaily: 1000,
                tier: "standard",
            },
        });
        vi.mocked(offrampService.getProviderLimits).mockResolvedValue({
            success: true,
            data: { minimumAmount: 10, providers: [] },
        });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("shows the rate limit toast when the rates API returns 429", async () => {
        vi.mocked(offrampService.getAggregatedRates).mockResolvedValue({
            success: false,
            status: 429,
            error: "Too many requests",
        });

        const { result } = await requestQuote();

        expect(result.current.quote).toBeNull();
        expect(result.current.quoteError).toBe("Rate limit exceeded. Please wait");
        expect(toast.error).toHaveBeenCalledOnce();
        expect(toast.error).toHaveBeenCalledWith("Rate limit exceeded. Please wait");
    });

    it("handles a thrown 429 error without leaking a runtime exception", async () => {
        vi.mocked(offrampService.getAggregatedRates).mockRejectedValue({
            response: { status: 429 },
        });

        const { result } = await requestQuote();

        expect(result.current.quoteError).toBe("Rate limit exceeded. Please wait");
        expect(toast.error).toHaveBeenCalledWith("Rate limit exceeded. Please wait");
    });

    it("preserves the generic message for other network errors", async () => {
        vi.mocked(offrampService.getAggregatedRates).mockRejectedValue(
            new Error("Network error"),
        );

        const { result } = await requestQuote();

        expect(result.current.quoteError).toBe("Failed to fetch rates");
        expect(toast.error).not.toHaveBeenCalled();
    });
});
