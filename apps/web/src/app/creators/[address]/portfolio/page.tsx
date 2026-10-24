/**
 * Creator Portfolio Page
 * 
 * Route: /creators/[address]/portfolio
 * 
 * Displays a comprehensive creator portfolio including:
 * - Creator profile with bio and social links
 * - Portfolio statistics (campaigns, success rate, impact)
 * - Achievements and badges
 * - Campaign history
 */

import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import { getCreatorPortfolioProfile } from '@/services/creator-portfolio.service';
import { getCreatorStats } from '@/services/creator-stats.service';
import { demoCampaigns } from '@/services/campaign-trending.service';
import { PortfolioHeader } from '@/components/creator-portfolio/PortfolioHeader';
import { PortfolioStats } from '@/components/creator-portfolio/PortfolioStats';
import { Achievements } from '@/components/creator-portfolio/Achievements';
import { CreatorCampaignsList } from '@/components/creator/CreatorCampaignsList';
import { getCampaignRatingSummaries } from '@/services/campaign-reviews.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface CreatorPortfolioPageProps {
  params: Promise<{
    address: string;
  }>;
}

export async function generateMetadata({ params }: CreatorPortfolioPageProps) {
  const { address } = await params;

  return {
    title: `Portfolio - ${address.slice(0, 8)}... | Fundable Creator`,
    description: `View the complete portfolio, achievements, and campaign history for creator ${address}`,
  };
}

async function PortfolioContent({ address }: { address: string }) {
  try {
    // Fetch all required data in parallel
    const [profile, campaigns] = await Promise.all([
      getCreatorPortfolioProfile(address),
      demoCampaigns(),
    ]);

    if (!profile || profile.stats.totalCampaigns === 0) {
      notFound();
    }

    // Get campaign ratings
    const ratings = getCampaignRatingSummaries(
      profile.stats.totalCampaigns > 0
        ? profile.stats.totalCampaigns.toString().split('')
        : []
    );

    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 via-white to-gray-50">
        <div className="container mx-auto px-4 py-8 max-w-6xl">
          {/* Portfolio Header */}
          <PortfolioHeader profile={profile} />

          {/* Portfolio Stats */}
          <PortfolioStats stats={profile.stats} />

          {/* Achievements Section */}
          <section className="mt-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Achievements</h2>
            <Achievements achievements={profile.achievements} />
          </section>

          {/* Campaign History */}
          <section className="mt-12 pb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              Campaign History ({profile.stats.totalCampaigns})
            </h2>

            {profile.stats.totalCampaigns > 0 ? (
              <CreatorCampaignsList
                campaigns={profile.stats.totalCampaigns > 0 ? campaigns.filter(c => c.creator.toLowerCase() === address.toLowerCase()).slice(0, 5).map(c => ({
                  id: c.id,
                  targetAmount: c.goalAmount,
                  totalRaised: c.raisedAmount,
                  status: c.status,
                  sponsorsCount: c.sponsorCount,
                  treesPlanted: Math.floor(Number(c.raisedAmount) / 10_000_000 / 10), // Simplified calculation
                  revenueEarned: '0',
                  deadline: c.statusChangedAt,
                })) : []}
                ratings={ratings}
              />
            ) : (
              <div className="bg-white rounded-lg shadow-md p-8 text-center">
                <p className="text-gray-600">No campaigns yet</p>
              </div>
            )}
          </section>

          {/* Call to Action */}
          <section className="mt-12 pb-12 bg-gradient-to-r from-green-500 to-blue-500 rounded-lg shadow-lg p-8 text-white text-center">
            <h3 className="text-2xl font-bold mb-2">Interested in backing these campaigns?</h3>
            <p className="mb-6 opacity-90">
              Explore all active campaigns from this creator and make a positive environmental impact
            </p>
            <a
              href={`/campaigns?creator=${address}`}
              className="inline-block bg-white text-green-600 px-6 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
            >
              View Active Campaigns
            </a>
          </section>
        </div>
      </div>
    );
  } catch (error) {
    console.error('Error loading creator portfolio:', error);
    notFound();
  }
}

function LoadingPortfolio() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 via-white to-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-6xl animate-pulse">
        {/* Header skeleton */}
        <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-lg p-8 mb-8">
          <div className="flex gap-6 items-start">
            <div className="w-32 h-32 rounded-full bg-gray-200"></div>
            <div className="flex-1">
              <div className="h-10 bg-gray-200 rounded w-1/3 mb-4"></div>
              <div className="h-6 bg-gray-200 rounded w-1/4 mb-4"></div>
              <div className="h-20 bg-gray-200 rounded mb-4"></div>
              <div className="flex gap-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-10 bg-gray-200 rounded w-24"></div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Stats skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-gray-200 rounded"></div>
          ))}
        </div>

        {/* Achievements skeleton */}
        <div className="mb-12">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>

        {/* Campaigns skeleton */}
        <div>
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
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

export default async function CreatorPortfolioPage({ params }: CreatorPortfolioPageProps) {
  const { address } = await params;

  if (!address || address.length < 10) {
    notFound();
  }

  return (
    <Suspense fallback={<LoadingPortfolio />}>
      <PortfolioContent address={address} />
    </Suspense>
  );
}
