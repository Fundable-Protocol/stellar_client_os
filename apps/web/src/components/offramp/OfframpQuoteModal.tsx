"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Timer } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

import type { CreateOfframpResponse, OfframpFormState } from "@/types/offramp";
import { getCurrencySymbol } from "@/types/offramp";

interface OfframpQuoteModalProps {
    isOpen: boolean;
    offrampData: CreateOfframpResponse["data"] | null;
    formState: OfframpFormState;
    onClose: () => void;
    onConfirm: () => void;
    onRefresh: () => void;
    isLoading: boolean;
    isSubmitting?: boolean;
}

export default function OfframpQuoteModal({
    isOpen,
    offrampData,
    formState,
    onClose,
    onConfirm,
    onRefresh,
    isLoading,
    isSubmitting = false,
}: OfframpQuoteModalProps) {
    const handleClose = useCallback(() => {
        if (!isLoading) onClose();
    }, [isLoading, onClose]);

    const [timeLeft, setTimeLeft] = useState<number | null>(null);

    useEffect(() => {
        if (!offrampData?.expiresAt) return;

        const expiresAt = new Date(offrampData.expiresAt).getTime();
        const tick = () => {
            const remaining = Math.floor((expiresAt - Date.now()) / 1000);
            setTimeLeft(Math.max(0, remaining));
        };

        tick();
        const intervalId = setInterval(tick, 1000);
        return () => clearInterval(intervalId);
    }, [offrampData?.expiresAt]);

    const isExpired = timeLeft !== null && timeLeft <= 0;

    if (!isOpen) return null;

    const isLoadingQuote = !offrampData;
    const currencySymbol = offrampData
        ? getCurrencySymbol(offrampData.currency)
        : "";
    const parsedAmount = parseFloat(formState.amount);
    const safeAmount =
        !formState.amount || isNaN(parsedAmount) ? null : parsedAmount;
    const safeFiatAmount =
        offrampData && !isNaN(offrampData.fiatAmount)
            ? offrampData.fiatAmount.toLocaleString()
            : "--";

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
            <DialogContent className="bg-fundable-mid-dark border border-fundable-purple p-6 w-full max-w-md mx-4 relative">
                <DialogHeader>
                    <DialogTitle
                        id="offramp-quote-title"
                        className="text-xl font-syne font-semibold text-white mb-6"
                    >
                        Confirm Offramp
                    </DialogTitle>
                    <DialogDescription
                        id="offramp-quote-desc"
                        className="sr-only"
                    >
                        Review the transaction breakdown and confirm your
                        offramp request.
                    </DialogDescription>
                </DialogHeader>

                {isExpired ? (
                    <div className="space-y-4">
                        <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-6 text-center">
                            <Timer className="h-10 w-10 text-orange-500 mx-auto mb-3" />
                            <p className="text-orange-400 font-semibold text-lg">
                                Quote Expired
                            </p>
                            <p className="text-fundable-light-grey text-sm mt-1">
                                The rate quote has expired. Please fetch a new
                                quote to continue.
                            </p>
                        </div>
                        <div className="flex gap-4 mt-6">
                            <Button
                                onClick={onClose}
                                variant="secondary"
                                className="flex-1 bg-gray-800 hover:bg-gray-700 text-white border-none h-12"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={onRefresh}
                                disabled={isLoading}
                                className="flex-1 bg-gradient-to-r from-fundable-purple-2 to-purple-500 text-black h-12"
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Refreshing...
                                    </>
                                ) : (
                                    <>
                                        <RefreshCw className="mr-2 h-4 w-4" />
                                        Get New Quote
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                ) : isLoadingQuote ? (
                    <div className="space-y-4">
                        <div className="bg-fundable-dark p-4 rounded-lg">
                            <Skeleton className="h-4 w-20 mb-2 bg-fundable-light-grey" />
                            <Skeleton className="h-6 w-32 bg-white" />
                        </div>
                        <div className="bg-fundable-dark p-4 rounded-lg">
                            <Skeleton className="h-4 w-24 mb-2 bg-fundable-light-grey" />
                            <Skeleton className="h-8 w-40 bg-white" />
                        </div>
                        <div className="space-y-3 bg-fundable-dark/50 p-4 rounded-lg border border-gray-800 text-sm">
                            <div className="flex justify-between items-center text-xs text-fundable-light-grey uppercase tracking-wider mb-1">
                                <Skeleton className="h-3 w-32 bg-fundable-light-grey" />
                            </div>
                            <div className="flex justify-between">
                                <Skeleton className="h-3 w-16 bg-fundable-light-grey" />
                                <Skeleton className="h-3 w-20 bg-fundable-light-grey" />
                            </div>
                        </div>
                        <div className="bg-fundable-dark p-4 rounded-lg">
                            <Skeleton className="h-4 w-28 mb-2 bg-fundable-light-grey" />
                            <Skeleton className="h-4 w-32 mb-1 bg-white" />
                            <Skeleton className="h-4 w-40 bg-white" />
                        </div>
                        <div className="flex gap-4 mt-6">
                            <Skeleton className="flex-1 h-12 rounded-lg bg-gray-800" />
                            <Skeleton className="flex-1 h-12 rounded-lg bg-purple-600" />
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Quote Expiry Countdown */}
                        {timeLeft !== null && timeLeft <= 120 && (
                            <div
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                                    timeLeft <= 30
                                        ? "bg-red-500/10 text-red-400"
                                        : "bg-orange-500/10 text-orange-400"
                                }`}
                            >
                                <Timer className="h-4 w-4" />
                                <span className="font-medium">
                                    {timeLeft <= 30
                                        ? "Quote expiring soon"
                                        : "Quote expires in"}{" "}
                                    <span className="font-bold">
                                        {timeLeft}s
                                    </span>
                                </span>
                            </div>
                        )}

                        <div className="bg-fundable-dark p-4 rounded-lg">
                            <p className="text-fundable-light-grey text-sm">
                                You Send
                            </p>
                            <p className="text-white text-xl font-semibold">
                                {safeAmount !== null
                                    ? safeAmount.toFixed(4)
                                    : "--"}{" "}
                                {formState.token}
                            </p>
                        </div>

                        <div className="bg-fundable-dark p-4 rounded-lg">
                            <p className="text-fundable-light-grey text-sm">
                                Total Payout
                            </p>
                            <p className="text-white text-2xl font-bold">
                                {currencySymbol}
                                {safeFiatAmount}
                            </p>
                        </div>

                        <div className="space-y-3 bg-fundable-dark/50 p-4 rounded-lg border border-gray-800 text-sm">
                            <div className="flex justify-between items-center text-xs text-fundable-light-grey uppercase tracking-wider mb-1">
                                <span>Transaction Breakdown</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-fundable-light-grey">
                                    Reference
                                </span>
                                <span className="text-white text-[10px] font-mono opacity-80">
                                    {offrampData.reference}
                                </span>
                            </div>
                        </div>

                        <div className="bg-fundable-dark p-4 rounded-lg">
                            <p className="text-fundable-light-grey text-sm mb-2">
                                Bank Details
                            </p>
                            <p className="text-white font-medium">
                                {formState.accountName}
                            </p>
                            <p className="text-white">
                                {formState.accountNumber}
                            </p>
                        </div>

                        <div className="flex gap-4 mt-6">
                            <Button
                                onClick={onClose}
                                disabled={isLoading}
                                variant="secondary"
                                className="flex-1 bg-gray-800 hover:bg-gray-700 text-white border-none h-12"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={onConfirm}
                                disabled={isLoading || isSubmitting || isExpired}
                                className="flex-1 bg-gradient-to-r from-fundable-purple-2 to-purple-500 text-black h-12"
                            >
                                {isLoading || isSubmitting ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Confirming...
                                    </>
                                ) : (
                                    "Confirm"
                                )}
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}