import type { CampaignDataSource, CampaignRecord } from "./campaign.service";

export interface CampaignSearchQuery {
  query: string;
  location?: string;
  species?: string;
  creator?: string;
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

function tokens(value: string | undefined): string[] {
  return (value ?? "").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

function documentTokens(campaign: CampaignRecord): string[] {
  return tokens([
    campaign.name,
    campaign.description,
    campaign.location,
    campaign.creator,
    ...(campaign.species ?? []),
  ].join(" "));
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
    const species = query.species?.trim().toLowerCase();
    const creator = query.creator?.trim().toLowerCase();
    const campaigns = await this.source.getCampaigns();

    return campaigns
      .filter((campaign) => {
        if (location && !(campaign.location ?? "").toLowerCase().includes(location)) return false;
        if (species && !(campaign.species ?? []).some((item) => item.toLowerCase().includes(species))) return false;
        if (creator && !campaign.creator.toLowerCase().includes(creator)) return false;
        const words = documentTokens(campaign);
        return requested.every((term) => words.some((word) => word.includes(term)));
      })
      .map((campaign) => {
        const text = documentTokens(campaign).join(" ");
        const matched = requested.filter((term) => text.includes(term));
        const highlights = [campaign.name, campaign.location, ...(campaign.species ?? [])].filter(Boolean).filter((value) =>
          requested.some((term) => value.toLowerCase().includes(term)),
        );
        return { campaign, score: matched.length / Math.max(requested.length, 1), highlights };
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
        query: { multi_match: { query: query.query, fields: ["name^3", "description", "location^2", "species", "creator"] } },
        size: Math.min(Math.max(query.limit ?? 20, 1), 100),
        from: Math.max(query.offset ?? 0, 0),
      }),
    });
    if (!response.ok) throw new Error(`Campaign search unavailable (${response.status})`);
    const payload = await response.json() as { hits?: { hits?: Array<{ _score?: number; _source: CampaignRecord }> } };
    return (payload.hits?.hits ?? []).map((hit) => ({ campaign: hit._source, score: hit._score ?? 0, highlights: [] }));
  }
}
