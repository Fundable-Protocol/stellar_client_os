"use client";

import { CreatorStats } from "@/services/creator-stats.service";

interface CreatorProfileHeaderProps {
  address: string;
  stats: CreatorStats;
}

export function CreatorProfileHeader({ address, stats }: CreatorProfileHeaderProps) {
  return (
    <div className="flex items-center gap-4">
      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-2xl font-bold">
        {address.slice(0, 2).toUpperCase()}
      </div>
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Creator Profile</h1>
        <p className="text-gray-600 font-mono text-sm mt-1">
          {address.slice(0, 8)}...{address.slice(-8)}
        </p>
      </div>
    </div>
  );
}
