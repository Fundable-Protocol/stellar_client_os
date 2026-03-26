"use client";

import { useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, X } from "lucide-react";

import type { CreateOfframpResponse, OfframpFormState, BridgeFeeBreakdown } from "@/types/offramp";
import { getCurrencySymbol } from "@/types/offramp";

interface OfframpQuoteModalProps {
    isOpen: boolean;
    offrampData: CreateOfframpResponse["data"] | null;
    feeBreakdown: BridgeFeeBreakdown | null;
    formState: OfframpFormState;
    onClose: () => void;
    onConfirm: () => void;
    isLoading: boolean;
}

export default function OfframpQuoteModal({
    isOpen,
    offrampData,
    feeBreakdown,
    formState,
    onClose,
    onConfirm,
    isLoading,
}: OfframpQuoteModalProps) {
    // Handle Escape key to close modal
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === "Escape" && !isLoading) {
            onClose();
        }
    }, [isLoading, onClose]);

    useEffect(() => {
        if (isOpen) {
            document.addEventListener("keydown", handleKeyDown);
            return () => document.removeEventListener("keydown", handleKeyDown);
        }
    }, [isOpen, handleKeyDown]);

    if (!isOpen || !offrampData || !feeBreakdown) return null;

    // Handle backdrop click
    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget && !isLoading) {
            onClose();
        }
    };

    const currencySymbol = getCurrencySymbol(offrampData.currency);

    return (
        <div
            role="presentation"
            className="fixed inset-0 bg-fundable-dark/80 backdrop-blur-sm flex justify-center items-center z-50"
            onClick={handleBackdropClick}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="offramp-quote-title"
                aria-describedby="offramp-quote-desc"
                className="bg-fundable-mid-dark border border-fundable-purple rounded-2xl p-6 w-full max-w-md mx-4 relative"
            >
                {/* Close Button */}
                <button
                    onClick={onClose}
                    disabled={isLoading}
                    aria-label="Close offramp confirmation"
                    className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
                >
                    <X className="h-5 w-5" aria-hidden="true" />
                </button>

                <h3 id="offramp-quote-title" className="text-xl font-syne font-semibold text-white mb-6">
                    Confirm Offramp
                </h3>
                <p id="offramp-quote-desc" className="sr-only">
                    Review the transaction breakdown and confirm your offramp request.
                </p>

                <div className="space-y-4">
                    <div className="bg-fundable-dark p-4 rounded-lg">
                        <p className="text-fundable-light-grey text-sm">Total Payout</p>
                        <p className="text-white text-2xl font-bold">
                            {currencySymbol}{offrampData.fiatAmount.toLocaleString()}
                        </p>
                    </div>

                    {/* Details Breakdown */}
                    <div className="space-y-3 bg-fundable-dark/50 p-4 rounded-lg border border-gray-800 text-sm">
                        <div className="flex justify-between items-center text-xs text-fundable-light-grey uppercase tracking-wider mb-1">
                            <span>Transaction Breakdown</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-fundable-light-grey">Initial Send (Stellar)</span>
                            <span className="text-white">
                                {parseFloat(feeBreakdown.sendAmount).toFixed(4)} {formState.token}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-fundable-light-grey">Bridge Fee (Allbridge)</span>
                            <span className="text-red-400">
                                -{feeBreakdown.bridgeFee} {formState.token}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-fundable-light-grey">Received on Polygon</span>
                            <span className="text-white">
                                {feeBreakdown.receivedOnPolygon} {formState.token}
                            </span>
                        </div>
                        <div className="h-px bg-gray-800 my-1" />
                        <div className="flex justify-between">
                            <span className="text-fundable-light-grey">Exchange Rate</span>
                            <span className="text-white">
                                1 {formState.token} = {getCurrencySymbol(feeBreakdown.currency)}{feeBreakdown.exchangeRate}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-fundable-light-grey">Est. Processing Time</span>
                            <div className="flex items-center gap-1.5 text-fundable-purple">
                                <span className="font-medium">~{feeBreakdown.estimatedTime} minutes</span>
                            </div>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-fundable-light-grey">Reference</span>
                            <span className="text-white text-[10px] font-mono opacity-80">{offrampData.reference}</span>
                        </div>
                    </div>

                    {/* Bank Details */}
                    <div className="bg-fundable-dark p-4 rounded-lg">
                        <p className="text-fundable-light-grey text-sm mb-2">Bank Details</p>
                        <p className="text-white font-medium">{formState.accountName}</p>
                        <p className="text-white">{formState.accountNumber}</p>
                    </div>

                    {/* Actions */}
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
                            disabled={isLoading}
                            className="flex-1 bg-gradient-to-r from-fundable-purple-2 to-purple-500 text-black h-12"
                        >
                            {isLoading ? (
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
            </div>
        </div>
    );
}
