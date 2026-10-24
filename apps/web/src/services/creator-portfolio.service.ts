/**
 * Creator Portfolio Service
 * 
 * Handles retrieval and management of creator portfolio data, including:
 * - Portfolio profile information (bio, social links, achievements)
 * - Portfolio statistics (campaigns, success rate, impact metrics)
 * - Creator metadata
 */

import { 
  CreatorPortfolioData, 
  CreatorPortfolioProfile, 
  PortfolioStats,
  UpdatePortfolioInput,
  SocialLink,
  CreatorAchievement 
} from '@/types/creator-portfolio';
import { getCreatorStats } from './creator-stats.service';
import { demoCampaigns } from './campaign-trending.service';

/**
 * Mock storage for creator portfolio data (demo purposes).
 * In production, this would be stored in a database.
 */
const portfolioDatabase: Map<string, CreatorPortfolioData> = new Map();

/**
 * Initialize demo portfolio data for common test creators.
 */
function initializeDemoPortfolios() {
  const demoCreators = [
    'GBQT37PPA7P2G7QXMKYGN5FHVMJQ3LTFP5YXGR4SZWWQF2CXJLVHZMY3',
    'GDJVKSMSLRX4DN7KNIDKF7A7TNVR7NMY76WFEJNZGFX73ZQFYH3QLBM7',
    'GCUQNQQ7GIXHTTWVFYH4EEHJWQ2RZVLZ4GJZXFK2WNMJSDWXVHVWDVXX',
  ];

  demoCreators.forEach((creator, index) => {
    if (!portfolioDatabase.has(creator)) {
      portfolioDatabase.set(creator, {
        creatorAddress: creator,
        displayName: `Creator ${index + 1}`,
        bio: `Passionate environmental advocate with a mission to plant trees globally. 
                Experienced in coordinating large-scale reforestation initiatives.`,
        profileImageUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${creator}`,
        websiteUrl: 'https://example.com',
        socialLinks: [
          {
            platform: 'twitter',
            username: `creator${index + 1}`,
            url: `https://twitter.com/creator${index + 1}`
          },
          {
            platform: 'instagram',
            username: `creator_eco${index + 1}`,
            url: `https://instagram.com/creator_eco${index + 1}`
          },
          {
            platform: 'website',
            url: 'https://example.com/creator-portfolio'
          }
        ],
        achievements: generateAchievements(index),
        createdAt: Date.now() - 365 * 24 * 60 * 60 * 1000, // 1 year ago
        updatedAt: Date.now(),
      });
    }
  });
}

/**
 * Generate demo achievements based on creator stats.
 */
function generateAchievements(creatorIndex: number): CreatorAchievement[] {
  const achievements: CreatorAchievement[] = [];
  
  // Unlock achievements based on metrics
  const successRate = 60 + creatorIndex * 15; // 60%, 75%, 90%
  
  if (creatorIndex === 0) {
    achievements.push(
      {
        id: 'first-campaign',
        name: 'First Campaign',
        description: 'Launched your first campaign',
        icon: '🌱',
        unlockedAt: Date.now() - 365 * 24 * 60 * 60 * 1000,
        rarity: 'common'
      },
      {
        id: '100k-raised',
        name: 'Century Club',
        description: 'Raised over $100,000',
        icon: '💰',
        unlockedAt: Date.now() - 180 * 24 * 60 * 60 * 1000,
        rarity: 'rare'
      },
      {
        id: 'impact-leader',
        name: 'Impact Leader',
        description: 'Planted over 10,000 trees',
        icon: '🌳',
        unlockedAt: Date.now() - 90 * 24 * 60 * 60 * 1000,
        rarity: 'epic'
      }
    );
  } else if (creatorIndex === 1) {
    achievements.push(
      {
        id: 'first-campaign',
        name: 'First Campaign',
        description: 'Launched your first campaign',
        icon: '🌱',
        unlockedAt: Date.now() - 200 * 24 * 60 * 60 * 1000,
        rarity: 'common'
      },
      {
        id: '50k-raised',
        name: 'Halfway Hero',
        description: 'Raised over $50,000',
        icon: '🏆',
        unlockedAt: Date.now() - 150 * 24 * 60 * 60 * 1000,
        rarity: 'common'
      }
    );
  } else {
    achievements.push(
      {
        id: 'first-campaign',
        name: 'First Campaign',
        description: 'Launched your first campaign',
        icon: '🌱',
        unlockedAt: Date.now() - 90 * 24 * 60 * 60 * 1000,
        rarity: 'common'
      }
    );
  }
  
  return achievements;
}

