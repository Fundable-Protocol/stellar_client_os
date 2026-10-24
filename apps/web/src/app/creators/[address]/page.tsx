import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCreatorStats } from "@/services/creator-stats.service";
import { CreatorProfileHeader } from "@/components/creator/CreatorProfileHeader";
import { CreatorStats } from "@/components/creator/CreatorStats";
import { CreatorCampaignsList } from "@/components/creator/CreatorCampaignsList";
import { ShareProfileButton } from "@/components/creator/ShareProfileButton";
import { getCampaignRatingSummaries, getCreatorOverallRating } from "@/services/campaign-reviews.service";
import { StarRating } from "@/components/ui/star-rating";

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
    // Overall star rating aggregated from backer reviews (#1250).
    const overallRating = await getCreatorOverallRating(address);
    const campaignRatings = getCampaignRatingSummaries(stats.campaigns.map((campaign) => campaign.id));

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

          {/* Overall backer rating (#1250) */}
          <div className="mt-8 flex items-center gap-3 rounded-lg bg-white px-6 py-4 shadow-md">
            <StarRating value={overallRating.averageRating} size={5} />
            <span className="text-lg font-semibold text-gray-900">
              {overallRating.averageRating === null ? "No reviews yet" : overallRating.averageRating}
            </span>
            <span className="text-sm text-gray-600">
              {overallRating.reviewCount} review{overallRating.reviewCount === 1 ? "" : "s"} across {overallRating.campaignCount} campaign{overallRating.campaignCount === 1 ? "" : "s"}
            </span>
          </div>

          {/* Links to Blog and Analytics Dashboard */}
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href={`/creators/${address}/blog`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors"
            >
              View Creator Blog & Updates →
            </Link>
            <Link
              href={`/creators/${address}/analytics`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-purple-700 border border-purple-600 hover:bg-purple-50 transition-colors"
            >
              View Campaign Analytics →
            </Link>
          </div>

          {/* All Campaigns List */}
          <div className="mt-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              All Campaigns ({stats.totalCampaigns})
            </h2>
            <CreatorCampaignsList campaigns={stats.campaigns} ratings={campaignRatings} />
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
