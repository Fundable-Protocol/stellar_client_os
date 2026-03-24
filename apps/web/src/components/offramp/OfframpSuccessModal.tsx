"use client";

import React, { useState, useRef, useEffect } from "react";
import { CheckCircle2, Copy, ExternalLink, X, Loader2, XCircle, Clock, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import toast from "react-hot-toast";
import type { QuoteStatusData, BridgeFeeBreakdown } from "@/types/offramp";

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

    const status = payoutStatus?.status;
    const isCompleted = status === "completed" || status === "confirmed";
    const isFailed = status === "failed" || status === "expired";
    const isProcessing = status === "pending" || status === "processing" || !status;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-fundable-dark/80 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative w-full max-w-md rounded-3xl bg-fundable-mid-dark border border-gray-800 p-8 space-y-6 animate-in fade-in zoom-in-95 duration-300">
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-6 right-6 text-gray-500 hover:text-white transition-colors"
                >
                    <X className="h-5 w-5" />
                </button>

                {/* Status Icon */}
                <div className="flex justify-center">
                    <div className={`w-20 h-20 rounded-full flex items-center justify-center ${isCompleted ? "bg-green-500/10" : isFailed ? "bg-red-500/10" : "bg-fundable-purple/10"}`}>
                        {isCompleted ? (
                            <CheckCircle2 className="h-10 w-10 text-green-500" />
                        ) : isFailed ? (
                            <XCircle className="h-10 w-10 text-red-500" />
                        ) : (
                            <Loader2 className="h-10 w-10 text-fundable-purple animate-spin" />
                        )}
                    </div>
                </div>

                {/* Title & Processing Time Banner */}
                <div className="text-center space-y-2">
                    <h2 className="text-2xl font-syne font-bold text-white">
                        {isCompleted ? "Offramp Complete! 🎉" : isFailed ? "Offramp Failed" : "Processing Transfer"}
                    </h2>
                    
                    {/* Added: Processing Time Banner for Task #62 */}
                    {isProcessing && (
                        <div className="inline-flex items-center gap-2 px-3 py-1 bg-fundable-purple/10 border border-fundable-purple/20 rounded-full">
                            <Clock size={12} className="text-fundable-purple" />
                            <span className="text-[10px] font-bold text-fundable-purple uppercase tracking-wider">
                                Estimated: 2-5 Minutes
                            </span>
                        </div>
                    )}

                    <p className="text-fundable-light-grey text-sm px-4">
                        {isCompleted
                            ? "Your funds have been successfully sent to your bank account."
                            : isFailed
                                ? payoutStatus?.providerMessage || "There was an issue with your transfer."
                                : "Your transaction is on the way. You can safely close this window."}
                    </p>
                </div>

                {/* Summary Card with Exchange Rate */}
                {feeBreakdown && (
                    <div className="space-y-4 p-5 rounded-2xl bg-fundable-dark border border-gray-800">
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-fundable-light-grey">Initial Send</span>
                            <span className="text-white font-medium">
                                {parseFloat(feeBreakdown.sendAmount).toFixed(4)} USDC
                            </span>
                        </div>

                        {/* Added: Exchange Rate for Transparency */}
                        <div className="flex justify-between items-center text-[11px]">
                            <span className="text-gray-500 flex items-center gap-1">
                                Exchange Rate <Info size={10} />
                            </span>
                            <span className="text-gray-400 font-mono">
                                1 USDC = ₦{(parseFloat(feeBreakdown.fiatPayout) / (parseFloat(feeBreakdown.sendAmount) - parseFloat(feeBreakdown.bridgeFee))).toLocaleString()}
                            </span>
                        </div>

                        <div className="flex justify-between items-center text-sm">
                            <span className="text-fundable-light-grey">Bridge Fee</span>
                            <span className="text-red-400 font-medium">
                                -{parseFloat(feeBreakdown.bridgeFee).toFixed(4)} USDC
                            </span>
                        </div>
                        
                        <div className="h-px bg-gray-800" />
                        
                        <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-white">Total Payout</span>
                            <span className="text-2xl font-black text-green-500 tracking-tight">
                                ₦{parseFloat(feeBreakdown.fiatPayout).toLocaleString()}
                            </span>
                        </div>
                    </div>
                )}

                {/* Transaction Reference & Explorer */}
                <div className="space-y-3">
                    {payoutStatus?.transactionReference && (
                        <div className="bg-fundable-dark/50 p-3 rounded-xl border border-gray-800 flex items-center justify-between">
                            <div className="overflow-hidden">
                                <p className="text-[9px] text-gray-500 uppercase font-bold tracking-widest mb-1">Ref ID</p>
                                <code className="text-[10px] text-white font-mono block truncate pr-4">{payoutStatus.transactionReference}</code>
                            </div>
                            <button onClick={handleCopy} className="p-2 bg-gray-800 rounded-lg text-fundable-purple hover:text-white transition-colors">
                                {copied ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                            </button>
                        </div>
                    )}

                    {bridgeTxHash && (
                        <a
                            href={`https://stellar.expert/explorer/public/tx/${bridgeTxHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2 w-full py-2 text-xs text-fundable-purple hover:underline font-medium"
                        >
                            View Stellar Explorer <ExternalLink className="h-3 w-3" />
                        </a>
                    )}
                </div>

                {/* Action Button */}
                <Button
                    onClick={onClose}
                    className="w-full h-14 rounded-2xl font-bold text-fundable-dark bg-gradient-to-r from-fundable-purple-2 to-purple-500 hover:opacity-90 active:scale-[0.98] transition-all shadow-lg shadow-purple-500/20"
                >
                    {isCompleted ? "Done" : "Close"}
                </Button>
            </div>
        </div>
    );
}
