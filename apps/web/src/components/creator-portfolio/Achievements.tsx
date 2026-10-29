'use client';

import { CreatorAchievement } from '@/types/creator-portfolio';

interface AchievementsProps {
  achievements: CreatorAchievement[];
}

const RARITY_COLORS: Record<CreatorAchievement['rarity'], string> = {
  common: 'bg-gray-100 border-gray-300 text-gray-700',
  rare: 'bg-blue-100 border-blue-300 text-blue-700',
  epic: 'bg-purple-100 border-purple-300 text-purple-700',
  legendary: 'bg-yellow-100 border-yellow-300 text-yellow-700',
};

const RARITY_LABELS: Record<CreatorAchievement['rarity'], string> = {
  common: 'Common',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
};

export function Achievements({ achievements }: AchievementsProps) {
  if (achievements.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-8 text-center">
        <p className="text-gray-600">No achievements unlocked yet</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {achievements.map((achievement) => (
        <div
          key={achievement.id}
          className={`rounded-lg border-2 p-4 transition-transform hover:scale-105 ${RARITY_COLORS[achievement.rarity]}`}
        >
          <div className="flex items-start gap-3">
            <span className="text-4xl">{achievement.icon}</span>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-lg">{achievement.name}</h3>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white bg-opacity-60">
                  {RARITY_LABELS[achievement.rarity]}
                </span>
              </div>
              <p className="text-sm mt-1">{achievement.description}</p>
              <p className="text-xs opacity-75 mt-2">
                Unlocked {new Date(achievement.unlockedAt).toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
