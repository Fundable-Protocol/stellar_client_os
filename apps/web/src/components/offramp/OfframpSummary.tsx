"use client";

import { Button } from "@/components/ui/button";
// Added Clock and ShieldCheck icons
import { Loader2, Clock, ShieldCheck, Info } from "lucide-react";

import type { OfframpFormState, ProviderRate } from "@/types/offramp";
import { SUPPORTED_COUNTRIES } from "@/types/offramp";

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

    // Helper to render currency symbols
    const getCurrencySymbol = () => {
        if (!selectedCountry) return "";
        switch (selectedCountry.currency) {
            case "NGN": return "₦";
            case "GHS": return "₵";
            case "KES": return "KSh ";
            default: return selectedCountry.currency + " ";
        }
    };

    return (
        <div className="bg-fundable-mid-dark rounded-2xl p-6 border border-gray-800 shadow-xl">
            <h2 className="text-xl font-syne font-semibold text-white mb-6 flex items-center gap-2">
                <ShieldCheck className="text-fundable-purple h-5 w-5" />
                Transaction Summary
            </h2>

            <div className="space-y-4">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-12 bg-gray-900/30 rounded-xl border border-dashed border-gray-800">
                        <Loader2 className="h-8 w-8 animate-spin text-fundable-purple mb-3" />
                        <span className="text-fundable-light-grey text-sm font-medium">Calculating best rates...</span>
                    </div>
                ) : quote ? (
                    <div className="space-y-4">
                        {/* THE BREAKDOWN CARD */}
                        <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-800 space-y-3">
                            <div className="flex justify-between text-sm">
                                <span className="text-fundable-light-grey">Exchange Rate</span>
                                <span className="text-white font-mono">
                                    1 {formState.token} = {quote.currency} {quote.rate?.toLocaleString()}
                                </span>
                            </div>

                            <div className="flex justify-between text-sm">
                                <span className="text-fundable-light-grey flex items-center gap-1">
                                    Service Fee <Info size={12} className="text-gray-500" />
                                </span>
                                <span className="text-red-400 font-medium">
                                    -{quote.fee} {quote.currency}
                                </span>
                            </div>

                            {/* ESTIMATED TIME COMPONENT */}
                            <div className="flex items-center gap-2 mt-2 py-2 px-3 bg-fundable-purple/10 rounded-lg border border-fundable-purple/20">
                                <Clock className="h-3.5 w-3.5 text-fundable-purple" />
                                <span className="text-[11px] font-bold text-fundable-purple uppercase tracking-wider">
                                    Est. Arrival: 2-5 Minutes
                                </span>
                            </div>
                        </div>

                        {/* PROVIDER INFO */}
                        <div className="flex justify-between text-xs px-1">
                            <span className="text-fundable-light-grey italic">Provider: {quote.displayName}</span>
                            {quote.expiresAt && (
                                <span className="text-amber-500 font-medium">
                                    Quote expires: {new Date(quote.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            )}
                        </div>
                    </div>
                ) : quoteError ? (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                        <p className="text-red-400 text-sm text-center font-medium">{quoteError}</p>
                    </div>
                ) : (
                    <div className="py-6 text-center border border-dashed border-gray-800 rounded-xl">
                        <p className="text-fundable-light-grey text-sm">Enter an amount to see the fee breakdown</p>
                    </div>
                )}

                {/* FINAL PAYOUT SECTION */}
                <div className="border-t border-gray-800 pt-5 mt-2">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <span className="text-fundable-light-grey text-sm font-medium tracking-tight">Total Payout</span>
                            <p className="text-[10px] text-gray-500">Includes all network and provider fees</p>
                        </div>
                        <div className="text-right">
                            {quote ? (
                                <p className="text-3xl font-black text-white tracking-tighter">
                                    {getCurrencySymbol()}
                                    {quote.fiatAmount?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </p>
                            ) : (
                                <p className="text-2xl font-bold text-gray-700">
                                    {selectedCountry?.currency || "---"}
                                </p>
                            )}
                        </div>
                    </div>

                    <Button
                        onClick={onProceed}
                        disabled={!canProceed}
                        variant="gradient"
                        size="lg"
                        className="w-full h-14 text-lg font-bold shadow-lg shadow-fundable-purple/10 active:scale-[0.98] transition-all"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                Processing...
                            </>
                        ) : quote ? (
                            "Confirm Withdrawal"
                        ) : (
                            "Verify Amount"
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}
