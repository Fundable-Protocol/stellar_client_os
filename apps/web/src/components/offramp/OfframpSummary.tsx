"use client";

import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

import type { OfframpFormState, ProviderRate } from "@/types/offramp";
import { SUPPORTED_COUNTRIES, getCurrencySymbol } from "@/types/offramp";

interface OfframpSummaryProps {
    formState: OfframpFormState;
    quote: ProviderRate | null;
    quoteError?: string | null;
    onProceed: () => void;
    isLoading: boolean;
}

export default function OfframpSummary({
    formState,
    quote,
    quoteError,
    onProceed,
    isLoading,
}: OfframpSummaryProps) {
    const [timeLeft, setTimeLeft] = useState<number | null>(null);

    useEffect(() => {
        if (!quote?.expiresAt) {
            setTimeLeft(null);
            return;
        }

        const tick = () => {
            const remaining = Math.floor((new Date(quote.expiresAt!).getTime() - Date.now()) / 1000);
            setTimeLeft(remaining > 0 ? remaining : 0);
        };

        tick();
        const intervalId = setInterval(tick, 1000);

        return () => clearInterval(intervalId);
    }, [quote?.expiresAt]);

    const selectedCountry = SUPPORTED_COUNTRIES.find(
        (c) => c.code === formState.country
    );
    const isFormValid =
        formState.amount &&
        parseFloat(formState.amount) > 0 &&
        formState.bankCode &&
        formState.accountNumber.length >= 10 &&
        formState.accountName;

    const canProceed = isFormValid && quote && !isLoading;

    return (
        <div className="bg-fundable-mid-dark rounded-2xl p-6 border border-gray-800">
            <h2 className="text-xl font-syne font-semibold text-white mb-6">
                Quote Summary
            </h2>

            <div className="space-y-4">
                {/* Real-time Quote Info */}
                {isLoading ? (
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <Skeleton className="h-4 w-20 bg-zinc-800" />
                            <Skeleton className="h-4 w-24 bg-zinc-800" />
                        </div>
                        <div className="flex justify-between items-center">
                            <Skeleton className="h-4 w-28 bg-zinc-800" />
                            <Skeleton className="h-4 w-32 bg-zinc-800" />
                        </div>
                        <div className="flex justify-between items-center">
                            <Skeleton className="h-4 w-16 bg-zinc-800" />
                            <Skeleton className="h-4 w-28 bg-zinc-800" />
                        </div>
                    </div>
                ) : quote ? (
                    <div className="space-y-3">
                        <div className="flex justify-between text-sm">
                            <span className="text-fundable-light-grey">You Send</span>
                            <span className="text-white font-medium">
                                {quote.cryptoAmount} {formState.token}
                            </span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-fundable-light-grey">Exchange Rate</span>
                            <span className="text-white">
                                1 {formState.token} = {quote.currency} {quote.rate?.toLocaleString() ?? "N/A"}
                            </span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-fundable-light-grey">Provider</span>
                            <span className="text-white capitalize">{quote.displayName}</span>
                        </div>
                        {quote.expiresAt && (
                            <div className="flex justify-between text-sm">
                                <span className="text-fundable-light-grey">Expires At</span>
                                <span className={timeLeft !== null && timeLeft <= 60 ? "text-orange-500 font-bold" : "text-fundable-purple"}>
                                    {new Date(quote.expiresAt).toLocaleTimeString()}
                                    {timeLeft !== null && timeLeft <= 60 && ` (${timeLeft}s)`}
                                </span>
                            </div>
                        )}
                    </div>
                ) : quoteError ? (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                        <p className="text-red-400 text-sm">{quoteError}</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div className="flex justify-between text-sm">
                            <span className="text-fundable-light-grey">You Send</span>
                            <span className="text-white">
                                {formState.amount || "0"} {formState.token}
                            </span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-fundable-light-grey">Exchange Rate</span>
                            <span className="text-fundable-light-grey">Enter amount for quote</span>
                        </div>
                    </div>
                )}

                <div className="border-t border-gray-700 pt-4">
                    <div className="flex justify-between items-center">
                        <span className="text-fundable-light-grey">You Receive</span>
                        <div className="text-right">
                            {isLoading ? (
                                <div className="space-y-2 flex flex-col items-end">
                                    <Skeleton className="h-8 w-32 bg-zinc-800" />
                                    <Skeleton className="h-3 w-20 bg-zinc-800" />
                                </div>
                            ) : quote ? (
                                <>
                                    <p className="text-2xl font-bold text-white">
                                        {getCurrencySymbol(selectedCountry?.currency || "")}
                                        {quote.fiatAmount?.toLocaleString()}
                                    </p>
                                    <p className="text-fundable-light-grey text-xs">
                                        Fee: {quote.fee} {quote.currency}
                                    </p>
                                </>
                            ) : (
                                <>
                                    <p className="text-2xl font-bold text-fundable-light-grey">
                                        {selectedCountry?.currency || "---"}
                                    </p>
                                    <p className="text-fundable-light-grey text-sm">
                                        ---
                                    </p>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* Proceed Button */}
                <Button
                    onClick={onProceed}
                    disabled={!canProceed}
                    variant="gradient"
                    size="lg"
                    className="w-full h-14 text-lg font-semibold mt-4"
                >
                    {isLoading ? (
                        <>
                            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                            Loading Quote...
                        </>
                    ) : quote ? (
                        "Proceed to Confirm"
                    ) : (
                        "Enter Amount for Quote"
                    )}
                </Button>
            </div>
        </div>
    );
}
