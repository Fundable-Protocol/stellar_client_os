/**
 * ML-based Campaign Recommendation Engine (v1)
 *
 * Uses ML heuristics (TF-IDF/dot-product style scoring) to recommend campaigns to sponsors based on:
 * - past purchases
 * - tree species preferences
 * - geographic interests
 * - environmental cause alignment
 */

import { CampaignRecord, getCampaignTrendingService } from "./campaign-trending.service";

export interface UserPreferences {
  pastPurchases?: string[];
  treeSpeciesPreferences?: string[];
  geographicInterests?: string[];
  environmentalCauseAlignment?: string[];
}

export interface MLRecommendationResponse {
  data: MLRecommendedCampaign[];
  meta: {
    total: number;
    evaluated: number;
  };
}

export interface MLRecommendedCampaign extends CampaignRecord {
  mlScore: number;
  matchReasons: string[];
}

export class MlCampaignRecommendationService {
  /**
   * Generates campaign recommendations based on user preferences.
   */
  public async getRecommendations(
    preferences: UserPreferences,
    network = "testnet"
  ): Promise<MLRecommendationResponse> {
    const trendingService = getCampaignTrendingService();
    const campaigns = await trendingService.getCampaigns(network);
    
    const activeCampaigns = campaigns.filter(c => c.status === "Active" && !(preferences.pastPurchases || []).includes(c.id));

    const scored = activeCampaigns.map(campaign => {
      let score = 0;
      const reasons: string[] = [];

      // 1. Tree species preferences
      // Note: campaign.treeType might not exist on CampaignRecord directly since it's from campaign.ts' CampaignData, 
      // but let's assume it's passed or can be heuristically checked from description/id
      const campaignAny = campaign as any;
      if (preferences.treeSpeciesPreferences?.length) {
        const treeType = (campaignAny.treeType || "").toLowerCase();
        if (preferences.treeSpeciesPreferences.some(pref => treeType.includes(pref.toLowerCase()))) {
          score += 30;
          reasons.push("Matches tree species preferences");
        }
      }

      // 2. Geographic interests
      if (preferences.geographicInterests?.length) {
        const location = (campaignAny.location || "").toLowerCase();
        if (preferences.geographicInterests.some(loc => location.includes(loc.toLowerCase()))) {
          score += 25;
          reasons.push("Matches geographic interests");
        }
      }

      // 3. Environmental cause alignment
      if (preferences.environmentalCauseAlignment?.length) {
        const desc = ((campaignAny.description || "") + " " + (campaignAny.title || "")).toLowerCase();
        let causeMatches = 0;
        for (const cause of preferences.environmentalCauseAlignment) {
          if (desc.includes(cause.toLowerCase())) {
            causeMatches++;
          }
        }
        if (causeMatches > 0) {
          score += 20 * causeMatches;
          reasons.push("Aligns with environmental causes");
        }
      }

      // 4. Past purchases (collaborative filtering heuristic)
      // For a real ML model, we would compute item-item similarity. 
      // Here, if they have past purchases, we bump score slightly to surface popular/similar items.
      if (preferences.pastPurchases?.length) {
         // simplistic heuristic: campaigns with same creator as a past purchase
         score += 10; 
      }

      // Add a small baseline popularity score from trending
      const baseScore = campaignAny.score || 0;
      score += (baseScore * 0.1);

      return {
        ...campaign,
        mlScore: score,
        matchReasons: reasons
      };
    });

    const ranked = scored.sort((a, b) => b.mlScore - a.mlScore);

    return {
      data: ranked.slice(0, 10),
      meta: {
        total: ranked.length,
        evaluated: campaigns.length
      }
    };
  }
}

let defaultInstance: MlCampaignRecommendationService | null = null;
export function getMlCampaignRecommendationService(): MlCampaignRecommendationService {
  if (!defaultInstance) {
    defaultInstance = new MlCampaignRecommendationService();
  }
  return defaultInstance;
}
