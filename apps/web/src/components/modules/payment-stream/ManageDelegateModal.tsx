"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { StrKey } from "@stellar/stellar-sdk";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { useStreamDelegation } from "@/hooks/use-stream-delegation";

interface ManageDelegateModalProps {
    isOpen: boolean;
    onClose: () => void;
    streamId: string;
    currentDelegate?: string;
}

function truncateAddress(address: string): string {
    if (address.length <= 12) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function ManageDelegateModal({ isOpen, onClose, streamId, currentDelegate }: ManageDelegateModalProps) {
    const { setDelegate, revokeDelegate } = useStreamDelegation();

    const [delegateInput, setDelegateInput] = useState(currentDelegate ?? "");
    const [validationError, setValidationError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const hasDelegate = Boolean(currentDelegate);
    const isSetting = setDelegate.isPending;
    const isRemoving = revokeDelegate.isPending;
    const isPending = isSetting || isRemoving;

    const currentDelegateDisplay = useMemo(() => {
        if (!currentDelegate) {
            return "No delegate set";
        }
        return truncateAddress(currentDelegate);
    }, [currentDelegate]);

    const handleSetOrUpdate = async () => {
        const trimmedDelegate = delegateInput.trim();
        setValidationError(null);
        setActionError(null);

        if (!StrKey.isValidEd25519PublicKey(trimmedDelegate)) {
            setValidationError("Please enter a valid Stellar public key (G...).");
            return;
        }

        try {
            await setDelegate.mutateAsync({ streamId, delegateAddress: trimmedDelegate });
            onClose();
        } catch (error) {
            setActionError(error instanceof Error ? error.message : "Failed to update delegate.");
        }
    };

    const handleRemove = async () => {
        setValidationError(null);
        setActionError(null);

        try {
            await revokeDelegate.mutateAsync(streamId);
            onClose();
        } catch (error) {
            setActionError(error instanceof Error ? error.message : "Failed to remove delegate.");
        }
    };

    if (!isOpen) return null;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => (!open ? onClose() : undefined)}>
            <DialogContent className="w-full max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
                <DialogHeader>
                    <DialogTitle>Manage Delegate</DialogTitle>
                    <DialogDescription>
                        View and update the delegate wallet allowed to manage this stream.
                    </DialogDescription>
                    <DialogClose onClick={onClose} />
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-1 rounded-lg border border-zinc-700 bg-zinc-800 p-3">
                        <p className="text-sm text-zinc-400">Current Delegate</p>
                        <p className={hasDelegate ? "font-medium text-zinc-50" : "text-zinc-400"}>
                            {currentDelegateDisplay}
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="delegate-address">Delegate Address</Label>
                        <Input
                            id="delegate-address"
                            value={delegateInput}
                            onChange={(event) => {
                                setDelegateInput(event.target.value);
                                if (validationError) {
                                    setValidationError(null);
                                }
                            }}
                            placeholder="G..."
                            disabled={isPending}
                            aria-invalid={Boolean(validationError)}
                            aria-describedby={validationError ? "delegate-address-error" : undefined}
                        />
                        {validationError && (
                            <p id="delegate-address-error" className="text-sm text-red-400" role="alert">
                                {validationError}
                            </p>
                        )}
                    </div>

                    {actionError && (
                        <p className="text-sm text-red-400" role="alert">
                            {actionError}
                        </p>
                    )}
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="outline" onClick={onClose} disabled={isPending}>
                        Cancel
                    </Button>

                    {hasDelegate && (
                        <Button variant="destructive" onClick={handleRemove} disabled={isPending}>
                            {isRemoving ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Removing...
                                </>
                            ) : (
                                "Remove Delegate"
                            )}
                        </Button>
                    )}

                    <Button onClick={handleSetOrUpdate} disabled={isPending}>
                        {isSetting ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                {hasDelegate ? "Updating..." : "Setting..."}
                            </>
                        ) : hasDelegate ? (
                            "Update Delegate"
                        ) : (
                            "Set Delegate"
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
