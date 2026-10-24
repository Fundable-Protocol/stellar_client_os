import type { CampaignDataSource, CampaignRecord } from "./campaign.service";

export interface CampaignSearchQuery {
  query: string;
  location?: string;
  /** Campaign category; matched case-insensitively against `CampaignRecord.category`. */
  category?: string;
  /** Inclusive lower bound for the funding goal, as a non-negative integer string. */
  minGoalAmount?: string;
  /** Inclusive upper bound for the funding goal, as a non-negative integer string. */
  maxGoalAmount?: string;
  /** Only return campaigns whose funding window closes within this many days. */
  maxDaysRemaining?: number;
  species?: string;
  creator?: string;
  categories?: string[];
  tags?: string[];
  limit?: number;
  offset?: number;
}

export interface CampaignSearchResult {
  campaign: CampaignRecord;
  score: number;
  highlights: string[];
}

export interface CampaignSearchProvider {
  search(query: CampaignSearchQuery): Promise<CampaignSearchResult[]>;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Field weights for relevance ranking: a title match outranks a tag match,
 * which outranks a description match, so the most relevant campaigns surface
 * first when a term appears in several fields.
 */
const FIELD_WEIGHTS = { name: 3, tags: 2, description: 1 } as const;
const MAX_FIELD_WEIGHT = FIELD_WEIGHTS.name;

function tokens(value: string | undefined): string[] {
  return (value ?? "").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** Search tags plus the single impact-reporting species and tree species labels. */
function speciesValues(campaign: CampaignRecord): string[] {
  return [...(campaign.speciesTags ?? []), campaign.species, campaign.treeSpecies].filter(
    (value): value is string => Boolean(value),
  );
}

/** Free-form tags indexed for full-text search (title and description are handled separately). */
function tagValues(campaign: CampaignRecord): string[] {
  return [
    ...(campaign.speciesTags ?? []),
    ...(campaign.underrepresentedTags ?? []),
    ...(campaign.countries ?? []),
    campaign.category,
    campaign.region,
    campaign.treeSpecies,
    campaign.species,
    campaign.location,
  ].filter((value): value is string => Boolean(value));
}

interface CampaignFieldTokens {
  name: string[];
  tags: string[];
  description: string[];
}

function fieldTokens(campaign: CampaignRecord): CampaignFieldTokens {
  return {
    name: tokens(campaign.name),
    tags: tokens(tagValues(campaign).join(" ")),
    description: tokens(campaign.description),
  };
}

/** Full-text document: title, description, and tags. */
function documentTokens(campaign: CampaignRecord): string[] {
  const fields = fieldTokens(campaign);
  return [...fields.name, ...fields.description, ...fields.tags];
}

function parseAmount(value: string | undefined): bigint | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return /^\d+$/.test(trimmed) ? BigInt(trimmed) : null;
}

function goalAmountOf(campaign: CampaignRecord): bigint {
  return parseAmount(campaign.goalAmount) ?? 0n;
}

function raisedAmountOf(campaign: CampaignRecord): bigint {
  return parseAmount(campaign.raisedAmount) ?? 0n;
}

/** Days until the campaign's funding window closes, or `undefined` when it has no duration. */
export function campaignDaysRemaining(campaign: CampaignRecord, now = Date.now()): number | undefined {
  if (campaign.durationMs === undefined || !Number.isFinite(campaign.durationMs)) return undefined;
  const deadline = campaign.createdAt + campaign.durationMs;
  return (deadline - now) / MS_PER_DAY;
}

/** Bidirectional substring match so slug values ("environmental") and labels match. */
function matchesCategory(campaign: CampaignRecord, category: string): boolean {
  const value = (campaign.category ?? "").trim().toLowerCase();
  if (!value) return false;
  const needle = category.trim().toLowerCase();
  return value.includes(needle) || needle.includes(value);
}

/**
 * Popular campaigns used for search empty states: highest sponsor count, then
 * largest amount raised, then most recently updated.
 */
export function popularCampaigns(campaigns: CampaignRecord[], limit = 5): CampaignRecord[] {
  return [...campaigns]
    .sort((a, b) => {
      const sponsors = (b.sponsorCount ?? 0) - (a.sponsorCount ?? 0);
      if (sponsors !== 0) return sponsors;
      const raisedA = raisedAmountOf(a);
      const raisedB = raisedAmountOf(b);
      if (raisedA !== raisedB) return raisedA < raisedB ? 1 : -1;
      return b.updatedAt - a.updatedAt;
    })
    .slice(0, Math.max(limit, 0));
}

/**
 * Search adapter used in development and tests. Its scoring/tokenization
 * mirrors the Elasticsearch integration contract, so production can swap in
 * an Elasticsearch provider without changing the API or UI.
 */
export class InMemoryCampaignSearchProvider implements CampaignSearchProvider {
  constructor(private readonly source: CampaignDataSource) {}

