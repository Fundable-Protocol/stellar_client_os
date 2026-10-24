'use client';

import { PortfolioStats as PortfolioStatsType } from '@/types/creator-portfolio';

interface PortfolioStatsProps {
  stats: PortfolioStatsType;
}

interface StatCardProps {
  label: string;
  value: string | number;
  icon: string;
  description?: string;
}

function StatCard({ label, value, icon, description }: StatCardProps) {
  return (
    <div className="bg-white rounded-lg shadow-md p-6 border border-gray-100 hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-gray-600 text-sm font-medium">{label}</p>
          <p className="text-2xl sm:text-3xl font-bold text-gray-900 mt-2">
            {value}
          </p>
          {description && (
            <p className="text-xs text-gray-500 mt-1">{description}</p>
          )}
        </div>
        <span className="text-3xl">{icon}</span>
      </div>
    </div>
  );
}

export function PortfolioStats({ stats }: PortfolioStatsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-8">
      <StatCard
        label="Total Campaigns"
        value={stats.totalCampaigns}
        icon="📋"
        description={`${stats.successfulCampaigns} successful`}
      />
      <StatCard
        label="Success Rate"
        value={`${stats.successRate.toFixed(1)}%`}
        icon="🎯"
        description={`${stats.activeCampaigns} active`}
      />
      <StatCard
        label="Total Raised"
        value={stats.totalRaisedUsd}
        icon="💰"
        description={`${stats.totalBackers.toLocaleString()} backers`}
      />
      <StatCard
        label="Environmental Impact"
        value={`${stats.totalTreesPlanted.toLocaleString()} 🌳`}
        icon="♻️"
        description={`${stats.totalCo2OffsetKg.toLocaleString()} kg CO₂ offset/yr`}
      />
    </div>
  );
}
