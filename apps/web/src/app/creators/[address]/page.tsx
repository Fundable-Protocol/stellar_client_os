import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getCreatorStats } from "@/services/creator-stats.service";
import { CreatorProfileHeader } from "@/components/creator/CreatorProfileHeader";
import { CreatorStats } from "@/components/creator/CreatorStats";
import { CreatorCampaignsList } from "@/components/creator/CreatorCampaignsList";
import { ShareProfileButton } from "@/components/creator/ShareProfileButton";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CreatorProfilePageProps {
  params: Promise<{
    address: string;
  }>;
}

export async function generateMetadata({ params }: CreatorProfilePageProps) {
  const { address } = await params;
  
  return {
    title: `${address.slice(0, 8)}... - Creator Profile | Fundable`,
    description: `View all campaigns, impact metrics, and statistics for creator ${address}`,
  };
}

async function CreatorProfileContent({ address }: { address: string }) {
  try {
    const stats = await getCreatorStats(address);

    return (
      <div className="min-h-screen bg-gradient-to-b from-purple-50 to-white">
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          {/* Header with creator address and share button */}
          <div className="flex items-center justify-between mb-8">
            <CreatorProfileHeader address={address} stats={stats} />
            <ShareProfileButton address={address} />
          </div>

          {/* Impact Stats Cards */}
          <CreatorStats stats={stats} />

          {/* All Campaigns List */}
          <div className="mt-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              All Campaigns ({stats.totalCampaigns})
            </h2>
            <CreatorCampaignsList campaigns={stats.campaigns} />
          </div>
        </div>
      </div>
    );
  } catch (error) {
    console.error("Error loading creator profile:", error);
    notFound();
  }
}

function LoadingCreatorProfile() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-white">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="animate-pulse">
          <div className="h-12 bg-gray-200 rounded w-1/3 mb-8"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default async function CreatorProfilePage({ params }: CreatorProfilePageProps) {
  const { address } = await params;

  if (!address || address.length < 10) {
    notFound();
  }

  return (
    <Suspense fallback={<LoadingCreatorProfile />}>
      <CreatorProfileContent address={address} />
    </Suspense>
  );
}
