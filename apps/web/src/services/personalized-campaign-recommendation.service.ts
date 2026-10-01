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
  species?: readonly string[];
  geographicInterests?: readonly string[];
  environmentalCauses?: readonly string[];
}
export interface PersonalizedRecommendationComponents {
  backingHistory: number;
  followedCreator: number;
  collaboratorInterest: number;
  speciesPreference: number;
  geographicInterest: number;
  environmentalCause: number;
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

function normalizedTokens(values: readonly string[] | undefined): Set<string> {
  return new Set(
    (values ?? [])
      .flatMap((value) => value.toLowerCase().split(/[,;/|]/))
      .map((value) => value.trim())
      .filter(Boolean)
  );
}

function overlapScore(preferences: Set<string>, values: readonly string[] | undefined): number {
  const candidate = normalizedTokens(values);
  if (preferences.size === 0 || candidate.size === 0) return 0;
  let matches = 0;
  for (const value of candidate) if (preferences.has(value)) matches += 1;
  return matches / Math.max(preferences.size, candidate.size);
}

function locationScore(preferences: Set<string>, location: string | undefined): number {
  if (preferences.size === 0 || !location?.trim()) return 0;
  const candidate = location.toLowerCase();
  for (const preference of preferences) {
    if (candidate.includes(preference) || preference.includes(candidate)) return 1;
  }
  return 0;
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
    const preferredSpecies = normalizedTokens(options.species);
    const preferredLocations = normalizedTokens(options.geographicInterests);
    const preferredCauses = normalizedTokens(options.environmentalCauses);
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
        const historicalSimilarity = backed.length === 0
          ? 0
          : backed.reduce((total, historical) => total + calculateCampaignSimilarity(historical, campaign).score / 100, 0) / backed.length;
        const speciesPreference = preferredSpecies.size > 0
          ? overlapScore(preferredSpecies, campaign.species)
          : backed.reduce((total, historical) => total + overlapScore(normalizedTokens(historical.species), campaign.species), 0) / Math.max(backed.length, 1);
        const geographicInterest = preferredLocations.size > 0
          ? locationScore(preferredLocations, campaign.location)
          : backed.reduce((total, historical) => total + locationScore(normalizedTokens([historical.location ?? ""]), campaign.location), 0) / Math.max(backed.length, 1);
        const environmentalCause = preferredCauses.size > 0
          ? overlapScore(preferredCauses, campaign.environmentalCauses)
          : backed.reduce((total, historical) => total + overlapScore(normalizedTokens(historical.environmentalCauses), campaign.environmentalCauses), 0) / Math.max(backed.length, 1);
        const components: PersonalizedRecommendationComponents = {
          backingHistory: historicalSimilarity,
          followedCreator: followedCreators.has(normalizeAddress(campaign.creator)) ? 1 : 0,
          collaboratorInterest: candidateBackers.size === 0 ? 0 : sharedBackers / candidateBackers.size,
          speciesPreference,
          geographicInterest,
          environmentalCause,
        };
        const collaborativeScore = components.backingHistory * 0.5 + components.followedCreator * 0.3 + components.collaboratorInterest * 0.2;
        const contentScore = components.speciesPreference * 0.4 + components.geographicInterest * 0.3 + components.environmentalCause * 0.3;
        const score = Number((collaborativeScore * 0.6 + contentScore * 0.4).toFixed(2));
        const reasons = [
          ...(components.backingHistory >= 0.5 ? ["Matches your backing history"] : []),
          ...(components.followedCreator === 1 ? ["Created by someone you follow"] : []),
          ...(components.collaboratorInterest > 0 ? ["Backed by people with similar interests"] : []),
          ...(components.speciesPreference > 0 ? ["Matches your preferred tree species"] : []),
          ...(components.geographicInterest > 0 ? ["Matches your geographic interests"] : []),
          ...(components.environmentalCause > 0 ? ["Aligns with your environmental causes"] : []),
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
