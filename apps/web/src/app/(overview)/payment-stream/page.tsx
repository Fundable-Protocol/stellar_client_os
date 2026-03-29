"use client";

import { Suspense } from "react";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import ProtectedRoute from "@/components/layouts/ProtectedRoute";
import WalletConnectionGuard from "@/components/modules/wallet/WalletConnectionGuard";
import CreatePaymentStream from "@/components/modules/payment-stream/CreatePaymentStream";
import StreamsHistory from "@/components/modules/payment-stream/StreamsHistory";
import StreamsTableSkeleton from "@/components/modules/payment-stream/StreamsTableSkeleton";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { ErrorFallback } from "@/components/ui/error-fallback";

const PaymentStreamPage = () => {
    return (
        <DashboardLayout
            title="Payment Streams"
            className="flex flex-col gap-y-6 h-full bg-transparent"
            availableNetwork={["testnet", "mainnet"]}
            infoMessage={{
                type: "warning",
                title: "Beta Feature",
                message: "Feature is in beta mode.",
                showOnNetwork: "mainnet",
            }}
        >
            <ProtectedRoute
                description="Connect your Stellar wallet to create and manage payment streams."
            >
                <WalletConnectionGuard contextLabel="Connect your Stellar wallet to create and manage payment streams.">
                    <CreatePaymentStream />
                </WalletConnectionGuard>
                <Suspense fallback={<StreamsTableSkeleton />}>
                    <StreamsHistory />
                </Suspense>
            </ProtectedRoute>
        </DashboardLayout>
    );
};

export default PaymentStreamPage;
