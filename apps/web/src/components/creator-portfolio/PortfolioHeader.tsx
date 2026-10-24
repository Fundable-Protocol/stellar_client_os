'use client';

import Image from 'next/image';
import { CreatorPortfolioProfile } from '@/types/creator-portfolio';
import { SocialLinks } from './SocialLinks';

interface PortfolioHeaderProps {
  profile: CreatorPortfolioProfile;
}

export function PortfolioHeader({ profile }: PortfolioHeaderProps) {
  return (
    <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-lg shadow-md overflow-hidden">
      <div className="px-6 py-8 sm:px-8 sm:py-12">
        <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-center">
          {/* Profile Image */}
          <div className="flex-shrink-0">
            <div className="relative w-24 h-24 sm:w-32 sm:h-32 rounded-full overflow-hidden border-4 border-white shadow-lg">
              <Image
                src={profile.profileImageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile.creatorAddress}`}
                alt={profile.displayName || profile.creatorAddress}
                fill
                className="object-cover"
              />
            </div>
          </div>

          {/* Creator Info */}
          <div className="flex-1">
            <div className="mb-4">
              <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">
                {profile.displayName || profile.creatorAddress.slice(0, 8)}
              </h1>
              <p className="text-sm text-gray-600 mt-1 font-mono">
                {profile.creatorAddress}
              </p>
            </div>

            {/* Bio */}
            {profile.bio && (
              <p className="text-gray-700 text-lg mb-4 max-w-2xl leading-relaxed">
                {profile.bio}
              </p>
            )}

            {/* Social Links */}
            {profile.socialLinks.length > 0 && (
              <SocialLinks links={profile.socialLinks} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
