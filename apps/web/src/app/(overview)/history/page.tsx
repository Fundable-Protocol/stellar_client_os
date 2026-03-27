"use client";
 
import React, { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useWallet } from "@/providers/StellarWalletProvider";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import { ConnectWalletPrompt } from "@/components/layouts/ProtectedRoute";
import HistoryTable from "@/components/modules/history/HistoryTable";
import { columns } from "@/components/modules/history/columns";
import { HistoryRecord } from "@/services/types";
import AppSelect from "@/components/molecules/AppSelect";
import { createTestnetService } from "@/services";
import { DISTRIBUTOR_CONTRACT_ID, PAYMENT_STREAM_CONTRACT_ID } from "@/lib/constants";
import { withAbortSignal } from "@/utils/retry";

const HistoryPage = () => {
    const { address } = useWallet();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    // Filter states initialized from URL params
    const [page, setPage] = useState(Number(searchParams.get("page")) || 1);
    const [limit, setLimit] = useState(Number(searchParams.get("limit")) || 10);
    const [typeFilter, setTypeFilter] = useState<'all' | 'Stream' | 'Distribution'>(
        (searchParams.get("type") as 'all' | 'Stream' | 'Distribution') || 'all'
    );
    const [tokenFilter, setTokenFilter] = useState(searchParams.get("token") || 'all');
    const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || 'all');
    const [startDate, setStartDate] = useState(searchParams.get("from") || '');
    const [endDate, setEndDate] = useState(searchParams.get("to") || '');

    // Sync state with URL
    useEffect(() => {
        const params = new URLSearchParams();
        if (page > 1) params.set("page", page.toString());
        if (limit !== 10) params.set("limit", limit.toString());
        if (typeFilter !== "all") params.set("type", typeFilter);
        if (tokenFilter !== "all") params.set("token", tokenFilter);
        if (statusFilter !== "all") params.set("status", statusFilter);
        if (startDate) params.set("from", startDate);
        if (endDate) params.set("to", endDate);

        const query = params.toString();
        router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
    }, [page, limit, typeFilter, tokenFilter, statusFilter, startDate, endDate, router, pathname]);

    const service = useMemo(() => createTestnetService({
        paymentStream: PAYMENT_STREAM_CONTRACT_ID,
        distributor: DISTRIBUTOR_CONTRACT_ID,
    }), []);

    const { data: history, isLoading } = useQuery<HistoryRecord[]>({
        queryKey: ["transaction-history", address],
        queryFn: ({ signal }: { signal: AbortSignal }) =>
            address
                ? withAbortSignal(service.getTransactionHistory(address), signal)
                : Promise.resolve([]),
        enabled: !!address,
    });

    const filteredData = useMemo(() => {
        if (!history) return [];
        
        return history.filter((h: HistoryRecord) => {
            // Type filter
            if (typeFilter !== 'all' && h.type !== typeFilter) return false;
            
            // Token filter
            if (tokenFilter !== 'all' && h.token !== tokenFilter) return false;
            
            // Status filter
            if (statusFilter !== 'all') {
                if (h.status.toLowerCase() !== statusFilter.toLowerCase()) return false;
            }
            
            // Date range filter
            if (startDate) {
                const start = new Date(startDate);
                if (new Date(h.date) < start) return false;
            }
            if (endDate) {
                const end = new Date(endDate);
                // End date is inclusive of the whole day
                end.setHours(23, 59, 59, 999);
                if (new Date(h.date) > end) return false;
            }
            
            return true;
        });
    }, [history, typeFilter, tokenFilter, statusFilter, startDate, endDate]);

    // Gather unique tokens for the filter dropdown
    const availableTokens = useMemo(() => {
        if (!history) return [];
        const tokens = new Set(history.map((h: HistoryRecord) => h.token));
        return Array.from(tokens).sort();
    }, [history]);

    const paginatedData = useMemo(() => {
        const start = (page - 1) * limit;
        return filteredData.slice(start, start + limit);
    }, [filteredData, page, limit]);

    const handleExportCSV = () => {
        if (!filteredData.length) return;

        const headers = ["Date", "Type", "Amount", "Token", "Recipients", "Status", "Hash"];
        const rows = filteredData.map((r: HistoryRecord) => [
            r.date,
            r.type,
            r.amount.toString(),
            r.token,
            r.recipients,
            r.status,
            r.transactionHash || "",
        ]);

        const csvContent = [
            headers.join(","),
            ...rows.map((row: (string | number)[]) => row.join(",")),
        ].join("\n");

        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `transaction_history_${new Date().toISOString()}.csv`);
        link.style.visibility = "hidden";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <DashboardLayout title="Transaction History">
            <div className="py-6 space-y-6">
                {!address ? (
                    <ConnectWalletPrompt
                        title="Connect your wallet"
                        description="Please connect your Stellar wallet to view your transaction history across payment streams and distributions."
                        containerClassName="min-h-[400px]"
                    />
                ) : (
                    <>
                        <div className="flex flex-wrap items-end gap-4 p-4 bg-zinc-900/50 rounded-2xl border border-zinc-800">
                            <div className="w-40">
                                <p className="text-xs font-medium text-zinc-500 mb-1.5 ml-1">Type</p>
                                <AppSelect
                                    options={[
                                        { label: 'All Types', value: 'all' },
                                        { label: 'Streams', value: 'Stream' },
                                        { label: 'Distributions', value: 'Distribution' }
                                    ]}
                                    value={typeFilter}
                                    setValue={(v) => {
                                        setTypeFilter(v as 'all' | 'Stream' | 'Distribution');
                                        setPage(1);
                                    }}
                                    placeholder="Type"
                                />
                            </div>

                            <div className="w-40">
                                <p className="text-xs font-medium text-zinc-500 mb-1.5 ml-1">Token</p>
                                <AppSelect
                                    options={[
                                        { label: 'All Tokens', value: 'all' },
                                        ...availableTokens.map((t: string) => ({ label: t, value: t }))
                                    ]}
                                    value={tokenFilter}
                                    setValue={(v) => {
                                        setTokenFilter(v);
                                        setPage(1);
                                    }}
                                    placeholder="Token"
                                />
                            </div>

                            <div className="w-40">
                                <p className="text-xs font-medium text-zinc-500 mb-1.5 ml-1">Status</p>
                                <AppSelect
                                    options={[
                                        { label: 'All Statuses', value: 'all' },
                                        { label: 'Completed', value: 'completed' },
                                        { label: 'Active', value: 'active' },
                                        { label: 'Pending', value: 'pending' },
                                        { label: 'Failed', value: 'failed' },
                                        { label: 'Canceled', value: 'canceled' },
                                        { label: 'Paused', value: 'paused' },
                                    ]}
                                    value={statusFilter}
                                    setValue={(v) => {
                                        setStatusFilter(v);
                                        setPage(1);
                                    }}
                                    placeholder="Status"
                                />
                            </div>

                            <div className="flex gap-2">
                                <div className="w-36">
                                    <p className="text-xs font-medium text-zinc-500 mb-1.5 ml-1">From</p>
                                    <input
                                        type="date"
                                        value={startDate}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                            setStartDate(e.target.value);
                                            setPage(1);
                                        }}
                                        className="w-full h-10 px-3 rounded-xl bg-[#0F1621] border border-white/10 text-white text-sm focus:outline-none focus:border-fundable-purple-2 transition-colors [color-scheme:dark]"
                                    />
                                </div>
                                <div className="w-36">
                                    <p className="text-xs font-medium text-zinc-500 mb-1.5 ml-1">To</p>
                                    <input
                                        type="date"
                                        value={endDate}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                            setEndDate(e.target.value);
                                            setPage(1);
                                        }}
                                        className="w-full h-10 px-3 rounded-xl bg-[#0F1621] border border-white/10 text-white text-sm focus:outline-none focus:border-fundable-purple-2 transition-colors [color-scheme:dark]"
                                    />
                                </div>
                            </div>
                            
                            {(typeFilter !== 'all' || tokenFilter !== 'all' || statusFilter !== 'all' || startDate || endDate) && (
                                <button
                                    onClick={() => {
                                        setTypeFilter('all');
                                        setTokenFilter('all');
                                        setStatusFilter('all');
                                        setStartDate('');
                                        setEndDate('');
                                        setPage(1);
                                    }}
                                    className="h-10 px-4 text-xs font-medium text-zinc-400 hover:text-white transition-colors"
                                >
                                    Reset
                                </button>
                            )}
                        </div>

                        <HistoryTable
                            data={paginatedData}
                            columns={columns}
                            page={page}
                            limit={limit}
                            totalCount={filteredData.length}
                            onPageChange={(nextPage) => updateHistoryParams({ page: nextPage })}
                            onLimitChange={(nextLimit) =>
                                updateHistoryParams({ page: 1, limit: nextLimit })
                            }
                            onExport={handleExportCSV}
                            isLoading={isLoading}
                        />
                    </>
                )}
            </div>
        </DashboardLayout>
    );
};

export default HistoryPage;
