"use client";

import { useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@/providers/StellarWalletProvider";
import { ColumnDef } from "@tanstack/react-table";

import StreamsTable from "./StreamsTable";
import { capitalizeWord } from "@/lib/utils";
import { paymentStreamStatus, validPageLimits } from "@/lib/constants";
import AppSelect from "@/components/molecules/AppSelect";
import StreamsTableSkeleton from "./StreamsTableSkeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { streamColumns } from "./streamColumns";
import StreamActionsCell from "./StreamActionsCell";
import type { StreamRecord } from "@/lib/validations";
import { withAbortSignal } from "@/utils/retry";

// Mock API function - replace with real API call when backend is ready
async function fetchStreams(
    address: string,
    params: {
        page: number;
        limit: number;
        type: string;
        status?: string;
    }
): Promise<{
    streams: StreamRecord[];
    meta: { currentPage: number; perPage: number; totalRows: number };
}> {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Mock data
    const mockStreams: StreamRecord[] = [
        {
            id: "stream_001_abc123def456",
            sender: "GCKFBEIYTKP5RDBQMTVVALONAOPBXICYQPGJGQONRRGZRWCXJWW2BVN7",
            recipient: "GDQJUTQYK2MQX2VGDR2FYWLIYAQIEGXTQVTFEMGH2BEWFG4BRUY4CKI7",
            token: "USDC",
            tokenSymbol: "USDC",
            totalAmount: "1000.0000000",
            withdrawnAmount: "250.0000000",
            startTime: Date.now() - 86400000 * 3,
            endTime: Date.now() + 86400000 * 4,
            status: "Active",
            cancelable: true,
            transferable: false,
        },
        {
            id: "stream_002_xyz789ghi012",
            sender: "GDQJUTQYK2MQX2VGDR2FYWLIYAQIEGXTQVTFEMGH2BEWFG4BRUY4CKI7",
            recipient: "GCKFBEIYTKP5RDBQMTVVALONAOPBXICYQPGJGQONRRGZRWCXJWW2BVN7",
            token: "XLM",
            tokenSymbol: "XLM",
            totalAmount: "5000.0000000",
            withdrawnAmount: "0.0000000",
            startTime: Date.now() - 86400000,
            endTime: Date.now() + 86400000 * 29,
            status: "Active",
            cancelable: false,
            transferable: true,
        },
    ];

    // Filter by type
    const filteredStreams = mockStreams.filter((stream) => {
        if (params.type === "incoming") {
            return stream.recipient.toLowerCase() === address.toLowerCase();
        }
        return stream.sender.toLowerCase() === address.toLowerCase();
    });

    // Filter by status
    const statusFiltered =
        params.status && params.status !== "all"
            ? filteredStreams.filter(
                (s) => s.status.toLowerCase() === params.status?.toLowerCase()
            )
            : filteredStreams;

    return {
        streams: statusFiltered,
        meta: {
            currentPage: params.page,
            perPage: params.limit,
            totalRows: statusFiltered.length,
        },
    };
}

export const StreamsHistory = () => {
    const { address, isConnected } = useWallet();
    const queryClient = useQueryClient();
    const searchParams = useSearchParams();

    const page = parseInt(searchParams.get("page") || "1");
    const limit = validPageLimits.includes(
        parseInt(searchParams.get("limit") || "10") as (typeof validPageLimits)[number]
    )
        ? parseInt(searchParams.get("limit") || "10")
        : validPageLimits[0];

    const [statusFilter, setStatusFilter] = useState("all");

    // Check for the switch signal
    const shouldSwitchToOutgoing = queryClient.getQueryData([
        "stream-created-switch-tab",
    ]);

    // Use state for manual tab control, but initialize based on switch signal
    const [activeTab, setActiveTab] = useState(() =>
        shouldSwitchToOutgoing ? "outgoing" : "incoming"
    );

    // Update activeTab when switch signal appears
    if (shouldSwitchToOutgoing && activeTab !== "outgoing") {
        setActiveTab("outgoing");
        // Clear the signal after using it
        queryClient.removeQueries({
            queryKey: ["stream-created-switch-tab"],
        });
    }

    const tabTriggerValues = ["incoming", "outgoing"];

    const { data: streamsData, isPending } = useQuery({
        queryKey: ["payment-streams-table", statusFilter, page, limit, activeTab, address],
        queryFn: ({ signal }) =>
            withAbortSignal(
                fetchStreams(address ?? "", {
                    page,
                    limit,
                    type: activeTab,
                    status: statusFilter !== "all" ? statusFilter : undefined,
                }),
                signal
            ),
        enabled: !!address && isConnected,
    });

    const statusOptions = [
        { label: "All", value: "all" },
        ...paymentStreamStatus.map((status) => ({
            label: capitalizeWord(status),
            value: status,
        })),
    ];

    const handleStatusChange = (value: string) => {
        setStatusFilter(value);
    };

    const handleTabChange = (tab: string) => {
        setActiveTab(tab);
        // Clear any existing switch signal when manually changing tabs
        queryClient.removeQueries({
            queryKey: ["stream-created-switch-tab"],
        });
    };

    // Add actions column for incoming streams
    const columnsWithActions: ColumnDef<StreamRecord>[] = useMemo(
        () => [
            ...streamColumns,
            {
                id: "actions",
                header: () => <div className="text-center">Action</div>,
                cell: ({ row }) => (
                    <div className="flex justify-center">
                        <StreamActionsCell stream={row.original as StreamRecord} />
                    </div>
                ),
            },
        ],
        []
    );

    if (!isConnected) {
        return (
            <div className="w-full mt-6 text-zinc-100">
                <h1 className="font-semibold pb-2 border-b border-b-zinc-700 w-full mb-4">
                    Streams History
                </h1>
                <div className="text-center py-8 bg-zinc-800/50 rounded-lg border border-zinc-700">
                    <p className="text-zinc-400">Connect your wallet to view streams</p>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full mt-6 text-zinc-100">
            <h1 className="font-semibold pb-2 border-b border-b-zinc-700 w-full mb-4">
                Streams History
            </h1>

            <Tabs
                value={activeTab}
                defaultValue="incoming"
                className="w-full"
                onValueChange={handleTabChange}
            >
                <div className="flex mb-2 items-center w-full gap-x-6">
                    <TabsList className="bg-zinc-800 p-1 rounded-md h-auto">
                        {tabTriggerValues.map((value) => (
                            <TabsTrigger
                                key={value}
                                value={value}
                                className="data-[state=active]:bg-zinc-700 hover:cursor-pointer data-[state=active]:text-zinc-100 text-zinc-400 rounded-md px-4 py-1.5"
                            >
                                {capitalizeWord(value)}
                            </TabsTrigger>
                        ))}
                    </TabsList>

                    <AppSelect
                        placeholder={
                            statusOptions.find((opt) => opt.value === statusFilter)?.label ||
                            statusOptions[0].label
                        }
                        options={statusOptions}
                        setValue={handleStatusChange}
                        className="w-full lg:w-40"
                    />
                </div>

                <TabsContent value="incoming">
                    <StreamsTable
                        data={streamsData?.streams ?? []}
                        page={streamsData?.meta.currentPage}
                        limit={streamsData?.meta.perPage}
                        totalCount={streamsData?.meta.totalRows}
                        columns={columnsWithActions}
                        isLoading={isPending}
                    />
                </TabsContent>

                <TabsContent value="outgoing">
                    <StreamsTable
                        data={streamsData?.streams ?? []}
                        page={streamsData?.meta.currentPage}
                        limit={streamsData?.meta.perPage}
                        totalCount={streamsData?.meta.totalRows}
                        columns={columnsWithActions}
                        isLoading={isPending}
                    />
                </TabsContent>
            </Tabs>
        </div>
    );
};

export default StreamsHistory;
