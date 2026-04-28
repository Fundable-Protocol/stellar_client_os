"use client";

import React, { useState } from "react";
import { useOfframpBridge } from "@/hooks/useOfframpBridge";
import { OfframpForm } from "@/components/offramp/OfframpForm";
import BankDetailsCard from "@/components/offramp/BankDetailsCard";
import OfframpSummary from "@/components/offramp/OfframpSummary";
import OfframpQuoteModal from "@/components/offramp/OfframpQuoteModal";
import { BridgeStatusTracker } from "@/components/offramp/BridgeStatusTracker";
import OfframpSuccessModal from "@/components/offramp/OfframpSuccessModal";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import ProtectedRoute from "@/components/layouts/ProtectedRoute";
import { useTransactionGuard } from "@/hooks/useTransactionGuard";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { ErrorFallback } from "@/components/ui/error-fallback";
import { useFunnelTrackingWithAutoStart } from "@/hooks/use-funnel-tracking";

export default function OfframpPage() {
    const {
        step,
        error,
        isLoading,
        banks,
        isLoadingBanks,
        isVerifyingAccount,
        formState,
        handleFormChange,
        handleMaxClick,
        isLoadingQuote,
        quote,
        quoteError,
        offrampData,
        getQuote,
        confirmAndBridge,
        bridgeTxHash,
        payoutStatus,
        reset,
        goBack,
        currentTokenBalance,
        isLoadingBalance,
    } = useOfframpBridge();

    const [showQuoteModal, setShowQuoteModal] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const quoteGuard = useTransactionGuard(0);
    const bridgeGuard = useTransactionGuard(2000);

    const { track } = useFunnelTrackingWithAutoStart('offramp');

    React.useEffect(() => {
        if (step === "quote") {
            setShowQuoteModal(true);
        } else {
            setShowQuoteModal(false);
        }
    }, [step]);

    React.useEffect(() => {
        if (step === "completed") {
            setShowSuccessModal(true);
            track('completed');
        }
    }, [step]);

    const handleProceedToConfirm = async () => {
        if (quoteGuard.isGuardActive) {
            return;
        }
        await quoteGuard.runWithGuard(async () => {
            track('quote_requested');
            await getQuote(formState);
        }, { cooldownMs: 0 });
    };

    const handleConfirmBridge = async () => {
        if (bridgeGuard.isGuardActive) {
            return;
        }
        await bridgeGuard.runWithGuard(async () => {
            track('quote_accepted');
            track('bridge_initiated');
            await confirmAndBridge();
        }, { cooldownMs: 2000 });
    };

    const handleCloseQuoteModal = () => {
        setShowQuoteModal(false);
        goBack();
    };

    return (
        <DashboardLayout
            title="Offramp"
            infoMessage={{
                type: "info",
                message: "Convert Stellar USDC to local currency",
                showOnNetwork: "testnet"
            }}
        >
            <ProtectedRoute
                description="Connect your Stellar wallet to convert USDC to local currency."
            >
                <div
                    className={`space-y-8 pb-10 ${(quoteGuard.isGuardActive || bridgeGuard.isGuardActive) ? "pointer-events-none" : ""}`}
                    onKeyDownCapture={(event) => {
                        if (event.key === "Enter" && (quoteGuard.isGuardActive || bridgeGuard.isGuardActive)) {
                            event.preventDefault();
                            event.stopPropagation();
                        }
                    }}
                >
                    <ErrorBoundary
                        boundaryName="offramp-module"
                        fallback={({ error, reset }) => (
                            <ErrorFallback
                                title="Offramp Unavailable"
                                description="The offramp module hit an unexpected error."
                                error={error}
                                onRetry={reset}
                            />
                        )}
                    >
                        <div className="space-y-8 pb-10">
                            <p className="text-fundable-light-grey max-w-2xl px-2">
                                Withdraw Stellar USDC instantly to your bank account in Nigeria, Ghana, or Kenya.
                            </p>

                            <div className="space-y-8">
                                {error && !["signing", "processing", "failed"].includes(step) && (
                                    <div className="max-w-4xl mx-auto px-6 py-4 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center gap-3">
                                        <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                                        <p className="text-sm text-red-400 font-medium">{error}</p>
                                    </div>
                                )}

                                {step === "form" && (
                                    <div className="flex flex-col lg:flex-row gap-8">
                                        <div className="flex-1 space-y-8">
                                            <OfframpForm
                                                formState={formState}
                                                onChange={handleFormChange}
                                                maxBalance={isLoadingBalance ? "Loading..." : currentTokenBalance}
                                                onMaxClick={handleMaxClick}
                                            />
                                        </div>

                                        <div className="flex-1 space-y-8">
                                            <BankDetailsCard
                                                formState={formState}
                                                banks={banks}
                                                isLoadingBanks={isLoadingBanks}
                                                isVerifyingAccount={isVerifyingAccount}
                                                onChange={handleFormChange}
                                            />

                                            <OfframpSummary
                                                formState={formState}
                                                quote={quote}
                                                quoteError={quoteError}
                                                onProceed={handleProceedToConfirm}
                                                isLoading={isLoadingQuote || isLoading}
                                                isSubmitting={quoteGuard.isGuardActive}
                                            />
                                        </div>
                                    </div>
                                )}

                                {["signing", "processing", "failed", "quote"].includes(step) && (
                                    <div className="max-w-2xl mx-auto">
                                        <BridgeStatusTracker
                                            step={step === "quote" ? "signing" : step}
                                            bridgeTxHash={bridgeTxHash}
                                            payoutStatus={payoutStatus}
                                            error={error}
                                            onReset={reset}
                                        />
                                    </div>
                                )}

                                {step === "completed" && (
                                    <div className="max-w-xl mx-auto text-center space-y-6 py-12 rounded-3xl bg-fundable-mid-dark border border-green-500/20">
                                        <div className="w-20 h-20 rounded-full bg-green-500/10 mx-auto flex items-center justify-center">
                                            <CheckCircle2 className="h-10 w-10 text-green-500" />
                                        </div>
                                        <h3 className="text-2xl font-bold text-white">
                                            Offramp Successful
                                        </h3>
                                        <p className="text-fundable-light-grey">
                                            The funds have been successfully transferred to your bank account.
                                        </p>
                                        <button
                                            onClick={reset}
                                            className="px-8 py-4 rounded-xl font-bold text-fundable-dark bg-gradient-to-r from-fundable-purple-2 to-purple-500 hover:opacity-90 transition-all"
                                        >
                                            New Transfer
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </ErrorBoundary>
                </div>

                <OfframpQuoteModal
                    isOpen={showQuoteModal}
                    offrampData={offrampData}
                    formState={formState}
                    onClose={handleCloseQuoteModal}
                    onConfirm={handleConfirmBridge}
                    isLoading={isLoading}
                    isSubmitting={bridgeGuard.isGuardActive}
                />

                <OfframpSuccessModal
                    isOpen={showSuccessModal}
                    payoutStatus={payoutStatus}
                    bridgeTxHash={bridgeTxHash}
                    onClose={() => {
                        setShowSuccessModal(false);
                    }}
                />
            </ProtectedRoute>
        </DashboardLayout>
    );
}

function CheckCircle2(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
            <path d="m9 12 2 2 4-4" />
        </svg>
    )
}