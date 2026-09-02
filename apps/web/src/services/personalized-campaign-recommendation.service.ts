/** Explainable personalized campaign recommendations (issue #779). */
import { calculateCampaignSimilarity } from "./campaign-recommendation.service";
import { getCampaignTrendingService, type CampaignDataSource, type CampaignRecord } from "./campaign-trending.service";

const ACTIVE_STATUS = "Active";
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

export interface PersonalizedRecommendationOptions {
  network?: string;
  limit?: number;
  includeNonActive?: boolean;
  followedCreators?: readonly string[];
}
export interface PersonalizedRecommendationComponents {
  backingHistory: number;
  followedCreator: number;
  collaboratorInterest: number;
}
export interface PersonalizedCampaignRecommendation extends CampaignRecord {
  score: number;
  rank: number;
  components: PersonalizedRecommendationComponents;
  reasons: string[];
}
export interface PersonalizedRecommendationResponse {
  data: PersonalizedCampaignRecommendation[];
  meta: { address: string; total: number; evaluated: number; backedCampaigns: number; followedCreators: number; coldStart: boolean; limit: number; network: string };
}
export interface PersonalizedCampaignRecommendationServiceOptions { dataSource?: CampaignDataSource; }

function normalizeAddress(value: string): string { return value.trim().toUpperCase(); }
function contributionBackers(campaign: CampaignRecord): Set<string> {
  return new Set((campaign.contributions ?? []).map((entry) => normalizeAddress(entry.contributor)));
}
function clampLimit(value: number | undefined): number {
  const requested = Number(value ?? DEFAULT_LIMIT);
  return Number.isFinite(requested) ? Math.min(MAX_LIMIT, Math.max(1, Math.trunc(requested))) : DEFAULT_LIMIT;
}
function raisedAmount(campaign: CampaignRecord): number {
  const amount = Number(campaign.totalRaised);
  return Number.isFinite(amount) && amount >= 0 ? amount : 0;
}

/**
 * Scores candidates using backing affinity (50%), follows (30%), and co-backer
 * overlap (20%). Returned components and reasons make every rank inspectable.
 */
export class PersonalizedCampaignRecommendationService {
  constructor(private readonly dataSource?: CampaignDataSource) {}
  private async getCampaigns(network: string): Promise<CampaignRecord[]> {
    if (this.dataSource) return this.dataSource.getCampaigns(network);
    return getCampaignTrendingService().getCampaigns(network);
  }
  async getRecommendations(address: string, options: PersonalizedRecommendationOptions = {}): Promise<PersonalizedRecommendationResponse> {
    const normalizedAddress = normalizeAddress(address);
    if (!normalizedAddress) throw new Error("User address is required");
    const network = options.network ?? "testnet";
    const campaigns = await this.getCampaigns(network);
    const followedCreators = new Set((options.followedCreators ?? []).map(normalizeAddress).filter(Boolean));
    const backed = campaigns.filter((campaign) => contributionBackers(campaign).has(normalizedAddress));
    const backedIds = new Set(backed.map((campaign) => campaign.id));
    const coBackers = new Set<string>();
    for (const campaign of backed) for (const backer of contributionBackers(campaign)) if (backer !== normalizedAddress) coBackers.add(backer);
    const coldStart = backed.length === 0 && followedCreators.size === 0;
    const ranked = campaigns
      .filter((campaign) => !backedIds.has(campaign.id) && (options.includeNonActive || campaign.status === ACTIVE_STATUS))
      .map((campaign) => {
        const candidateBackers = contributionBackers(campaign);
        const sharedBackers = [...candidateBackers].filter((backer) => coBackers.has(backer)).length;
        const components: PersonalizedRecommendationComponents = {
          backingHistory: backed.length === 0 ? 0 : backed.reduce((total, historical) => total + calculateCampaignSimilarity(historical, campaign).score / 100, 0) / backed.length,
          followedCreator: followedCreators.has(normalizeAddress(campaign.creator)) ? 1 : 0,
          collaboratorInterest: candidateBackers.size === 0 ? 0 : sharedBackers / candidateBackers.size,
        };
        const score = Number((components.backingHistory * 0.5 + components.followedCreator * 0.3 + components.collaboratorInterest * 0.2).toFixed(2));
        const reasons = [
          ...(components.backingHistory >= 0.5 ? ["Matches your backing history"] : []),
          ...(components.followedCreator === 1 ? ["Created by someone you follow"] : []),
          ...(components.collaboratorInterest > 0 ? ["Backed by people with similar interests"] : []),
          ...(coldStart ? ["Popular active campaign"] : []),
        ];
        return { ...campaign, score, rank: 0, components, reasons };
      })
      .sort((left, right) => right.score - left.score || raisedAmount(right) - raisedAmount(left) || left.id.localeCompare(right.id));
    ranked.forEach((campaign, index) => { campaign.rank = index + 1; });
    const limit = clampLimit(options.limit);
    return { data: ranked.slice(0, limit), meta: { address: normalizedAddress, total: ranked.length, evaluated: campaigns.length, backedCampaigns: backed.length, followedCreators: followedCreators.size, coldStart, limit, network } };
  }
}
let defaultService: PersonalizedCampaignRecommendationService | null = null;
export function getPersonalizedCampaignRecommendationService(dataSource?: CampaignDataSource): PersonalizedCampaignRecommendationService {
  if (dataSource) return new PersonalizedCampaignRecommendationService(dataSource);
  if (!defaultService) defaultService = new PersonalizedCampaignRecommendationService();
  return defaultService;
}