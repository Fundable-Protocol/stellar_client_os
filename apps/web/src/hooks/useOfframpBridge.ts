"use client";

import { useCallback, useState, useRef, useEffect } from "react";
import toast from "react-hot-toast";
import { useWallet } from "@/providers/StellarWalletProvider";
import { offrampService } from "@/services/offramp.service";
import type {
    OfframpStep,
    OfframpFormState,
    Bank,
    CreateOfframpResponse,
    QuoteStatusData,
    OfframpCountry,
    ProviderRate,
    UserOfframpLimits,
} from "@/types/offramp";
import { SUPPORTED_OFFRAMP_TOKENS, getAccountNumberRules } from "@/types/offramp";

const RATE_LIMIT_MESSAGE = "Rate limit exceeded. Please wait";

function isRateLimitError(error: unknown): boolean {
    if (typeof error === "object" && error !== null) {
        if ("status" in error && error.status === 429) return true;

        if (
            "response" in error &&
            typeof error.response === "object" &&
            error.response !== null &&
            "status" in error.response &&
            error.response.status === 429
        ) {
            return true;
        }
    }

    const message =
        error instanceof Error
            ? error.message
            : typeof error === "string"
                ? error
                : "";

    return /\b429\b|rate limit|too many requests/i.test(message);
}

interface UseOfframpBridgeReturn {
    // State
    step: OfframpStep;
    error: string | null;
    isLoading: boolean;

    // Form State
    formState: OfframpFormState;
    handleFormChange: (field: keyof OfframpFormState, value: string) => void;
    handleMaxClick: (balance: string) => void;

    // Bank operations
    banks: Bank[];
    isLoadingBanks: boolean;
    isVerifyingAccount: boolean;
    loadBanks: (country: OfframpCountry) => Promise<void>;
    verifyAccount: (
        bankCode: string,
        accountNumber: string,
        country: string
    ) => Promise<string | null>;

    // Quote
    quote: ProviderRate | null;
    isLoadingQuote: boolean;
    quoteError: string | null;
    offrampData: CreateOfframpResponse["data"] | null;
    getQuote: (form: OfframpFormState) => Promise<void>;
    confirmAndBridge: () => Promise<void>;

    // Status tracking
    bridgeTxHash: string | null;
    payoutStatus: QuoteStatusData | null;

    // User Limits
    userLimits: UserOfframpLimits | null;
    isLoadingLimits: boolean;

    // Provider minimum
    providerMinimumAmount: number;
    isLoadingProviderMinimum: boolean;

    // Controls
    reset: () => void;
    goBack: () => void;
}

