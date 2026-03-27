"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/providers/StellarWalletProvider";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import { ConnectWalletPrompt } from "@/components/layouts/ProtectedRoute";
import HistoryTable from "@/components/modules/history/HistoryTable";
import HistoryTableSkeleton from "@/components/modules/history/HistoryTableSkeleton";
import { columns } from "@/components/modules/history/columns";
import { HistoryRecord } from "@/services/types";
import AppSelect from "@/components/molecules/AppSelect";
import { createTestnetService } from "@/services";
import { DISTRIBUTOR_CONTRACT_ID, PAYMENT_STREAM_CONTRACT_ID } from "@/lib/constants";
import { withAbortSignal } from "@/utils/retry";

const HistoryPage = () => {
    const { address } = useWallet();
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(10);
    const [typeFilter, setTypeFilter] = useState<'all' | 'Stream' | 'Distribution'>('all');

    const service = useMemo(() => createTestnetService({
        paymentStream: PAYMENT_STREAM_CONTRACT_ID,
        distributor: DISTRIBUTOR_CONTRACT_ID,
    }), []);

    const { data: history, isLoading } = useQuery<HistoryRecord[]>({
        queryKey: ["transaction-history", address],
        queryFn: ({ signal }) =>
            address
                ? withAbortSignal(service.getTransactionHistory(address), signal)
                : Promise.resolve([]),
        enabled: !!address,
    });

    const filteredData = useMemo(() => {
        if (!history) return [];
        if (typeFilter === 'all') return history;
        return history.filter(h => h.type === typeFilter);
    }, [history, typeFilter]);

    const paginatedData = useMemo(() => {
        const start = (page - 1) * limit;
        return filteredData.slice(start, start + limit);
    }, [filteredData, page, limit]);

    const handleExportCSV = () => {
        if (!filteredData.length) return;

        const headers = ["Date", "Type", "Amount", "Token", "Recipients", "Status", "Hash"];
        const rows = filteredData.map((r) => [
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
            ...rows.map((row) => row.join(",")),
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
                        <div className="flex items-center gap-4">
                            <div className="w-48">
                                <p className="text-xs font-medium text-zinc-500 mb-1 ml-1">Filter by Type</p>
                                <AppSelect
                                    options={[
                                        { label: 'All Types', value: 'all' },
                                        { label: 'Streams', value: 'Stream' },
                                        { label: 'Distributions', value: 'Distribution' }
                                    ]}
                                    value={typeFilter}
                                    setValue={(v) => {
                                        setTypeFilter(v as any);
                                        setPage(1);
                                    }}
                                    placeholder="Type"
                                />
                            </div>
                        </div>

                        <HistoryTable
                            data={paginatedData}
                            columns={columns}
                            page={page}
                            limit={limit}
                            totalCount={filteredData.length}
                            onPageChange={setPage}
                            onLimitChange={setLimit}
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
