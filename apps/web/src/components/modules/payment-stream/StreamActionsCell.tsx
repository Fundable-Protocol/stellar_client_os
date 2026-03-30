"use client";

import React, { useState } from "react";
import {
    ExternalLink,
    MoreHorizontal,
    Copy,
    Wallet,
    Pause,
    Play,
    XCircle,
    Shield
} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import type { StreamRecord } from "@/lib/validations";
import { STELLAR_EXPERT_URL } from "@/lib/constants";
import { WithdrawStreamModal } from "./WithdrawStreamModal";
import { ManageDelegateModal } from "./ManageDelegateModal";
import { toast } from "react-hot-toast";
import { useWallet } from "@/providers/StellarWalletProvider";
import { pauseStream, resumeStream, cancelStream } from "@/lib/api";

type StreamActionsCellProps = {
    stream: StreamRecord;
};

export default function StreamActionsCell({ stream }: StreamActionsCellProps) {
    const { address, signTransaction } = useWallet();
    const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);
    const [isDelegateModalOpen, setIsDelegateModalOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const isSender = address?.toLowerCase() === stream.sender.toLowerCase();
    const isRecipient = address?.toLowerCase() === stream.recipient.toLowerCase();

    const handleViewOnExplorer = () => {
        const url = `${STELLAR_EXPERT_URL}/tx/${stream.id}`;
        window.open(url, "_blank");
    };

    const handleCopyStreamId = async () => {
        if (!stream?.id) return;
        try {
            await navigator.clipboard.writeText(stream.id);
            toast.success("Stream ID copied to clipboard");
        } catch { }
    };

    const handleOpenWithdraw = () => setIsWithdrawOpen(true);

    const handlePause = async () => {
        if (!signTransaction) return;
        setIsLoading(true);
        try {
            await pauseStream({
                id: stream.id,
                signTransaction,
            });
            toast.success("Stream paused successfully");
        } catch (error) {
            console.error("Pause error:", error);
            toast.error("Failed to pause stream");
        } finally {
            setIsLoading(false);
        }
    };

    const handleResume = async () => {
        if (!signTransaction) return;
        setIsLoading(true);
        try {
            await resumeStream({
                id: stream.id,
                signTransaction,
            });
            toast.success("Stream resumed successfully");
        } catch (error) {
            console.error("Resume error:", error);
            toast.error("Failed to resume stream");
        } finally {
            setIsLoading(false);
        }
    };

    const handleCancel = async () => {
        if (!signTransaction) return;
        if (!confirm("Are you sure you want to cancel this stream? This action cannot be undone.")) return;

        setIsLoading(true);
        try {
            await cancelStream({
                id: stream.id,
                signTransaction,
            });
            toast.success("Stream canceled successfully");
        } catch (error) {
            console.error("Cancel error:", error);
            toast.error("Failed to cancel stream");
        } finally {
            setIsLoading(false);
        }
    };

    const isActive = stream.status === "Active";
    const isPaused = stream.status === "Paused";
    const canManage = isActive || isPaused;

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-8 w-8 p-0 hover:bg-zinc-700" disabled={isLoading} aria-label={`Stream actions for stream ${stream.id}`}>
                        <MoreHorizontal className="h-4 w-4 text-white" aria-hidden="true" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    {isRecipient && isActive && (
                        <DropdownMenuItem
                            className="cursor-pointer"
                            onClick={handleOpenWithdraw}
                        >
                            <Wallet className="mr-2 h-4 w-4" />
                            Withdraw
                        </DropdownMenuItem>
                    )}

                    {isSender && isActive && (
                        <DropdownMenuItem
                            className="cursor-pointer"
                            onClick={handlePause}
                        >
                            <Pause className="mr-2 h-4 w-4" />
                            Pause Stream
                        </DropdownMenuItem>
                    )}

                    {isSender && isPaused && (
                        <DropdownMenuItem
                            className="cursor-pointer"
                            onClick={handleResume}
                        >
                            <Play className="mr-2 h-4 w-4" />
                            Resume Stream
                        </DropdownMenuItem>
                    )}

                    {isSender && (isActive || isPaused) && stream.cancelable && (
                        <DropdownMenuItem
                            className="cursor-pointer text-red-500 focus:text-red-500 focus:bg-red-500/10"
                            onClick={handleCancel}
                        >
                            <XCircle className="mr-2 h-4 w-4" />
                            Cancel Stream
                        </DropdownMenuItem>
                    )}

                    {isSender && (
                        <DropdownMenuItem
                            className="cursor-pointer"
                            onClick={() => setIsDelegateModalOpen(true)}
                        >
                            <Shield className="mr-2 h-4 w-4" />
                            Manage Delegate
                        </DropdownMenuItem>
                    )}

                    {(isSender || isRecipient) && <DropdownMenuSeparator />}

                    <DropdownMenuItem
                        className="cursor-pointer"
                        onClick={handleViewOnExplorer}
                    >
                        <ExternalLink className="mr-2 h-4 w-4" />
                        View on Explorer
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        className="cursor-pointer"
                        onClick={handleCopyStreamId}
                    >
                        <Copy className="mr-2 h-4 w-4" />
                        Copy Stream ID
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <WithdrawStreamModal
                open={isWithdrawOpen}
                onOpenChange={setIsWithdrawOpen}
                stream={stream}
            />

            <ManageDelegateModal
                isOpen={isDelegateModalOpen}
                onClose={() => setIsDelegateModalOpen(false)}
                streamId={stream.id}
                currentDelegate={stream.delegateAddress ?? undefined}
            />
        </>
    );
}
