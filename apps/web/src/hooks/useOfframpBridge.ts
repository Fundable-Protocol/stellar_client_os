"use client";

import { useCallback, useState, useRef, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/providers/StellarWalletProvider";
import { fetchAccountInfo } from "@/lib/api";
import { type AccountBalance } from "@/services";
import { allbridgeService, type BridgeQuote } from "@/services/allbridge.service";
import { offrampService } from "@/services/offramp.service";
import {
    createMockTxHash,
    getMockBridgeQuote,
    getMockDelay,
    isOfframpMockEnabled,
} from "@/services/offramp.mock";
import { isAbortError } from "@/utils/retry";
import type {
    OfframpStep,
    OfframpFormState,
    BridgeFeeBreakdown,
    Bank,
    CreateOfframpResponse,
    QuoteStatusData,
    OfframpCountry,
    ProviderRate,
} from "@/types/offramp";

interface UseOfframpBridgeReturn {
    // State
    step: OfframpStep;
    error: string | null;
    isLoading: boolean;

    // Form State
    formState: OfframpFormState;
    handleFormChange: (field: keyof OfframpFormState, value: string) => void;
    handleMaxClick: () => void;
    currentTokenBalance: string;
    isLoadingBalance: boolean;

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

    // Quote & bridge
    quote: ProviderRate | null;
    isLoadingQuote: boolean;
    quoteError: string | null;
    bridgeQuote: BridgeQuote | null;
    feeBreakdown: BridgeFeeBreakdown | null;
    offrampData: CreateOfframpResponse["data"] | null;
    getQuote: (form: OfframpFormState) => Promise<void>;
    confirmAndBridge: () => Promise<void>;

    // Status tracking
    bridgeTxHash: string | null;
    payoutStatus: QuoteStatusData | null;

    // Controls
    reset: () => void;
    goBack: () => void;
}

/**
 * Manages the full offramp bridge flow: bank selection, quote fetching,
 * bridging via Allbridge, and polling for offramp completion.
 *
 * @returns State and control functions for each step of the offramp process
 */
export function useOfframpBridge(): UseOfframpBridgeReturn {
    const { address, isConnected, signTransaction, network } = useWallet();

    // Core state
    const [step, setStep] = useState<OfframpStep>("form");
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false); // For final bridge confirmation

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
    const [bridgeQuote, setBridgeQuote] = useState<BridgeQuote | null>(null);
    const [feeBreakdown, setFeeBreakdown] = useState<BridgeFeeBreakdown | null>(null);
    const [offrampData, setOfframpData] = useState<CreateOfframpResponse["data"] | null>(null);
    const [bridgeTxHash, setBridgeTxHash] = useState<string | null>(null);
    const [payoutStatus, setPayoutStatus] = useState<QuoteStatusData | null>(null);

    // Polling refs
    const bridgePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const payoutPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // ---------- Balance Fetching ----------
    const { data: accountInfo, isLoading: isLoadingBalance } = useQuery({
        queryKey: ["token-balances", address, network],
        queryFn: async ({ signal }: { signal: AbortSignal }) => address ? fetchAccountInfo(address, signal) : null,
        enabled: isConnected && !!address,
        staleTime: 30000,
    });

    const currentTokenBalance = useMemo(() => {
        if (!accountInfo) return "0";
        // Find balance for selected token (USDC, USDT, or XLM)
        const balance = accountInfo.balances.find((b: AccountBalance) => 
            b.assetCode === formState.token || (formState.token === "XLM" && b.assetType === "native")
        );
        return balance?.balance || "0";
    }, [accountInfo, formState.token]);

    // Cleanup polling on unmount
    useEffect(() => {
        return () => {
            if (bridgePollRef.current) clearInterval(bridgePollRef.current);
            if (payoutPollRef.current) clearInterval(payoutPollRef.current);
        };
    }, []);

    // ---------- Handlers ----------

    const delay = useCallback(async (key: Parameters<typeof getMockDelay>[0]) => {
        await new Promise((resolve) => setTimeout(resolve, getMockDelay(key)));
    }, []);

    const handleFormChange = useCallback((field: keyof OfframpFormState, value: string) => {
        setFormState((prev: OfframpFormState) => ({
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

    const handleMaxClick = useCallback(() => {
        setFormState((prev: OfframpFormState) => ({ ...prev, amount: currentTokenBalance }));
    }, [currentTokenBalance]);

    // ---------- Effects: Bank Loading ----------

    useEffect(() => {
        const controller = new AbortController();

        const fetchBanks = async () => {
            setIsLoadingBanks(true);
            setBanks([]);
            setFormState((prev: OfframpFormState) => ({ ...prev, bankCode: "", accountNumber: "", accountName: "" }));

            try {
                const result = await offrampService.getBankList(
                    formState.country,
                    address || undefined,
                    controller.signal
                );
                if (controller.signal.aborted) {
                    return;
                }
                if (result.success && result.data) {
                    // Deduplicate banks
                    const uniqueBanks = result.data.filter(
                        (bank, index, self) =>
                            index === self.findIndex((b) => b.code === bank.code)
                    );
                    setBanks(uniqueBanks);
                }
            } catch (error) {
                if (isAbortError(error)) {
                    return;
                }
            } finally {
                if (!controller.signal.aborted) {
                    setIsLoadingBanks(false);
                }
            }
        };

        fetchBanks();
        return () => controller.abort();
    }, [formState.country, address]);

    // ---------- Effects: Account Verification ----------

    useEffect(() => {
        if (!formState.bankCode || formState.accountNumber.length < 10) {
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
                if (controller.signal.aborted) {
                    return;
                }

                if (result.success && result.data) {
                    setFormState((prev: OfframpFormState) => ({ ...prev, accountName: result.data!.accountName }));
                } else {
                    setFormState((prev: OfframpFormState) => ({ ...prev, accountName: "" }));
                }
            } catch (error) {
                if (isAbortError(error)) {
                    return;
                }
                setFormState(prev => ({ ...prev, accountName: "" }));
            } finally {
                if (!controller.signal.aborted) {
                    setIsVerifyingAccount(false);
                }
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
                if (controller.signal.aborted) {
                    return;
                }

                if (result.success && result.data?.best) {
                    setQuote(result.data.best);
                    setQuoteError(null);
                } else {
                    setQuote(null);
                    setQuoteError(result.error || "No rates available");
                }
            } catch (error) {
                if (isAbortError(error)) {
                    return;
                }
                setQuote(null);
                setQuoteError("Failed to fetch rates");
            } finally {
                if (!controller.signal.aborted) {
                    setIsLoadingQuote(false);
                }
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

            setIsLoading(true);
            setError(null);

            try {
                const amount = parseFloat(form.amount);

                // Step 1: Create offramp on backend using the selected provider from the quote
                const offrampRes = await offrampService.createOfframp(
                    {
                        providerId: quote.providerId, // Use the provider from the real-time quote
                        token: form.token,
                        amount,
                        country: form.country,
                        currency: form.country === "NG" ? "NGN" : form.country === "GH" ? "GHS" : "KES",
                        bankCode: form.bankCode,
                        accountNumber: form.accountNumber,
                        accountName: form.accountName,
                    },
                    address
                );

                if (!offrampRes.success || !offrampRes.data) {
                    setError(offrampRes.error || "Failed to create offramp quote");
                    setIsLoading(false);
                    return;
                }

                setOfframpData(offrampRes.data);

                // Step 2: Calculate bridge fees using Allbridge SDK
                const depositAmount = offrampRes.data.depositAmount.toString();
                const quoteResult = isOfframpMockEnabled
                    ? getMockBridgeQuote(depositAmount)
                    : await allbridgeService.getBridgeQuote(depositAmount);


                setBridgeQuote(quoteResult);

                // Step 3: Build fee breakdown
                const ratePerUSDC = offrampRes.data.fiatAmount / offrampRes.data.depositAmount;
                const currency = form.country === "NG" ? "NGN" : form.country === "GH" ? "GHS" : "KES";

                setFeeBreakdown({
                    sendAmount: quoteResult.sendAmount,
                    bridgeFee: quoteResult.bridgeFee,
                    receivedOnPolygon: depositAmount,
                    cashwyreFee: (offrampRes.data.depositAmount - offrampRes.data.fiatAmount / ratePerUSDC).toFixed(2),
                    fiatPayout: offrampRes.data.fiatAmount.toString(),
                    currency,
                    exchangeRate: ratePerUSDC.toFixed(2),
                    estimatedTime: quoteResult.estimatedTimeMinutes + 5,
                });

                setStep("quote");
            } catch (e) {
                setError(e instanceof Error ? e.message : "Failed to process quote");
            } finally {
                setIsLoading(false);
            }
        },
        [isConnected, address, quote]
    );

    // ---------- Bridge Execution ----------

    const startPayoutPolling = useCallback(() => {
        if (!offrampData?.reference) return;
        if (payoutPollRef.current) clearInterval(payoutPollRef.current);
        const intervalMs = isOfframpMockEnabled ? getMockDelay("status") : 10000;
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
        }, intervalMs);
    }, [offrampData, address]);

    const confirmAndBridge = useCallback(async () => {
        if (!isConnected || !address || !offrampData || !bridgeQuote) {
            setError("Missing required data");
            return;
        }

        setIsLoading(true);
        setError(null);
        setStep("signing");

        try {
            if (isOfframpMockEnabled) {
                await delay("signing");
                setStep("bridging");

                const txHash = createMockTxHash();
                setBridgeTxHash(txHash);
                await offrampService.updateQuoteTxHash(offrampData.reference, txHash, address);

                await delay("bridging");
                setStep("processing");
                startPayoutPolling();
                return;
            }

            let rawTx = await allbridgeService.buildBridgeTransaction({
                amount: bridgeQuote.sendAmount,
                fromAddress: address,
                toAddress: offrampData.depositAddress,
            });

            const needsRebuild = await allbridgeService.handleBumpIfNeeded(rawTx, address, signTransaction);
            if (needsRebuild) {
                rawTx = await allbridgeService.buildBridgeTransaction({
                    amount: bridgeQuote.sendAmount,
                    fromAddress: address,
                    toAddress: offrampData.depositAddress,
                });
            }

            const signedXdr = await signTransaction(rawTx);
            setStep("bridging");
            const txHash = await allbridgeService.submitTransaction(signedXdr);
            setBridgeTxHash(txHash);

            await offrampService.updateQuoteTxHash(offrampData.reference, txHash, address);
            startBridgePolling(txHash);
        } catch (e) {
            const msg = e instanceof Error ? e.message : "Bridge failed";
            if (msg.includes("declined") || msg.includes("rejected") || msg.includes("cancelled")) {
                setStep("quote");
                setError("Transaction cancelled");
            } else {
                setStep("failed");
                setError(msg);
            }
        } finally {
            setIsLoading(false);
        }
    }, [isConnected, address, offrampData, bridgeQuote, signTransaction, delay, startPayoutPolling]);

    // ---------- Status Polling ----------

    const startBridgePolling = useCallback((txHash: string) => {
        if (bridgePollRef.current) clearInterval(bridgePollRef.current);
        bridgePollRef.current = setInterval(async () => {
            try {
                const status = await allbridgeService.getTransferStatus(txHash);
                if (status && typeof status === "object") {
                    if (bridgePollRef.current) clearInterval(bridgePollRef.current);
                    setStep("processing");
                    startPayoutPolling();
                }
            } catch {
                // Keep polling — bridge may still be in progress
            }
        }, 15000);
    }, [startPayoutPolling]);

    // ---------- Controls ----------

    const reset = useCallback(() => {
        if (bridgePollRef.current) clearInterval(bridgePollRef.current);
        if (payoutPollRef.current) clearInterval(payoutPollRef.current);
        setStep("form");
        setError(null);
        setFormState((prev: OfframpFormState) => ({
            ...prev,
            amount: "",
            bankCode: "",
            accountNumber: "",
            accountName: "",
        }));
        setQuote(null);
        setQuoteError(null);
        setBridgeQuote(null);
        setFeeBreakdown(null);
        setPayoutStatus(null);
        setOfframpData(null);
        setIsLoading(false);
        setIsLoadingQuote(false);
        setIsVerifyingAccount(false);
        setIsLoadingBanks(false);
    }, []);

    const goBack = useCallback(() => {
        if (step === "quote") {
            setStep("form");
            setBridgeQuote(null);
            setFeeBreakdown(null);
            setOfframpData(null);
            setError(null);
        }
    }, [step]);

    return {
        step,
        error,
        isLoading,
        banks,
        loadBanks: async () => { }, // Deprecated but kept for interface compatibility
        verifyAccount: async () => null, // Deprecated but kept for interface compatibility
        bridgeQuote,
        feeBreakdown,
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
        currentTokenBalance,
        isLoadingBalance,
        isLoadingQuote,
        quote,
        quoteError,
        isVerifyingAccount,
        isLoadingBanks,
    };
}
