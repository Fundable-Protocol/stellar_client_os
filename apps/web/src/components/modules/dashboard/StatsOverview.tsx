"use client";

import { useWallet } from "@/providers/StellarWalletProvider";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { createTestnetService } from "@/services";
import { DISTRIBUTOR_CONTRACT_ID, PAYMENT_STREAM_CONTRACT_ID } from "@/lib/constants";
import { useMemo } from "react";

const StatsOverview = () => {
    const { address } = useWallet();

    const service = useMemo(() => createTestnetService({
        paymentStream: PAYMENT_STREAM_CONTRACT_ID,
        distributor: DISTRIBUTOR_CONTRACT_ID,
    }), []);

    const { data: streams, isLoading: isLoadingStreams } = useQuery({
        queryKey: ["payment-streams-stats", address],
        queryFn: () => service.getStreams(address!),
        enabled: !!address,
    });

    const activeStreams = streams?.filter(s => s.status === 'Active').length ?? 0;

    const stats = [
        { label: "Active Streams", value: activeStreams, isLoading: isLoadingStreams },
        { label: "Total Distributed", value: "$0.00", isLoading: false }, // Placeholder for now
        { label: "Pending Claims", value: "0", isLoading: false }, // Placeholder for now
    ];

    if (!address) return null;

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8 mb-8">
            {stats.map((stat, i) => (
                <div key={i} className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
                    <p className="text-sm text-zinc-400 mb-1">{stat.label}</p>
                    {stat.isLoading ? (
                        <Skeleton className="h-8 w-16 bg-zinc-800" />
                    ) : (
                        <p className="text-2xl font-bold text-white">{stat.value}</p>
                    )}
                </div>
            ))}
        </div>
    );
};

export default StatsOverview;