  async search(query: CampaignSearchQuery): Promise<CampaignSearchResult[]> {
    const requested = tokens(query.query);
    const location = query.location?.trim().toLowerCase();
    const category = query.category?.trim();
    const species = query.species?.trim().toLowerCase();
    const creator = query.creator?.trim().toLowerCase();
    const categories = (query.categories ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean);
    const tags = (query.tags ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean);
    const campaigns = await this.source.getCampaigns();
    const now = Date.now();

    return campaigns
      .filter((campaign) => {
        if (location && !(campaign.location ?? "").toLowerCase().includes(location)) return false;
        if (category && !matchesCategory(campaign, category)) return false;
        if (species && !speciesValues(campaign).some((item) => item.toLowerCase().includes(species))) return false;
        if (creator && !campaign.creator.toLowerCase().includes(creator)) return false;
        if (categories.length > 0 && !categories.includes((campaign.category ?? "").toLowerCase())) return false;
        if (tags.length > 0) {
          const campaignTags = (campaign.tags ?? []).map((tag) => tag.toLowerCase());
          if (!tags.some((tag) => campaignTags.includes(tag))) return false;
        }
        const words = documentTokens(campaign);
        return requested.every((term) => words.some((word) => word.includes(term)));
      })
      .map((campaign) => {
        const fields = fieldTokens(campaign);
        const matchedWeight = requested.reduce((total, term) => {
          let weight = 0;
          if (fields.name.some((word) => word.includes(term))) weight = Math.max(weight, FIELD_WEIGHTS.name);
          if (fields.tags.some((word) => word.includes(term))) weight = Math.max(weight, FIELD_WEIGHTS.tags);
          if (fields.description.some((word) => word.includes(term))) weight = Math.max(weight, FIELD_WEIGHTS.description);
          return total + weight;
        }, 0);
        const score = matchedWeight / Math.max(requested.length * MAX_FIELD_WEIGHT, 1);
        const highlightCandidates = [campaign.name, campaign.location, campaign.category, ...tagValues(campaign)].filter(
          (value): value is string => Boolean(value),
        );
        const highlights = Array.from(new Set(highlightCandidates)).filter((value) =>
          requested.some((term) => value.toLowerCase().includes(term)),
        );
        return { campaign, score, highlights };
      })
      .sort((a, b) => b.score - a.score || b.campaign.updatedAt - a.campaign.updatedAt)
      .slice(Math.max(query.offset ?? 0, 0), Math.max(query.offset ?? 0, 0) + Math.min(Math.max(query.limit ?? 20, 1), 100));
  }
}

/** Elasticsearch-compatible HTTP adapter for deployments with an index. */
export class ElasticsearchCampaignSearchProvider implements CampaignSearchProvider {
  constructor(private readonly endpoint: string, private readonly fetcher: typeof fetch = fetch) {}

  async search(query: CampaignSearchQuery): Promise<CampaignSearchResult[]> {
    const response = await this.fetcher(`${this.endpoint.replace(/\/$/, "")}/campaigns/_search`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: {
          bool: {
            must: [
              { multi_match: { query: query.query, fields: ["name^3", "description", "location^2", "category^2", "tags", "speciesTags", "species", "treeSpecies", "creator"] } },
            ],
            filter: [
              ...(query.categories && query.categories.length > 0 ? [{ terms: { category: query.categories } }] : []),
              ...(query.tags && query.tags.length > 0 ? [{ terms: { tags: query.tags } }] : []),
            ],
          },
        },
        size: Math.min(Math.max(query.limit ?? 20, 1), 100),
        from: Math.max(query.offset ?? 0, 0),
      }),
    });
    if (!response.ok) throw new Error(`Campaign search unavailable (${response.status})`);
    const payload = await response.json() as { hits?: { hits?: Array<{ _score?: number; _source: CampaignRecord }> } };
    return (payload.hits?.hits ?? []).map((hit) => ({ campaign: hit._source, score: hit._score ?? 0, highlights: [] }));
  }
}
