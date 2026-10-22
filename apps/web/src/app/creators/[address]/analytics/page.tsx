import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { GeographicHeatMap } from "@/components/analytics/GeographicHeatMap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CreatorAnalyticsPageProps {
  params: Promise<{
    address: string;
  }>;
}

export async function generateMetadata({ params }: CreatorAnalyticsPageProps) {
  const { address } = await params;
  
  return {
    title: `Analytics - ${address.slice(0, 8)}... | Fundable`,
    description: `Geographic distribution and analytics for creator ${address}`,
  };
}

function LoadingAnalytics() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-white">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-8"></div>
          <div className="h-96 bg-gray-200 rounded"></div>
        </div>
      </div>
    </div>
  );
}

async function CreatorAnalyticsContent({ address }: { address: string }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-white">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Back button */}
        <Link
          href={`/creators/${address}`}
          className="inline-flex items-center gap-2 text-purple-600 hover:text-purple-700 mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Profile
        </Link>

        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Campaign Analytics</h1>
          <p className="text-gray-600">
            Geographic distribution and insights for{" "}
            <span className="font-mono text-sm">{address.slice(0, 8)}...{address.slice(-6)}</span>
          </p>
        </div>

        {/* Geographic Heat Map */}
        <GeographicHeatMap creatorAddress={address} className="mb-8" />

        {/* Additional analytics sections can be added here */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Engagement Metrics
            </h3>
            <p className="text-sm text-gray-600">
              Coming soon: Real-time engagement analytics, backer retention rates, and campaign performance metrics.
            </p>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Growth Trends
            </h3>
            <p className="text-sm text-gray-600">
              Coming soon: Historical growth charts, seasonal trends, and projection analytics.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default async function CreatorAnalyticsPage({ params }: CreatorAnalyticsPageProps) {
  const { address } = await params;

  if (!address || address.length < 10) {
    notFound();
  }

  return (
    <Suspense fallback={<LoadingAnalytics />}>
      <CreatorAnalyticsContent address={address} />
    </Suspense>
  );
}
