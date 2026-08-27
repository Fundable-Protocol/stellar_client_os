import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import { sliceAddress } from "@/lib/utils";
import { format } from "date-fns";
import { ColumnDef } from "@tanstack/react-table";
import { StreamRecord } from "@/lib/validations";
import StreamProgressBar from "./StreamProgressBar";
import StreamCountdown from "./StreamCountdown";

const getStatusBadgeStyle = (status: string) => {
    switch (status?.toLowerCase()) {
        case "active":
            return {
                dot: "bg-emerald-500",
                badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
            };
        case "paused":
            return {
                dot: "bg-amber-500",
                badge: "bg-amber-500/10 text-amber-400 border-amber-500/20",
            };
        case "canceled":
            return {
                dot: "bg-red-500",
                badge: "bg-red-500/10 text-red-400 border-red-500/20",
            };
        case "transferred":
            return {
                dot: "bg-blue-500",
                badge: "bg-blue-500/10 text-blue-400 border-blue-500/20",
            };
        case "completed":
        default:
            return {
                dot: "bg-zinc-500",
                badge: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
            };
    }
};

/**
 * Hook to return memoized table column definitions for payment streams,
 * preventing re-creation of column objects on every render cycle.
 */
export function useStreamColumns(): ColumnDef<StreamRecord>[] {
    return useMemo(() => streamColumns, []);
}

export const streamColumns: ColumnDef<StreamRecord>[] = [
    {
        accessorKey: "id",
        header: () => <div className="text-center">ID</div>,
        cell: ({ row }) => (
            <div className="text-white font-mono text-center text-xs">
                {sliceAddress(row.getValue("id") as string, 8, 8)}
            </div>
        ),
    },
    {
        accessorKey: "sender",
        header: () => <div className="text-center">Sender</div>,
        cell: ({ row }) => (
            <div className="text-white font-mono text-center">
                {sliceAddress(row.getValue("sender") as string)}
            </div>
        ),
    },
    {
        accessorKey: "recipient",
        header: () => <div className="text-center">Receiver</div>,
        cell: ({ row }) => (
            <div className="text-white font-mono text-center">
                {sliceAddress(row.getValue("recipient") as string)}
            </div>
        ),
    },
    {
        accessorKey: "totalAmount",
        header: () => <div className="text-center">Amount</div>,
        cell: ({ row }) => {
            const amount = parseFloat(row.getValue("totalAmount") as string);
            const tokenSymbol = row.original.tokenSymbol;
            return (
                <div className="text-center">
                    <span className="text-white font-mono">
                        {amount.toFixed(2)} {tokenSymbol}
                    </span>
                </div>
            );
        },
        sortingFn: "alphanumeric", // Simple way to handle decimal strings
    },
    {
        id: "progress",
        header: () => <div className="text-center">Progress</div>,
        enableSorting: false,
        cell: ({ row }) => {
            const stream = row.original;
            const now = Date.now();
            // Don't apply time-based status overrides while the stream is still
            // being confirmed on-chain — the end time may not be meaningful yet.
            const isConfirming = stream.status?.toLowerCase() === "confirming";
            const effectiveStatus = isConfirming
                ? "confirming"
                : now > stream.endTime
                ? "completed"
                : stream.status;
            return (
                <div className="min-w-[150px]">
                    <StreamProgressBar
                        startTime={stream.startTime}
                        endTime={stream.endTime}
                        totalAmount={stream.totalAmount}
                        withdrawnAmount={stream.withdrawnAmount}
                        status={effectiveStatus}
                        tokenSymbol={stream.tokenSymbol}
                    />
                </div>
            );
        },
    },
    {
        accessorKey: "startTime",
        header: () => <div className="text-center">Start Date</div>,
        cell: ({ row }) => {
            const startTime = row.getValue("startTime") as number;
            const formattedDate = format(new Date(startTime), "MMM dd, yyyy HH:mm");
            return (
                <div className="text-white font-mono text-center text-xs">{formattedDate}</div>
            );
        },
    },
    {
        accessorKey: "endTime",
        header: () => <div className="text-center">End Date</div>,
        cell: ({ row }) => {
            const endTime = row.getValue("endTime") as number;
            const status = row.original.status;
            const now = Date.now();
            const isConfirming = status?.toLowerCase() === "confirming";
            const effectiveStatus = isConfirming
                ? "confirming"
                : now > endTime
                ? "completed"
                : status;
            const formattedDate = format(new Date(endTime), "MMM dd, yyyy HH:mm");
            return (
                <div className="flex flex-col items-center space-y-1">
                    <div className="text-white font-mono text-center text-xs">{formattedDate}</div>
                    <StreamCountdown endTime={endTime} status={effectiveStatus} />
                </div>
            );
        },
    },
    {
        accessorKey: "status",
        header: () => <div className="text-center">Status</div>,
        cell: ({ row }) => {
            const endTime = row.original.endTime;
            const currentTime = Date.now();
            const rawStatus = row.getValue("status") as string;

            // A stream pending on-chain confirmation gets a distinct "Confirming..."
            // badge so users can tell it apart from an already-Active stream.
            const isConfirming = rawStatus?.toLowerCase() === "confirming";

            const status = isConfirming
                ? "confirming"
                : currentTime > endTime
                ? "completed"
                : rawStatus;

            if (isConfirming) {
                return (
                    <div className="flex justify-center items-center gap-1.5">
                        <Loader2
                            className="size-3.5 text-amber-400 animate-spin shrink-0"
                            aria-hidden="true"
                        />
                        <span className="text-amber-300 font-medium animate-pulse whitespace-nowrap">
                            Confirming...
                        </span>
                    </div>
                );
            }

            const badgeStyle = getStatusBadgeStyle(status);

            return (
                <div className="flex justify-center items-center">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${badgeStyle.badge}`}>
                        <span className={`size-1.5 rounded-full ${badgeStyle.dot} mr-1.5`} />
                        <span className="capitalize">{status}</span>
                    </span>
                </div>
            );
        },
    },
];
