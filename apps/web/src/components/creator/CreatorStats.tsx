"use client";

import { CreatorStats as CreatorStatsType } from "@/services/creator-stats.service";

interface CreatorStatsProps {
  stats: CreatorStatsType;
}

interface StatCardProps {
  label: string;
  value: string | number;
  icon: string;
  color: string;
}

function StatCard({ label, value, icon, color }: StatCardProps) {
  return (
    <div className="bg-white rounded-lg shadow-md p-6 border-t-4" style={{ borderTopColor: color }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-gray-600 text-sm font-medium">{label}</span>
        <span className="text-2xl">{icon}</span>
      </div>
      <p className="text-3xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

export function CreatorStats({ stats }: CreatorStatsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <StatCard
        label="Total Campaigns"
        value={stats.totalCampaigns}
        icon="📋"
        color="#8B5CF6"
      />
      <StatCard
        label="Total Trees Planted"
        value={stats.totalTreesPlanted.toLocaleString()}
        icon="🌳"
        color="#10B981"
      />
      <StatCard
        label="Total Sponsors"
        value={stats.totalSponsors.toLocaleString()}
        icon="👥"
        color="#F59E0B"
      />
      <StatCard
        label="CO₂ Sequestered"
        value={`${(stats.totalCo2OffsetKg / 1000).toFixed(2)} tons`}
        icon="🌍"
        color="#3B82F6"
      />
      
      <div className="md:col-span-2 lg:col-span-4 grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
        <StatCard
          label="Total Raised"
          value={stats.totalRaisedUsd}
          icon="💰"
          color="#EC4899"
        />
        <StatCard
          label="Success Rate"
          value={`${stats.successRate}%`}
          icon="📈"
          color="#14B8A6"
        />
        <StatCard
          label="Active Campaigns"
          value={stats.activeCampaigns}
          icon="🚀"
          color="#F97316"
        />
      </div>
    </div>
  );
}
