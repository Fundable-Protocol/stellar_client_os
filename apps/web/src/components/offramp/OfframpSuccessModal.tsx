"use client";
 
import React, { useState, useRef, useEffect } from "react";
import { CheckCircle2, Copy, ExternalLink, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import toast from "react-hot-toast";
import type { QuoteStatusData } from "@/types/offramp";
import { STELLAR_EXPERT_URL, STELLAR_NETWORK } from "@/lib/constants";
 
interface OfframpSuccessModalProps {
    isOpen: boolean;
    payoutStatus: QuoteStatusData | null;
    bridgeTxHash: string | null;
    onClose: () => void;
}
 
export default function OfframpSuccessModal({
    isOpen,
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
 
    const isCompleted = payoutStatus?.status === "completed" || payoutStatus?.status === "confirmed";
    const isFailed = payoutStatus?.status === "failed";
 
    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent
                aria-live="polite"
                className="relative w-full max-w-md rounded-3xl bg-fundable-mid-dark border border-gray-800 p-8 space-y-8 animate-in fade-in zoom-in-95 duration-300"
            >
                <DialogHeader>
                    <div className="text-center space-y-2 w-full">
                        <DialogTitle id="offramp-success-title" className="text-2xl font-syne font-bold text-white">
                            {isCompleted ? "Offramp Complete!" : isFailed ? "Offramp Failed" : "Offramp Processing"}
                        </DialogTitle>
                        <DialogDescription id="offramp-success-desc" className="text-fundable-light-grey text-sm">
                            {isCompleted
                                ? "Your funds have been successfully sent to your bank account."
                                : isFailed
                                    ? payoutStatus?.providerMessage || "There was an issue with your transfer. Please contact support."
                                    : "Your transaction is being processed. You can close this window and check back later."}
                        </DialogDescription>
                    </div>
                </DialogHeader>
 
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
                            href={`${STELLAR_EXPERT_URL}/tx/${bridgeTxHash}?network=${STELLAR_NETWORK}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2 w-full py-3 text-xs text-fundable-purple hover:text-fundable-violet transition-colors font-medium"
                        >
                            View Stellar Explorer <ExternalLink className="h-3 w-3" />
                        </a>
                    )}
                </div>
 
                <Button
                    onClick={onClose}
                    className="w-full h-14 rounded-2xl font-bold text-fundable-dark bg-gradient-to-r from-fundable-purple-2 to-purple-500 hover:opacity-90 active:scale-[0.98] transition-all"
                >
                    {isCompleted ? "Done" : "Close"}
                </Button>
            </DialogContent>
        </Dialog>
    );
}