/**
 * Get portfolio data for a creator.
 */
export async function getCreatorPortfolio(
  creatorAddress: string
): Promise<CreatorPortfolioData | null> {
  initializeDemoPortfolios();
  
  const normalized = creatorAddress.toLowerCase();
  return portfolioDatabase.get(normalized) || null;
}

/**
 * Get complete portfolio profile with stats.
 */
export async function getCreatorPortfolioProfile(
  creatorAddress: string
): Promise<CreatorPortfolioProfile> {
  initializeDemoPortfolios();
  
  const normalized = creatorAddress.toLowerCase();
  
  // Get or create portfolio data
  let portfolioData = portfolioDatabase.get(normalized);
  if (!portfolioData) {
    portfolioData = {
      creatorAddress: normalized,
      displayName: `Creator ${normalized.slice(0, 8)}`,
      bio: undefined,
      profileImageUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${normalized}`,
      websiteUrl: undefined,
      socialLinks: [],
      achievements: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }
  
  // Get stats
  const campaigns = demoCampaigns();
  const creatorStats = getCreatorStats(normalized, campaigns);
  
  const stats: PortfolioStats = {
    totalCampaigns: creatorStats.totalCampaigns,
    successfulCampaigns: creatorStats.campaigns.filter(
      c => c.status === 'Successful' || c.status === 'Claimed'
    ).length,
    successRate: creatorStats.successRate,
    totalRaisedUsd: creatorStats.totalRaisedUsd,
    totalBackers: creatorStats.totalSponsors,
    totalTreesPlanted: creatorStats.totalTreesPlanted,
    totalCo2OffsetKg: creatorStats.totalCo2OffsetKg,
    activeCampaigns: creatorStats.activeCampaigns,
  };
  
  return {
    ...portfolioData,
    stats,
  };
}

/**
 * Update creator portfolio information.
 * 
 * Note: In production, this would validate the request and store in database.
 * For now, updates are kept in memory during the session.
 */
export async function updateCreatorPortfolio(
  creatorAddress: string,
  input: UpdatePortfolioInput
): Promise<CreatorPortfolioData> {
  initializeDemoPortfolios();
  
  const normalized = creatorAddress.toLowerCase();
  let portfolio = portfolioDatabase.get(normalized);
  
  if (!portfolio) {
    portfolio = {
      creatorAddress: normalized,
      displayName: input.displayName || `Creator ${normalized.slice(0, 8)}`,
      bio: input.bio,
      profileImageUrl: input.profileImageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${normalized}`,
      websiteUrl: input.websiteUrl,
      socialLinks: input.socialLinks || [],
      achievements: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  } else {
    portfolio.displayName = input.displayName ?? portfolio.displayName;
    portfolio.bio = input.bio ?? portfolio.bio;
    portfolio.profileImageUrl = input.profileImageUrl ?? portfolio.profileImageUrl;
    portfolio.websiteUrl = input.websiteUrl ?? portfolio.websiteUrl;
    portfolio.socialLinks = input.socialLinks ?? portfolio.socialLinks;
    portfolio.updatedAt = Date.now();
  }
  
  portfolioDatabase.set(normalized, portfolio);
  return portfolio;
}

/**
 * Get social media links for a creator.
 */
export async function getCreatorSocialLinks(
  creatorAddress: string
): Promise<SocialLink[]> {
  const portfolio = await getCreatorPortfolio(creatorAddress);
  return portfolio?.socialLinks || [];
}

/**
 * Get creator achievements.
 */
export async function getCreatorAchievements(
  creatorAddress: string
): Promise<CreatorAchievement[]> {
  const portfolio = await getCreatorPortfolio(creatorAddress);
  return portfolio?.achievements || [];
}

/**
 * Add an achievement to a creator's portfolio.
 */
export async function addCreatorAchievement(
  creatorAddress: string,
  achievement: CreatorAchievement
): Promise<void> {
  const normalized = creatorAddress.toLowerCase();
  const portfolio = await getCreatorPortfolio(normalized);
  
  if (portfolio) {
    portfolio.achievements.push(achievement);
    portfolio.updatedAt = Date.now();
    portfolioDatabase.set(normalized, portfolio);
  }
}
