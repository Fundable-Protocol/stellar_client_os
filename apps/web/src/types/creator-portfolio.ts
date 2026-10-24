/**
 * Creator Portfolio Types
 * 
 * Defines the data models for creator portfolio pages, including
 * bio, social links, achievements, and impact metrics.
 */

export interface SocialLink {
  platform: 'twitter' | 'instagram' | 'facebook' | 'linkedin' | 'website' | 'github';
  username?: string;
  url: string;
}

export interface CreatorAchievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlockedAt: number;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
}

export interface CreatorPortfolioData {
  /** Stellar wallet address */
  creatorAddress: string;
  
  /** Creator display name or username */
  displayName?: string;
  
  /** Creator bio/description */
  bio?: string;
  
  /** Profile image URL */
  profileImageUrl?: string;
  
  /** Creator's website or portfolio URL */
  websiteUrl?: string;
  
  /** Social media links */
  socialLinks: SocialLink[];
  
  /** Achievements/badges earned */
  achievements: CreatorAchievement[];
  
  /** When the profile was created */
  createdAt: number;
  
  /** Last updated timestamp */
  updatedAt: number;
}

export interface PortfolioStats {
  totalCampaigns: number;
  successfulCampaigns: number;
  successRate: number;
  totalRaisedUsd: string;
  totalBackers: number;
  totalTreesPlanted: number;
  totalCo2OffsetKg: number;
  activeCampaigns: number;
}

export interface CreatorPortfolioProfile extends CreatorPortfolioData {
  stats: PortfolioStats;
}

export interface UpdatePortfolioInput {
  displayName?: string;
  bio?: string;
  profileImageUrl?: string;
  websiteUrl?: string;
  socialLinks?: SocialLink[];
}
