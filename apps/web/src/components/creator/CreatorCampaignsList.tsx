"use client";

import Link from "next/link";
import { CampaignCreatorSummary } from "@/services/creator-stats.service";

interface CreatorCampaignsListProps {
  campaigns: CampaignCreatorSummary[];
}

interface CampaignCardProps {
  campaign: CampaignCreatorSummary;
}

function CampaignCard({ campaign }: CampaignCardProps) {
  const statusColors: Record<string, string> = {
    Active: "bg-green-100 text-green-800",
    Successful: "bg-blue-100 text-blue-800",
    Claimed: "bg-purple-100 text-purple-800",
    Completed: "bg-indigo-100 text-indigo-800",
    Failed: "bg-red-100 text-red-800",
    Draft: "bg-gray-100 text-gray-800",
  };

  const statusColor = statusColors[campaign.status] || "bg-gray-100 text-gray-800";
  const raisedAmount = Number(campaign.totalRaised) / 10_000_000;
  const targetAmount = Number(campaign.targetAmount) / 10_000_000;
  const progressPercentage = targetAmount > 0 ? Math.min((raisedAmount / targetAmount) * 100, 100) : 0;

  return (
    <Link href={`/campaigns/${campaign.id}`}>
      <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow border border-gray-200 cursor-pointer">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h3 className="text-lg font-semibold text-gray-900">Campaign #{campaign.id.slice(0, 8)}</h3>
              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusColor}`}>
                {campaign.status}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <p className="text-sm text-gray-600">Trees Planted</p>
            <p className="text-xl font-bold text-green-600">🌳 {campaign.treesPlanted.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Sponsors</p>
            <p className="text-xl font-bold text-purple-600">👥 {campaign.sponsorsCount}</p>
          </div>
        </div>

        <div className="mb-4">
          <div className="flex justify-between text-sm text-gray-600 mb-1">
            <span>Funding Progress</span>
            <span>{progressPercentage.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div
              className="bg-gradient-to-r from-purple-500 to-pink-500 h-2.5 rounded-full transition-all"
              style={{ width: `${progressPercentage}%` }}
            ></div>
          </div>
          <div className="flex justify-between text-sm mt-1">
            <span className="text-gray-600">Raised: ${raisedAmount.toLocaleString()}</span>
            <span className="text-gray-600">Goal: ${targetAmount.toLocaleString()}</span>
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-gray-200">
          <div>
            <p className="text-sm text-gray-600">Revenue Earned</p>
            <p className="text-lg font-semibold text-gray-900">
              ${(Number(campaign.revenueEarned) / 10_000_000).toLocaleString()}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-600">Deadline</p>
            <p className="text-sm font-medium text-gray-900">
              {new Date(campaign.deadline).toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}

export function CreatorCampaignsList({ campaigns }: CreatorCampaignsListProps) {
  if (campaigns.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-12 text-center">
        <p className="text-gray-500 text-lg">No campaigns created yet</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {campaigns.map((campaign) => (
        <CampaignCard key={campaign.id} campaign={campaign} />
      ))}
    </div>
  );
}
