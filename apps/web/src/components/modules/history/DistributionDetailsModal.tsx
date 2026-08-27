"use client";

import { DistributionAttributes } from "@/types/history";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface DistributionDetailsModalProps {
    distribution: DistributionAttributes | null;
    isOpen: boolean;
    onClose: () => void;
}

const DistributionDetailsModal = ({
    distribution,
    isOpen,
    onClose,
}: DistributionDetailsModalProps) => {
    if (!distribution) return null;

    const details = [
        {
            label: "ID",
            value: distribution.id,
        },
        {
            label: "Status",
            value: <span className="capitalize">{distribution.status}</span>,
        },
        {
            label: "Type",
            value: <span className="capitalize">{distribution.distribution_type}</span>,
        },
        {
            label: "Network",
            value: distribution.network,
        },
        {
            label: "Amount",
            value: `${distribution.total_amount} ${distribution.token_symbol}`,
        },
        {
            label: "Recipients",
            value: distribution.total_recipients,
        },
        {
            label: "Date",
            value: new Date(distribution.created_at).toLocaleString(),
        },
        {
            label: "Tx Hash",
            value: distribution.transaction_hash ? (
                <span className="truncate max-w-[200px] block" title={distribution.transaction_hash}>
                    {distribution.transaction_hash}
                </span>
            ) : "N/A",
        },
    ];

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="bg-zinc-950 border-zinc-800 text-white sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Distribution Details</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                    {details.map((detail, index) => (
                        <div
                            key={index}
                            className="flex items-center justify-between border-b border-zinc-800 pb-2"
                        >
                            <span className="text-sm font-medium text-zinc-400">
                                {detail.label}
                            </span>
                            <span className="text-sm">{detail.value}</span>
                        </div>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default DistributionDetailsModal;
