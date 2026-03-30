"use client";

interface ManageDelegateModalProps {
    isOpen: boolean;
    onClose: () => void;
    streamId: string;
    currentDelegate?: string;
}

export function ManageDelegateModal({ isOpen, onClose, streamId, currentDelegate }: ManageDelegateModalProps) {
    if (!isOpen) return null;
    return null;
}
