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
import WalletConnectionGuard from "@/components/modules/wallet/WalletConnectionGuard";

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
        bridgeQuote,
        feeBreakdown,
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

    // Show quote modal when quote step is reached
    React.useEffect(() => {
        if (step === "quote") {
            setShowQuoteModal(true);
        } else {
            setShowQuoteModal(false);
        }
    }, [step]);

    // Show success modal when completed
    React.useEffect(() => {
        if (step === "completed") {
            setShowSuccessModal(true);
        }
    }, [step]);

    const handleProceedToConfirm = () => {
        getQuote(formState);
    };

    const handleCloseQuoteModal = () => {
        setShowQuoteModal(false);
        goBack(); // Return to form
    };

    return (
        <DashboardLayout
            title="Offramp"
            infoMessage={{
                type: "info",
                message: "Convert Stellar USDC to local currency via Allbridge Core & Cashwyre",
                showOnNetwork: "testnet"
            }}
        >
            <WalletConnectionGuard contextLabel="Connect your Stellar wallet to convert USDC to local currency.">
                <div className="space-y-8 pb-10">
                    {/* Intro text */}
                    <p className="text-fundable-light-grey max-w-2xl px-2">
                        Withdraw Stellar USDC instantly to your bank account in Nigeria, Ghana, or Kenya.
                    </p>

                    {/* Main Content */}
                    <div className="space-y-8">
                        {/* Error Banner */}
                        {error && !["signing", "bridging", "processing", "failed"].includes(step) && (
                            <div className="max-w-4xl mx-auto px-6 py-4 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center gap-3">
                                <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                                <p className="text-sm text-red-400 font-medium">{error}</p>
                            </div>
                        )}

                        {/* Step: Form & Overview */}
                        {step === "form" && (
                            <div className="flex flex-col lg:flex-row gap-8">
                                {/* Left: Form */}
                                <div className="flex-1 space-y-8">
                                    <OfframpForm
                                        formState={formState}
                                        onChange={handleFormChange}
                                        maxBalance={isLoadingBalance ? "Loading..." : currentTokenBalance}
                                        onMaxClick={handleMaxClick}
                                    />
                                </div>

                                {/* Right: Bank & Summary */}
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
                                    />
                                </div>
                            </div>
                        )}

                        {/* Steps: Signing / Bridging / Processing / Failed */}
                        {["signing", "bridging", "processing", "failed", "quote"].includes(step) && (
                            <div className="max-w-2xl mx-auto">
                                <BridgeStatusTracker
                                    step={step === "quote" ? "signing" : step} // Show tracker during bridge
                                    bridgeTxHash={bridgeTxHash}
                                    payoutStatus={payoutStatus}
                                    error={error}
                                    onReset={reset}
                                />
                            </div>
                        )}

                        {/* Step: Completed (background display) */}
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
            </WalletConnectionGuard>

            {/* Modals outside scroll area */}
            <OfframpQuoteModal
                isOpen={showQuoteModal}
                offrampData={offrampData}
                feeBreakdown={feeBreakdown}
                formState={formState}
                onClose={handleCloseQuoteModal}
                onConfirm={confirmAndBridge}
                isLoading={isLoading}
            />

            <OfframpSuccessModal
                isOpen={showSuccessModal}
                feeBreakdown={feeBreakdown}
                payoutStatus={payoutStatus}
                bridgeTxHash={bridgeTxHash}
                onClose={() => {
                    setShowSuccessModal(false);
                }}
            />
        </DashboardLayout>
    );
}

// Helper icons
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
