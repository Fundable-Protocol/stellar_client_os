"use client";

import {
    flexRender,
    useReactTable,
    getCoreRowModel,
    getPaginationRowModel,
} from "@tanstack/react-table";
import { useState } from "react";
import { ChevronDown, Copy, ExternalLink } from "lucide-react";
import { toast } from "react-hot-toast";

import {
    Table,
    TableCell,
    TableRow,
    TableBody,
    TableHead,
    TableHeader,
} from "@/components/ui/table";

import { HistoryRecord } from "@/services/types";
import AppSelect from "@/components/molecules/AppSelect";
import { validPageLimits } from "@/lib/constants";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import SlidingPagination from "@/components/molecules/SlidingPagination";
import ActionsCell from "./ActionsCell";
import { format } from "date-fns";

import { ColumnDef } from "@tanstack/react-table";

interface HistoryTableProps {
    data: HistoryRecord[];
    columns: ColumnDef<HistoryRecord, unknown>[];
    page: number;
    limit: number;
    totalCount: number;
    onPageChange: (page: number) => void;
    onLimitChange: (limit: number) => void;
    onExport: () => void;
    isLoading?: boolean;
}

const HistoryTable = ({
    data,
    columns,
    page,
    limit,
    totalCount,
    onPageChange,
    onLimitChange,
    onExport,
    isLoading = false,
}: HistoryTableProps) => {
    const table = useReactTable({
        data,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        manualPagination: true,
        pageCount: Math.ceil(totalCount / limit),
    });

    const pageCount = Math.ceil(totalCount / limit);

    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

    function toggleRow(id: string) {
        setExpandedRows((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-4">
                    <AppSelect
                        options={validPageLimits.map((l) => ({
                            label: `${l} per page`,
                            value: l.toString(),
                        }))}
                        value={limit.toString()}
                        setValue={(v) => onLimitChange(parseInt(v))}
                        placeholder="Limit"
                        title="Rows per page"
                        className="w-full sm:w-auto"
                    />
                </div>
                <Button
                    variant="outline"
                    className="border-zinc-800 bg-zinc-900 text-white hover:bg-zinc-800 w-full sm:w-auto"
                    onClick={onExport}
                    aria-label="Export transaction history as CSV"
                >
                    <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                    Export CSV
                </Button>
            </div>

            {/* Mobile: card list — hidden on tablet and above */}
            <div className="md:hidden">
                {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="h-8 w-8 rounded-full bg-zinc-800" />
                                    <div className="h-4 w-24 bg-zinc-800 animate-pulse rounded" />
                                </div>
                                <div className="h-5 w-16 bg-zinc-800 animate-pulse rounded-full" />
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="h-4 w-20 bg-zinc-800 animate-pulse rounded" />
                                <div className="h-3 w-16 bg-zinc-800 animate-pulse rounded" />
                            </div>
                        </div>
                    ))
                ) : data?.length ? (
                    <div className="space-y-3">
                        {table.getRowModel().rows.map((row) => {
                            const rec = row.original as HistoryRecord;
                            const isExpanded = expandedRows.has(rec.id);
                            return (
                                <div key={rec.id} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
                                    <button
                                        onClick={() => toggleRow(rec.id)}
                                        aria-expanded={isExpanded}
                                        aria-controls={`history-row-${rec.id}`}
                                        className="w-full text-left"
                                    >
                                        <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div
                                                            role="img"
                                                            aria-label={rec.type}
                                                            className="h-8 w-8 rounded-full bg-zinc-800 flex items-center justify-center text-white"
                                                        >
                                                            {rec.type === "Distribution" ? "D" : "S"}
                                                        </div>
                                                        <div className="text-zinc-300 font-medium capitalize">{rec.type}</div>
                                                    </div>
                                            <div className="flex items-center gap-3">
                                                <div className="flex items-center gap-2">
                                                    {/* status badge */}
                                                    {(() => {
                                                        const status = rec.status.toLowerCase();
                                                        let color = "bg-zinc-500";
                                                        if (status === "completed" || status === "active" || status === "success") color = "bg-emerald-500";
                                                        if (status === "paused" || status === "pending") color = "bg-amber-500";
                                                        if (status === "canceled" || status === "failed") color = "bg-rose-500";
                                                        return (
                                                            <div className="flex items-center gap-2">
                                                                <div className={`${color} h-2 w-2 rounded-full`} />
                                                                <span className="capitalize text-zinc-300">{status}</span>
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between mt-3">
                                            <div className="font-medium text-white">
                                                {rec.amount.toString()} {rec.token.substring(0, 4)}...
                                            </div>
                                            <div className="text-sm text-zinc-500">
                                                {format(new Date(rec.date), "MMM dd, yyyy HH:mm")}
                                            </div>
                                        </div>

                                        {/* View Details toggle row */}
                                        <div className="flex justify-end mt-3">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleRow(rec.id);
                                                }}
                                                aria-expanded={isExpanded}
                                                aria-controls={`history-row-${rec.id}`}
                                                className="ml-auto flex items-center gap-2 text-zinc-300 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                                            >
                                                <span>View Details</span>
                                                <ChevronDown className={`h-4 w-4 transform transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                                            </button>
                                        </div>

                                    </div>

                                    <div id={`history-row-${rec.id}`} className={`mt-3 overflow-hidden transition-all ${isExpanded ? "max-h-[1000px]" : "max-h-0"}`}>
                                        {isExpanded && (
                                            <div className="pt-3 border-t border-zinc-800 text-sm text-zinc-300 space-y-2">
                                                <div className="flex justify-between">
                                                    <div className="text-zinc-500">Recipients</div>
                                                    <div>{rec.recipients}</div>
                                                </div>
                                                <div className="flex justify-between">
                                                    <div className="text-zinc-500">Token</div>
                                                    <div className="truncate">{rec.token}</div>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                    <div className="text-zinc-500">Transaction</div>
                                                    <div className="flex items-center gap-2">
                                                        <div className="truncate max-w-[200px]">{rec.transactionHash ?? "-"}</div>
                                                        {rec.transactionHash && (
                                                            <button
                                                                onClick={async (e) => {
                                                                    e.stopPropagation();
                                                                    try {
                                                                        await navigator.clipboard.writeText(rec.transactionHash || "");
                                                                        toast.success("Transaction hash copied to clipboard");
                                                                    } catch {}
                                                                }}
                                                                className="p-1 rounded hover:bg-zinc-800"
                                                                aria-label="Copy transaction hash"
                                                            >
                                                                <Copy className="h-4 w-4" />
                                                            </button>
                                                        )}
                                                        {rec.transactionHash && (
                                                            <a
                                                                href={`https://stellar.expert/explorer/testnet/tx/${encodeURIComponent(rec.transactionHash)}`}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="p-1 rounded hover:bg-zinc-800"
                                                                aria-label="View on explorer"
                                                            >
                                                                <ExternalLink className="h-4 w-4" />
                                                            </a>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Actions for distributions */}
                                                {rec.type === "Distribution" && (
                                                    <div className="pt-2">
                                                        <ActionsCell distribution={{
                                                            id: rec.id,
                                                            total_amount: rec.amount.toString(),
                                                            token_symbol: 'Unknown',
                                                            distribution_type: 'equal',
                                                            status: rec.status as any,
                                                            created_at: rec.date,
                                                            total_recipients: rec.recipients,
                                                            transaction_hash: rec.transactionHash,
                                                            network: 'testnet',
                                                            user_address: '',
                                                            token_address: rec.token,
                                                            token_decimals: 7,
                                                            fee_amount: '0',
                                                        }} />
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="rounded-lg border border-zinc-800 p-6 text-center text-zinc-500">No transactions found</div>
                )}
            </div>

            {/* Desktop: existing table — hidden on mobile */}
            <div className="hidden md:block">
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
                    <Table>
                        <TableHeader>
                            {table.getHeaderGroups().map((headerGroup) => (
                                <TableRow key={headerGroup.id} className="border-zinc-800 hover:bg-transparent">
                                    {headerGroup.headers.map((header) => (
                                        <TableHead key={header.id} className="text-zinc-400 font-medium">
                                            {flexRender(header.column.columnDef.header, header.getContext())}
                                        </TableHead>
                                    ))}
                                </TableRow>
                            ))}
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                Array.from({ length: 5 }).map((_, rowIndex) => (
                                    <TableRow key={`skeleton-row-${rowIndex}`} className="border-zinc-800">
                                        {Array.from({ length: columns.length }).map((_, colIndex) => (
                                            <TableCell key={`skeleton-cell-${rowIndex}-${colIndex}`}>
                                                <div className="h-4 bg-zinc-800 animate-pulse rounded-md w-full" />
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                ))
                            ) : data?.length ? (
                                table.getRowModel().rows.map((row) => (
                                    <TableRow key={row.id} className="border-zinc-800 hover:bg-zinc-800/30">
                                        {row.getVisibleCells().map((cell) => (
                                            <TableCell key={cell.id}>
                                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={columns.length} className="h-48 text-center text-zinc-500">
                                        <div className="flex flex-col items-center justify-center space-y-3">
                                            <div className="p-3 bg-zinc-800/50 rounded-full">
                                                <Download className="h-6 w-6 text-zinc-600 opacity-50" />
                                            </div>
                                            <div>
                                                <p className="font-medium text-zinc-300">No transactions found</p>
                                                <p className="text-sm text-zinc-500">Your transaction history will appear here once you start using the app.</p>
                                            </div>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>

            <div className="flex items-center justify-between">
                <p className="text-sm text-zinc-500" aria-live="polite" aria-atomic="true">
                    Showing {data.length} of {totalCount} transactions
                </p>
                <SlidingPagination
                    page={page}
                    pageCount={pageCount}
                    onPageChange={onPageChange}
                    className="mx-0 w-auto justify-end"
                />
            </div>
        </div>
    );
};

export default HistoryTable;
