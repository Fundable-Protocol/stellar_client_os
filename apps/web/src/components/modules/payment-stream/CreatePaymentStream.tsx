"use client";

import toast from "react-hot-toast";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@/providers/StellarWalletProvider";

import { PaymentStreamForm } from "./PaymentStreamForm";
import { PaymentStreamSummary } from "./PaymentStreamSummary";
import { PaymentStreamConfirmationModal } from "./PaymentStreamConfirmationModal";
import { capitalizeWord } from "@/lib/utils";
import { SUPPORTED_TOKENS, PaymentStreamFormData } from "@/lib/validations";
import { StellarService } from "@/lib/stellar";
import { validateEndTime } from "@/lib/stream-validation";
import { useDebouncedCallback } from "@/hooks/use-debounce-callback";
import { useBalanceValidation } from "@/hooks/use-balance-validation";
import { createTestnetService } from "@/services/stellar.service";
import { PAYMENT_STREAM_CONTRACT_ID, DISTRIBUTOR_CONTRACT_ID } from "@/lib/constants";

// Stream form state type
interface StreamFormData {
    name: string;
    recipient: string;
    token: string;
    amount: string;
    duration: string;
    durationValue: string;
    cancellability: boolean;
    transferability: boolean;
}

const CreatePaymentStream = () => {
    const { address, isConnected } = useWallet();
    const queryClient = useQueryClient();

    const tokenOptions = SUPPORTED_TOKENS.map((token) => ({
        label: token.label,
        value: token.value,
    }));

    const durationOptions = ["hour", "day", "week", "month", "year"].map(
        (option) => ({
            label: capitalizeWord(option),
            value: option,
        })
    );

    const [streamData, setStreamData] = useState<StreamFormData>({
        name: "",
        recipient: "",
        token: tokenOptions[0]?.value || "XLM",
        amount: "",
        duration: durationOptions[0]?.value || "day",
        durationValue: "",
        cancellability: true,
        transferability: false,
    });
    const [formKey, setFormKey] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showConfirmationModal, setShowConfirmationModal] = useState(false);
    
    // Fee estimation state
    const [estimatedFee, setEstimatedFee] = useState<string | null>(null);
    const [isEstimatingFee, setIsEstimatingFee] = useState<boolean>(false);

    const realStellarService = useMemo(() => createTestnetService({
        paymentStream: PAYMENT_STREAM_CONTRACT_ID,
        distributor: DISTRIBUTOR_CONTRACT_ID
    }), []);

    const selectedToken = useMemo(() => {
        return SUPPORTED_TOKENS.find((t) => t.value === streamData.token);
    }, [streamData.token]);

    const { balanceError, insufficientBalance } = useBalanceValidation(
        streamData.amount,
        streamData.token
    );

    const estimateFee = useDebouncedCallback(async (data: StreamFormData, userAddress: string) => {
        if (!data.recipient || !data.amount || !data.durationValue || !StellarService.validateStellarAddress(data.recipient)) {
            setEstimatedFee(null);
            return;
        }
        setIsEstimatingFee(true);
        try {
            const amount = BigInt(Math.floor(parseFloat(data.amount) * 10000000));
            const durationMultiplier = data.duration === 'hour' ? 3600 : 
                                      data.duration === 'day' ? 86400 :
                                      data.duration === 'week' ? 604800 :
                                      data.duration === 'month' ? 2592000 : 31536000;
            const durationInSeconds = Math.floor(parseFloat(data.durationValue) * durationMultiplier);
            const startTime = BigInt(Math.floor(Date.now() / 1000));
            
            const fee = await realStellarService.getStreamCreationFeeEstimate({
                recipient: data.recipient,
                token: data.token,
                totalAmount: amount,
                startTime,
                endTime: startTime + BigInt(durationInSeconds)
            }, userAddress);
            setEstimatedFee(fee);
        } catch {
            setEstimatedFee("~0.0001 XLM");
        } finally {
            setIsEstimatingFee(false);
        }
    }, 500);

    // Trigger fee estimation when relevant fields change
    import { useEffect } from "react";
    useEffect(() => {
        if (isConnected && address) {
            estimateFee(streamData, address);
        }
    }, [
        streamData.recipient, 
        streamData.amount, 
        streamData.token, 
        streamData.duration, 
        streamData.durationValue,
        isConnected,
        address
    ]);

    const handleFormSubmit = () => {
        if (!isConnected || !address) {
            toast.error("Connect your wallet");
            return;
        }

        // Basic validation
        if (!streamData.name.trim()) {
            toast.error("Stream name is required");
            return;
        }
        if (!streamData.recipient.trim()) {
            toast.error("Recipient address is required");
            return;
        }
        if (!StellarService.validateStellarAddress(streamData.recipient)) {
            toast.error("Invalid Stellar address");
            return;
        }
        if (!streamData.amount || parseFloat(streamData.amount) <= 0) {
            toast.error("Amount must be greater than 0");
            return;
        }
        if (!streamData.durationValue || parseInt(streamData.durationValue) <= 0) {
            toast.error("Duration must be greater than 0");
            return;
        }

        // Validate end time
        const endTimeError = validateEndTime(null, streamData.durationValue, streamData.duration);
        if (endTimeError) {
            toast.error(endTimeError);
            return;
        }

        // Show confirmation modal
        setShowConfirmationModal(true);
    };

    const handleConfirmStream = async () => {
        // Close modal immediately to show loading state on form
        setShowConfirmationModal(false);

        try {
            setIsSubmitting(true);

            // Convert form data to the format expected by StellarService
            const formData: PaymentStreamFormData = {
                recipientAddress: streamData.recipient,
                token: streamData.token,
                totalAmount: streamData.amount,
                duration: streamData.durationValue,
                durationUnit: streamData.duration === "hour" ? "hours" : "days",
                cancelable: streamData.cancellability,
                transferable: streamData.transferability,
            };

            const streamId = await StellarService.createPaymentStream(formData);

            toast.success(
                `Stream created successfully! ID: ${streamId.slice(0, 10)}...`
            );

            // Reset form
            setStreamData({
                name: "",
                recipient: "",
                token: tokenOptions[0]?.value || "XLM",
                amount: "",
                duration: durationOptions[0]?.value || "day",
                durationValue: "",
                cancellability: true,
                transferability: false,
            });
            setFormKey((k) => k + 1);

            // Invalidate streams queries
            await queryClient.invalidateQueries({
                queryKey: ["payment-streams-table"],
            });

            // Set a temporary query data to indicate tab should switch
            queryClient.setQueryData(["stream-created-switch-tab"], true);
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Failed to create stream";
            toast.error(message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCloseModal = () => {
        if (!isSubmitting) {
            setShowConfirmationModal(false);
        }
    };

    return (
        <>
            <main className="flex flex-col lg:flex-row gap-6 md:gap-8 w-full">
                <div className="w-full lg:w-[70%]">
                    <div
                        id="create-stream-card"
                        className="bg-zinc-800/50 rounded-lg border border-zinc-700 p-4 sm:p-5 md:p-6"
                    >
                        <div className="mb-6">
                            <h2 className="text-xl font-semibold text-zinc-50 mb-2">Create New Stream</h2>
                            <p className="text-zinc-400 text-sm">
                                Set up a continuous payment stream on the Stellar network
                            </p>
                        </div>

                        <PaymentStreamForm
                            key={formKey}
                            streamData={streamData}
                            tokenOptions={tokenOptions}
                            setStreamData={setStreamData}
                            durationOptions={durationOptions}
                            onSubmit={handleFormSubmit}
                            isSubmitting={isSubmitting}
                            balanceError={balanceError}
                            insufficientBalance={insufficientBalance}
                        />
                    </div>
                </div>
                <div className="w-full lg:w-[30%]">
                    <div className="lg:hidden">
                        <details className="group">
                            <summary className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-3 text-sm font-medium text-zinc-100">
                                Stream Summary
                                <span className="text-zinc-400 transition-transform group-open:rotate-180">
                                    ▾
                                </span>
                            </summary>
                            <div className="mt-3">
                                <PaymentStreamSummary streamData={streamData} showTitle={false} estimatedFee={estimatedFee} isEstimatingFee={isEstimatingFee} />
                            </div>
                        </details>
                    </div>
                    <div className="hidden lg:block">
                        <PaymentStreamSummary streamData={streamData} estimatedFee={estimatedFee} isEstimatingFee={isEstimatingFee} />
                    </div>
                </div>
            </main>

            <PaymentStreamConfirmationModal
                open={showConfirmationModal}
                onOpenChange={handleCloseModal}
                data={{
                    recipientAddress: streamData.recipient,
                    token: streamData.token,
                    totalAmount: streamData.amount,
                    duration: streamData.durationValue,
                    durationUnit: streamData.duration === "hour" ? "hours" : "days",
                    cancelable: streamData.cancellability,
                    transferable: streamData.transferability,
                }}
                onConfirm={handleConfirmStream}
                isSubmitting={isSubmitting}
                estimatedFee={estimatedFee}
                isEstimatingFee={isEstimatingFee}
            />
        </>
    );
};

export default CreatePaymentStream;
