"use client";

import React, { useState, useRef, useEffect } from "react";
import { CheckCircle2, Copy, ExternalLink, X, Loader2, XCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import toast from "react-hot-toast";
import type { QuoteStatusData, BridgeFeeBreakdown } from "@/types/offramp";
import { getCurrencySymbol } from "@/types/offramp";

interface OfframpSuccessModalProps {
    isOpen: boolean;
    feeBreakdown: BridgeFeeBreakdown | null;
    payoutStatus: QuoteStatusData | null;
    bridgeTxHash: string | null;
    onClose: () => void;
}

export default function OfframpSuccessModal({
    isOpen,
    feeBreakdown,
    payoutStatus,
    bridgeTxHash,
    onClose,
}: OfframpSuccessModalProps) {
    const [copied, setCopied] = useState(false);
    const copyTimeoutRef = useRef<number | null>(null);

    const handleCopy = async () => {
        if (!payoutStatus?.transactionReference) return;
        try {
            await navigator.clipboard.writeText(payoutStatus.transactionReference);
            setCopied(true);
            toast.success("Reference copied!");
            if (copyTimeoutRef.current) window.clearTimeout(copyTimeoutRef.current);
            copyTimeoutRef.current = window.setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error("Failed to copy");
        }
    };

    useEffect(() => {
        return () => {
            if (copyTimeoutRef.current) window.clearTimeout(copyTimeoutRef.current);
        };
    }, []);

    if (!isOpen) return null;

    const isCompleted = payoutStatus?.status === "completed" || payoutStatus?.status === "confirmed";
    const isFailed = payoutStatus?.status === "failed";

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                aria-hidden="true"
                className="absolute inset-0 bg-fundable-dark/80 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="offramp-success-title"
                aria-describedby="offramp-success-desc"
                aria-live="polite"
                className="relative w-full max-w-md rounded-3xl bg-fundable-mid-dark border border-gray-800 p-8 space-y-8 animate-in fade-in zoom-in-95 duration-300"
            >
                {/* Close Button */}
                <button
                    onClick={onClose}
                    aria-label="Close offramp status"
                    className="absolute top-6 right-6 text-gray-500 hover:text-white transition-colors"
                >
                    <X className="h-5 w-5" aria-hidden="true" />
                </button>

                {/* Success Icon */}
                <div className="flex justify-center" aria-hidden="true">
                    <div className={`w-20 h-20 rounded-full flex items-center justify-center ${isCompleted ? "bg-green-500/10" : isFailed ? "bg-red-500/10" : "bg-blue-500/10"}`}>
                        {isCompleted ? (
                            <CheckCircle2 className="h-10 w-10 text-green-500" />
                        ) : isFailed ? (
                            <XCircle className="h-10 w-10 text-red-500" />
                        ) : (
                            <Loader2 className="h-10 w-10 text-blue-500 animate-spin" />
                        )}
                    </div>
                </div>

                {/* Title */}
                <div className="text-center space-y-2">
                    <h2 id="offramp-success-title" className="text-2xl font-syne font-bold text-white">
                        {isCompleted ? "Offramp Complete! 🎉" : isFailed ? "Offramp Failed" : "Offramp Processing"}
                    </h2>
                    <p id="offramp-success-desc" className="text-fundable-light-grey text-sm">
                        {isCompleted
                            ? "Your funds have been successfully sent to your bank account."
                            : isFailed
                                ? payoutStatus?.providerMessage || "There was an issue with your transfer. Please contact support."
                                : "Your transaction is being processed. You can close this window and check back later."}
                    </p>
                </div>

                {/* Summary Card */}
                {feeBreakdown && (
                    <div className="space-y-4 p-5 rounded-2xl bg-fundable-dark border border-gray-800">
                        <div className="flex justify-between items-center text-xs text-fundable-light-grey uppercase tracking-wider mb-1">
                            <span>Transaction Summary</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-fundable-light-grey">Initial Send</span>
                            <span className="text-white font-medium">
                                {parseFloat(feeBreakdown.sendAmount).toFixed(4)} USDC
                            </span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-fundable-light-grey">Bridge Fee</span>
                            <span className="text-red-400">
                                -{parseFloat(feeBreakdown.bridgeFee).toFixed(4)} USDC
                            </span>
                        </div>
                        {feeBreakdown.cashwyreFee && parseFloat(feeBreakdown.cashwyreFee) > 0 && (
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-fundable-light-grey">Provider Fee</span>
                                <span className="text-red-400">
                                    -{parseFloat(feeBreakdown.cashwyreFee).toFixed(2)} {payoutStatus?.id.split("-")[0].toUpperCase() === "NG" ? "NGN" : "Fiat"}
                                </span>
                            </div>
                        )}
                        <div className="flex justify-between items-center text-sm border-t border-gray-800/50 pt-3 mt-1">
                            <span className="text-fundable-light-grey">Exchange Rate</span>
                            <span className="text-white">
                                1 USDC = {getCurrencySymbol(feeBreakdown.currency)}{feeBreakdown.exchangeRate}
                            </span>
                        </div>
                        <div className="h-px bg-gray-800" />
                        <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-white">Total Received</span>
                            <span className="text-xl font-bold text-green-500">
                                {getCurrencySymbol(feeBreakdown.currency)}
                                {parseFloat(feeBreakdown.fiatPayout).toLocaleString()}
                            </span>
                        </div>
                    </div>
                )}

                {/* Transaction Info */}
                <div className="space-y-4">
                    {payoutStatus?.transactionReference && (
                        <div className="bg-fundable-dark p-4 rounded-xl border border-gray-800">
                            <p className="text-[10px] text-fundable-light-grey uppercase tracking-wider mb-2">Reference ID</p>
                            <div className="flex items-center justify-between">
                                <code className="text-xs text-white font-mono">{payoutStatus.transactionReference}</code>
                                <button onClick={handleCopy} aria-label={copied ? "Reference copied" : "Copy reference ID"} className="text-fundable-purple hover:text-white transition-colors">
                                    {copied ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                                </button>
                            </div>
                        </div>
                    )}

                    {bridgeTxHash && (
                        <a
                            href={`https://stellar.expert/explorer/public/tx/${bridgeTxHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2 w-full py-3 text-xs text-fundable-purple hover:text-fundable-violet transition-colors font-medium"
                        >
                            View Stellar Explorer <ExternalLink className="h-3 w-3" />
                        </a>
                    )}
                </div>

                {/* Action Button */}
                <Button
                    onClick={onClose}
                    className="w-full h-14 rounded-2xl font-bold text-fundable-dark bg-gradient-to-r from-fundable-purple-2 to-purple-500 hover:opacity-90 active:scale-[0.98] transition-all"
                >
                    {isCompleted ? "Done" : "Close"}
                </Button>
            </div>
        </div>
    );
}