export function useOfframpBridge(): UseOfframpBridgeReturn {
    const { address, isConnected } = useWallet();

    // Core state
    const [step, setStep] = useState<OfframpStep>("form");
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // Form State
    const [formState, setFormState] = useState<OfframpFormState>({
        token: "USDC",
        amount: "",
        country: "NG",
        bankCode: "",
        accountNumber: "",
        accountName: "",
    });

    // Bank & Quote State
    const [banks, setBanks] = useState<Bank[]>([]);
    const [isLoadingBanks, setIsLoadingBanks] = useState(false);
    const [isVerifyingAccount, setIsVerifyingAccount] = useState(false);
    const [isLoadingQuote, setIsLoadingQuote] = useState(false);
    const [quote, setQuote] = useState<ProviderRate | null>(null);
    const [quoteError, setQuoteError] = useState<string | null>(null);

    // Result State
    const [offrampData, setOfframpData] = useState<CreateOfframpResponse["data"] | null>(null);
    const [bridgeTxHash, setBridgeTxHash] = useState<string | null>(null);
    const [payoutStatus, setPayoutStatus] = useState<QuoteStatusData | null>(null);

    // User Limits State
    const [userLimits, setUserLimits] = useState<UserOfframpLimits | null>(null);
    const [isLoadingLimits, setIsLoadingLimits] = useState(false);
    const [providerMinimumAmount, setProviderMinimumAmount] = useState(
        SUPPORTED_OFFRAMP_TOKENS.find((token) => token.symbol === "USDC")?.minimumAmount ?? 0
    );
    const [isLoadingProviderMinimum, setIsLoadingProviderMinimum] = useState(false);

    // Polling refs
    const payoutPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    // Abort controller ref for component-level cleanup
    const abortRef = useRef<AbortController | null>(null);

    // Cleanup polling and in-flight requests on unmount
    useEffect(() => {
        return () => {
            if (payoutPollRef.current) clearInterval(payoutPollRef.current);
            abortRef.current?.abort();
        };
    }, []);

    // ---------- Effects: User Limits ----------

    useEffect(() => {
        if (!isConnected || !address) {
            setUserLimits(null);
            return;
        }

        const controller = new AbortController();

        const fetchLimits = async () => {
            setIsLoadingLimits(true);
            try {
                const result = await offrampService.getUserLimits(address, controller.signal);
                if (controller.signal.aborted) return;
                if (result.success && result.data) {
                    setUserLimits(result.data);
                } else {
                    // Non-fatal: proceed without limits if fetch fails
                    console.warn("Failed to fetch user offramp limits:", result.error);
                }
            } catch (error) {
                if (controller.signal.aborted) return;
                console.warn("Error fetching user offramp limits:", error);
            } finally {
                if (!controller.signal.aborted) setIsLoadingLimits(false);
            }
        };

        fetchLimits();
        return () => controller.abort();
    }, [isConnected, address]);

    // ---------- Effects: Provider Minimum ----------

    useEffect(() => {
        const fallbackMinimum =
            SUPPORTED_OFFRAMP_TOKENS.find((token) => token.symbol === formState.token)
                ?.minimumAmount ?? 0;
        const controller = new AbortController();

        setProviderMinimumAmount(fallbackMinimum);
        setIsLoadingProviderMinimum(true);

        const fetchProviderMinimum = async () => {
            try {
                const result = await offrampService.getProviderLimits(
                    {
                        token: formState.token,
                        country: formState.country,
                        network: "polygon",
                    },
                    controller.signal
                );

                if (controller.signal.aborted) return;
                if (result.success && result.data) {
                    setProviderMinimumAmount(result.data.minimumAmount);
                } else {
                    console.warn("Failed to fetch provider offramp limits:", result.error);
                }
            } catch (error) {
                if (controller.signal.aborted) return;
                console.warn("Error fetching provider offramp limits:", error);
            } finally {
                if (!controller.signal.aborted) setIsLoadingProviderMinimum(false);
            }
        };

        fetchProviderMinimum();
        return () => controller.abort();
    }, [formState.token, formState.country]);

    // ---------- Handlers ----------

    const handleFormChange = useCallback((field: keyof OfframpFormState, value: string) => {
        setFormState((prev) => ({
            ...prev,
            [field]: value,
            ...(field === "bankCode" || field === "accountNumber"
                ? { accountName: "" }
                : {}),
        }));
        if (field === "amount") {
            setQuote(null);
            setQuoteError(null);
        }
    }, []);

    const handleMaxClick = useCallback((balance: string) => {
        setFormState(prev => ({ ...prev, amount: balance }));
    }, []);

    // ---------- Effects: Bank Loading ----------

    useEffect(() => {
        const controller = new AbortController();
        abortRef.current = controller;

        const fetchBanks = async () => {
            setIsLoadingBanks(true);
            setBanks([]);
            setFormState(prev => ({ ...prev, bankCode: "", accountNumber: "", accountName: "" }));

            try {
                const result = await offrampService.getBankList(formState.country, address || undefined, controller.signal);
                if (controller.signal.aborted) return;
                if (result.success && result.data) {
                    const uniqueBanks = result.data.filter(
                        (bank, index, self) =>
                            index === self.findIndex((b) => b.code === bank.code)
                    );
                    setBanks(uniqueBanks);
                }
            } catch (error) {
                if (controller.signal.aborted) return;
                console.error("Failed to load banks:", error);
            } finally {
                if (!controller.signal.aborted) setIsLoadingBanks(false);
            }
        };

        fetchBanks();
        return () => controller.abort();
    }, [formState.country, address]);

    // ---------- Effects: Account Verification ----------

    useEffect(() => {
        if (!formState.bankCode || formState.accountNumber.length < getAccountNumberRules(formState.country).min) {
            setFormState(prev => ({ ...prev, accountName: "" }));
            return;
        }

        const controller = new AbortController();

        const timer = setTimeout(async () => {
            setIsVerifyingAccount(true);
            try {
                const result = await offrampService.verifyBankAccount(
                    formState.bankCode,
                    formState.accountNumber,
                    formState.country,
                    address || undefined,
                    controller.signal
                );

                if (controller.signal.aborted) return;
                if (result.success && result.data) {
                    setFormState(prev => ({ ...prev, accountName: result.data!.accountName }));
                } else {
                    setFormState(prev => ({ ...prev, accountName: "" }));
                }
            } catch {
                if (!controller.signal.aborted) setFormState(prev => ({ ...prev, accountName: "" }));
            } finally {
                if (!controller.signal.aborted) setIsVerifyingAccount(false);
            }
        }, 500);

        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [formState.bankCode, formState.accountNumber, formState.country, address]);

    // ---------- Effects: Real-time Quote ----------

    useEffect(() => {
        const amount = parseFloat(formState.amount);
        if (!formState.amount || isNaN(amount) || amount <= 0) {
            setQuote(null);
            setQuoteError(null);
            return;
        }

        const controller = new AbortController();

        const fetchQuote = async () => {
            setIsLoadingQuote(true);
            try {
                const result = await offrampService.getAggregatedRates({
                    token: formState.token,
                    amount: amount,
                    country: formState.country,
                    currency: formState.country === "NG" ? "NGN" : formState.country === "GH" ? "GHS" : "KES",
                }, controller.signal);

                if (controller.signal.aborted) return;
                if (result.success && result.data?.best) {
                    setQuote(result.data.best);
                    setQuoteError(null);
                } else {
                    const rateLimited =
                        result.status === 429 || isRateLimitError(result.error);
                    const message = rateLimited
                        ? RATE_LIMIT_MESSAGE
                        : result.error || "No rates available";

                    setQuote(null);
                    setQuoteError(message);
                    if (rateLimited) toast.error(message);
                }
            } catch (error) {
                if (!controller.signal.aborted) {
                    const rateLimited = isRateLimitError(error);
                    const message = rateLimited
                        ? RATE_LIMIT_MESSAGE
                        : "Failed to fetch rates";

                    setQuote(null);
                    setQuoteError(message);
                    if (rateLimited) toast.error(message);
                }
            } finally {
                if (!controller.signal.aborted) setIsLoadingQuote(false);
            }
        };

        const timer = setTimeout(fetchQuote, 500);
        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [formState.amount, formState.token, formState.country]);

    // ---------- Payout Logic ----------

    const getQuote = useCallback(
        async (form: OfframpFormState) => {
            if (!isConnected || !address) {
                setError("Please connect your wallet first");
                return;
            }
            if (!quote) {
                setError("No valid quote available. Please check your input.");
                return;
            }
            if (isLoadingProviderMinimum) {
                setError("Provider minimum is still loading. Please try again.");
                return;
            }

            const amount = parseFloat(form.amount);
            if (amount < providerMinimumAmount) {
                setError(`Amount must be at least ${providerMinimumAmount} ${form.token}`);
                return;
            }

            // Validate against user's daily tier limit before proceeding to signature
            if (userLimits && amount > userLimits.remainingDaily) {
                setError(
                    `Amount exceeds your daily offramp limit. ` +
                    `Remaining: ${userLimits.remainingDaily.toLocaleString()} ${form.token} ` +
                    `(Daily limit: ${userLimits.dailyLimit.toLocaleString()} ${form.token})`
                );
                return;
            }

            setIsLoading(true);
            setError(null);

            const controller = new AbortController();
            abortRef.current = controller;

            try {
                const amount = parseFloat(form.amount);

                const offrampRes = await offrampService.createOfframp(
                    {
                        providerId: quote.providerId,
                        token: form.token,
                        amount,
                        country: form.country,
                        currency: form.country === "NG" ? "NGN" : form.country === "GH" ? "GHS" : "KES",
                        bankCode: form.bankCode,
                        accountNumber: form.accountNumber,
                        accountName: form.accountName,
                    },
                    address,
                    controller.signal
                );

                if (controller.signal.aborted) return;

                if (!offrampRes.success || !offrampRes.data) {
                    setError(offrampRes.error || "Failed to create offramp quote");
                    setIsLoading(false);
                    return;
                }

                setOfframpData(offrampRes.data);
                setStep("quote");
            } catch (e) {
                if (controller.signal.aborted) return;
                setError(e instanceof Error ? e.message : "Failed to process quote");
            } finally {
                if (!controller.signal.aborted) setIsLoading(false);
            }
        },
        [
            isConnected,
            address,
            quote,
            userLimits,
            providerMinimumAmount,
            isLoadingProviderMinimum,
        ]
    );

    // ---------- Status Polling ----------

    const startPayoutPolling = useCallback(() => {
        if (!offrampData?.reference) return;
        if (payoutPollRef.current) clearInterval(payoutPollRef.current);
        payoutPollRef.current = setInterval(async () => {
            try {
                const res = await offrampService.getQuoteStatus(offrampData.reference, address || undefined);
                if (res.success && res.data) {
                    setPayoutStatus(res.data);
                    if (res.data.status === "completed" || res.data.status === "confirmed") {
                        if (payoutPollRef.current) clearInterval(payoutPollRef.current);
                        setStep("completed");
                    } else if (res.data.status === "failed") {
                        if (payoutPollRef.current) clearInterval(payoutPollRef.current);
                        setStep("failed");
                        setError(res.data.providerMessage || "Payout failed");
                    }
                }
            } catch {
                // Keep polling
            }
        }, 10000);
    }, [offrampData, address]);

    // ---------- Confirm & Process ----------

    const confirmAndBridge = useCallback(async () => {
        if (!isConnected || !address || !offrampData) {
            setError("Missing required data");
            return;
        }

        setIsLoading(true);
        setError(null);
        setStep("processing");

        try {
            startPayoutPolling();
        } catch (e) {
            const msg = e instanceof Error ? e.message : "Processing failed";
            setStep("failed");
            setError(msg);
        } finally {
            setIsLoading(false);
        }
    }, [isConnected, address, offrampData, startPayoutPolling]);

    // ---------- Controls ----------

    const reset = useCallback(() => {
        if (payoutPollRef.current) clearInterval(payoutPollRef.current);
        setStep("form");
        setError(null);
        setIsLoading(false);
        setFormState({
            token: "USDC",
            amount: "",
            country: "NG",
            bankCode: "",
            accountNumber: "",
            accountName: "",
        });
        setOfframpData(null);
        setBridgeTxHash(null);
        setPayoutStatus(null);
        setQuote(null);
        setQuoteError(null);
        setIsLoadingQuote(false);
        setIsVerifyingAccount(false);
        setIsLoadingBanks(false);
    }, []);

    const goBack = useCallback(() => {
        if (step === "quote") {
            setStep("form");
            setOfframpData(null);
            setError(null);
        }
    }, [step]);

    return {
        step,
        error,
        isLoading,
        banks,
        loadBanks: async () => { },
        verifyAccount: async () => null,
        offrampData,
        getQuote,
        confirmAndBridge,
        bridgeTxHash,
        payoutStatus,
        reset,
        goBack,
        formState,
        handleFormChange,
        handleMaxClick,
        isLoadingQuote,
        quote,
        quoteError,
        isVerifyingAccount,
        isLoadingBanks,
        userLimits,
        isLoadingLimits,
        providerMinimumAmount,
        isLoadingProviderMinimum,
    };
}
