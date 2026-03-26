// Offramp API Service — Backend API client for offramp functionality
// Mirrors the evm_client's cashwyreService pattern, calling the same backend endpoints

import type {
    OfframpCountry,
    BankListResponse,
    VerifyBankAccountResponse,
    AggregatedRatesResponse,
    CreateOfframpRequest,
    CreateOfframpResponse,
    QuoteStatusResponse,
} from "@/types/offramp";
import { withRetry, RetryableError } from "@/utils/retry";
import {
    isOfframpMockEnabled,
    mockOfframpService,
} from "@/services/offramp.mock";

const API_BASE =
    process.env.NEXT_PUBLIC_BACKEND_BASE_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "";
const OFFRAMP_API_BASE = `${API_BASE}/api/offramp`;

const getHeaders = (walletId?: string) => ({
    "Content-Type": "application/json",
    ...(walletId ? { "x-wallet-id": walletId } : {}),
});

async function fetchWithRetry(input: string, init?: RequestInit): Promise<Response> {
    return withRetry(async () => {
        const res = await fetch(input, init);
        if (res.status >= 500) throw new RetryableError(res.statusText, res.status);
        return res;
    });
}

const realOfframpService = {
    async syncWallet(walletId: string): Promise<{ success: boolean; message: string }> {
        try {
            const res = await fetchWithRetry(`${OFFRAMP_API_BASE}/sync`, {
                method: "GET",
                headers: getHeaders(walletId),
            });

            const data = await res.json();
            if (!res.ok) {
                const errorMessage = data.info?.message || data.message || "Failed to sync wallet";
                throw new Error(errorMessage);
            }

            return { success: true, message: data.message || "Wallet synced" };
        } catch (error) {
            console.error("Wallet sync failed:", error);
            return {
                success: false,
                message: error instanceof Error ? error.message : "Sync failed",
            };
        }
    },

    async getAggregatedRates(params: {
        token: string;
        amount: number;
        country: string;
        currency: string;
    }): Promise<AggregatedRatesResponse> {
        try {
            const queryParams = new URLSearchParams({
                token: params.token,
                amount: params.amount.toString(),
                country: params.country,
                currency: params.currency,
                network: "polygon",
            });

            const res = await fetchWithRetry(`${OFFRAMP_API_BASE}/rates?${queryParams}`, {
                method: "GET",
                headers: getHeaders(),
            });

            const data = await res.json();

            if (!res.ok) {
                return {
                    success: false,
                    error: data.message || data.error || "Failed to get rates",
                };
            }

            return { success: true, data: data.data || data };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : "Failed to get rates",
            };
        }
    },

    async createOfframp(
        request: Omit<CreateOfframpRequest, "network">,
        walletId: string
    ): Promise<CreateOfframpResponse> {
        try {
            const res = await fetchWithRetry(`${OFFRAMP_API_BASE}/create`, {
                method: "POST",
                headers: getHeaders(walletId),
                body: JSON.stringify({ ...request, network: "polygon" }),
            });

            const data = await res.json();

            if (!res.ok) {
                const errorMessage = data.info?.message || data.message || data.error || "Failed to create offramp";
                return { success: false, error: errorMessage };
            }

            return { success: true, data: data.data || data };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : "Failed to create offramp",
            };
        }
    },

    async getBankList(country: OfframpCountry, walletId?: string): Promise<BankListResponse> {
        try {
            const res = await fetchWithRetry(`${OFFRAMP_API_BASE}/banks?country=${country}`, {
                method: "GET",
                headers: getHeaders(walletId),
            });

            const data = await res.json();

            if (!res.ok) {
                const errorMessage = data.info?.message || data.message || data.error || "Failed to fetch bank list";
                return { success: false, error: errorMessage };
            }

            return { success: true, data: data.data || data };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : "Failed to fetch bank list",
            };
        }
    },

    async verifyBankAccount(
        bankCode: string,
        accountNumber: string,
        country: string,
        walletId?: string
    ): Promise<VerifyBankAccountResponse> {
        try {
            const res = await fetchWithRetry(`${OFFRAMP_API_BASE}/verify-account`, {
                method: "POST",
                headers: getHeaders(walletId),
                body: JSON.stringify({ bankCode, accountNumber, country }),
            });

            const data = await res.json();

            if (!res.ok) {
                return {
                    success: false,
                    error: data.message || data.error || "Failed to verify bank account",
                };
            }

            return { success: true, data: data.data || data };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : "Failed to verify bank account",
            };
        }
    },

    async saveQuote(
        params: {
            walletAddress: string;
            transactionReference: string;
            token: string;
            amount: number;
            country: string;
            currency: string;
            network: string;
            quoteData: Record<string, unknown>;
            bankCode?: string;
            accountNumber?: string;
            accountName?: string;
            expiresAt?: string;
            amountUsd?: number;
            amountLocal?: number;
        },
        walletId?: string
    ): Promise<{ success: boolean; data?: unknown; error?: string }> {
        try {
            const res = await fetchWithRetry(`${OFFRAMP_API_BASE}/quote/save`, {
                method: "POST",
                headers: getHeaders(walletId),
                body: JSON.stringify(params),
            });

            const data = await res.json();

            if (!res.ok) {
                return { success: false, error: data.message || data.error || "Failed to save quote" };
            }

            return { success: true, data: data.data || data };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : "Failed to save quote",
            };
        }
    },

    async updateQuoteTxHash(
        transactionReference: string,
        txHash: string,
        walletId?: string
    ): Promise<{ success: boolean; data?: unknown; error?: string }> {
        try {
            const res = await fetchWithRetry(`${OFFRAMP_API_BASE}/quote/update-tx`, {
                method: "POST",
                headers: getHeaders(walletId),
                body: JSON.stringify({ transactionReference, txHash }),
            });

            const data = await res.json();

            if (!res.ok) {
                return { success: false, error: data.message || data.error || "Failed to update tx hash" };
            }

            return { success: true, data: data.data || data };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : "Failed to update tx hash",
            };
        }
    },

    async getQuoteStatus(
        transactionReference: string,
        walletId?: string
    ): Promise<QuoteStatusResponse> {
        try {
            const res = await fetchWithRetry(
                `${API_BASE}/api/webhook/quote/${transactionReference}`,
                {
                    method: "GET",
                    headers: getHeaders(walletId),
                }
            );

            const data = await res.json();

            if (!res.ok) {
                return {
                    success: false,
                    error: data.message || data.error || "Failed to get quote status",
                };
            }

            return { success: true, data: data.data || data };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : "Failed to get quote status",
            };
        }
    },
};

const shouldUseMock =
    isOfframpMockEnabled || (!API_BASE && process.env.NODE_ENV !== "production");

export const offrampService = shouldUseMock
    ? mockOfframpService
    : realOfframpService;
