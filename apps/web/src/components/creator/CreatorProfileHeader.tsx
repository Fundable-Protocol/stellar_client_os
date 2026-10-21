"use client";

import { CreatorStats } from "@/services/creator-stats.service";
import { CreatorLinkedInBadge } from "@/components/creator/LinkedInBadge";

interface CreatorProfileHeaderProps {
  address: string;
  stats: CreatorStats;
}

export function CreatorProfileHeader({ address, stats }: CreatorProfileHeaderProps) {
  return (
    <div className="flex items-start gap-4 flex-wrap">
      {/* Avatar + name column */}
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-2xl font-bold flex-shrink-0">
          {address.slice(0, 2).toUpperCase()}
        </div>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Creator Profile</h1>
          <p className="text-gray-600 font-mono text-sm mt-1">
            {address.slice(0, 8)}...{address.slice(-8)}
          </p>
        </div>
      </div>

      {/* LinkedIn badge — rendered only when the creator has connected their account */}
      <div className="ml-auto max-w-xs w-full sm:w-auto">
        <CreatorLinkedInBadge address={address} maxSkills={5} />
      </div>
    </div>
  );
}
