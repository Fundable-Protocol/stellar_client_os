/**
 * Campaign Sequel Service
 *
 * Lets creators link sequel campaigns or related projects, track campaign
 * franchises/universes, and lets visitors discover the "next in series"
 * for a campaign they are viewing.
 *
 * A sequel graph is a directed set of relations between campaigns:
 *
 *   - SEQUEL  : the target continues the story/objective of the source.
 *   - PREQUEL : the target precedes the source in the same universe.
 *   - SPINOFF : the target reuses the source's world with different actors.
 *   - RELATED : a looser "same universe" reference, no ordering implied.
 *
 * Sequels can optionally belong to a named `CampaignSeries` (franchise)
 * so a whole universe can be browsed as a single group.
 */

import {
  getCampaign,
  getCampaignDataSource,
  type CampaignDataSource,
  type CampaignRecord,
} from "./campaign.service";

export type CampaignSequelRelation = "SEQUEL" | "PREQUEL" | "SPINOFF" | "RELATED";

export const SEQUEL_RELATIONS: readonly CampaignSequelRelation[] = [
  "SEQUEL",
  "PREQUEL",
  "SPINOFF",
  "RELATED",
];

export interface CampaignSequelLink {
  id: string;
  sourceCampaignId: string;
  targetCampaignId: string;
  relation: CampaignSequelRelation;
  /** Ordinal position within a series (1, 2, 3…); only meaningful for SEQUEL/PREQUEL. */
  order?: number;
  seriesId?: string;
  notes?: string;
  linkedBy: string;
  linkedAt: number;
}

export interface CampaignSeries {
  id: string;
  name: string;
  description?: string;
  creator: string;
  campaignIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface CampaignSequelSummary {
  link: CampaignSequelLink;
  campaign: CampaignRecord;
}

export interface NextInSeriesResult {
  link: CampaignSequelLink;
  series?: CampaignSeries;
  campaign: CampaignRecord;
}

export interface CampaignSequelOptions {
  dataSource?: CampaignDataSource;
  /** Use an isolated graph instead of the shared default (ie. for tests). */
  isolated?: boolean;
}

interface SequelGraph {
  links: CampaignSequelLink[];
  series: CampaignSeries[];
}

let defaultGraph: SequelGraph = { links: [], series: [] };

export class CampaignSequelService {
  private readonly graph: SequelGraph;
  private readonly dataSource?: CampaignDataSource;

  constructor(options: CampaignSequelOptions = {}) {
    if (options.isolated) {
      this.graph = { links: [], series: [] };
    } else {
      this.graph = defaultGraph;
    }
    this.dataSource = options.dataSource;
  }

  private async resolveCampaigns(): Promise<CampaignRecord[]> {
    return (this.dataSource ?? getCampaignDataSource()).getCampaigns();
  }

  async getCampaign(campaignId: string): Promise<CampaignRecord | null> {
    return getCampaign(campaignId, this.dataSource ?? getCampaignDataSource());
  }

  async linkCampaigns(input: {
    sourceCampaignId: string;
    targetCampaignId: string;
    relation: CampaignSequelRelation;
    order?: number;
    seriesId?: string;
    notes?: string;
    linkedBy: string;
  }): Promise<CampaignSequelLink> {
    const { sourceCampaignId, targetCampaignId, relation, linkedBy } = input;
    if (!linkedBy?.trim()) throw new Error("linkedBy is required");
    if (sourceCampaignId === targetCampaignId) {
      throw new Error("A campaign cannot be linked to itself");
    }
    if (!SEQUEL_RELATIONS.includes(relation)) {
      throw new Error(`relation must be one of ${SEQUEL_RELATIONS.join(", ")}`);
    }
    const source = await this.getCampaign(sourceCampaignId);
    const target = await this.getCampaign(targetCampaignId);
    if (!source) throw new Error(`Campaign ${sourceCampaignId} not found`);
    if (!target) throw new Error(`Campaign ${targetCampaignId} not found`);

    if (input.seriesId && !this.graph.series.some((series) => series.id === input.seriesId)) {
      throw new Error(`Series ${input.seriesId} not found`);
    }

    this.removeLink(sourceCampaignId, targetCampaignId);

    const link: CampaignSequelLink = {
      id: `seq_${crypto.randomUUID()}`,
      sourceCampaignId,
      targetCampaignId,
      relation,
      order: input.order,
      seriesId: input.seriesId,
      notes: input.notes,
      linkedBy,
      linkedAt: Date.now(),
    };
    this.graph.links.push(link);
    return link;
  }

  async unlinkCampaigns(sourceCampaignId: string, targetCampaignId: string): Promise<boolean> {
    return this.removeLink(sourceCampaignId, targetCampaignId);
  }

  private removeLink(sourceCampaignId: string, targetCampaignId: string): boolean {
    const before = this.graph.links.length;
    this.graph.links = this.graph.links.filter(
      (link) =>
        !(
          link.sourceCampaignId === sourceCampaignId &&
          link.targetCampaignId === targetCampaignId
        ),
    );
    return this.graph.links.length !== before;
  }

  async getSequels(
    campaignId: string,
    options: { includeIncoming?: boolean; relation?: CampaignSequelRelation } = {},
  ): Promise<CampaignSequelSummary[]> {
    const includeIncoming = options.includeIncoming ?? true;
    const links = this.graph.links.filter((link) => {
      const relevant =
        (link.sourceCampaignId === campaignId) ||
        (includeIncoming && link.targetCampaignId === campaignId);
      return relevant && (!options.relation || link.relation === options.relation);
    });
    const campaigns = await this.resolveCampaigns();
    return links
      .map((link) => {
        const otherId =
          link.sourceCampaignId === campaignId
            ? link.targetCampaignId
            : link.sourceCampaignId;
        const campaign = campaigns.find((item) => item.id === otherId);
        return campaign ? { link, campaign } : null;
      })
      .filter((entry): entry is CampaignSequelSummary => entry !== null)
      .sort((a, b) => {
        const orderDiff = (a.link.order ?? 0) - (b.link.order ?? 0);
        return orderDiff || a.link.linkedAt - b.link.linkedAt;
      });
  }

  /**
   * Returns `{ campaign, link, series }` for the campaign that continues
   * the given one inside a series. A campaign is a "first" entry when no
   * outgoing SEQUEL links point to a later entry in its series.
   */
  async getNextInSeries(campaignId: string): Promise<NextInSeriesResult | null> {
    const outgoing = this.graph.links
      .filter((link) => link.sourceCampaignId === campaignId && link.relation === "SEQUEL")
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const candidates = outgoing.length > 0 ? outgoing : this.getFallbackSequence(campaignId);
    if (candidates.length === 0) return null;

    const campaigns = await this.resolveCampaigns();
    const seriesId = candidates[0].seriesId;
    const series = seriesId ? this.graph.series.find((item) => item.id === seriesId) : undefined;

    for (const link of candidates) {
      const campaign = campaigns.find((item) => item.id === link.targetCampaignId);
      if (campaign) return { link, series, campaign };
    }
    return null;
  }

  private getFallbackSequence(campaignId: string): CampaignSequelLink[] {
    return this.graph.links
      .filter((link) => link.targetCampaignId === campaignId && link.relation === "PREQUEL")
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .reverse();
  }

  async getSeries(campaignId: string): Promise<CampaignSeries | null> {
    const seriesId = this.graph.links.find(
      (link) =>
        link.sourceCampaignId === campaignId || link.targetCampaignId === campaignId,
    )?.seriesId;
    return seriesId ? (this.graph.series.find((series) => series.id === seriesId) ?? null) : null;
  }

  async createSeries(input: {
    name: string;
    description?: string;
    creator: string;
    campaignIds?: string[];
  }): Promise<CampaignSeries> {
    if (!input.name?.trim()) throw new Error("Series name is required");
    if (!input.creator?.trim()) throw new Error("Series creator is required");
    if (new Set(input.campaignIds ?? []).size !== (input.campaignIds?.length ?? 0)) {
      throw new Error("Series cannot contain duplicate campaigns");
    }
    const now = Date.now();
    const series: CampaignSeries = {
      id: `series_${crypto.randomUUID()}`,
      name: input.name.trim(),
      description: input.description,
      creator: input.creator,
      campaignIds: input.campaignIds ?? [],
      createdAt: now,
      updatedAt: now,
    };
    this.graph.series.push(series);
    return series;
  }

  async renameSeries(seriesId: string, name: string): Promise<CampaignSeries | null> {
    const series = this.graph.series.find((item) => item.id === seriesId);
    if (!series) return null;
    series.name = name.trim();
    series.updatedAt = Date.now();
    return series;
  }

  async deleteSeries(seriesId: string): Promise<boolean> {
    const before = this.graph.series.length;
    this.graph.series = this.graph.series.filter((series) => series.id !== seriesId);
    this.graph.links.forEach((link) => {
      if (link.seriesId === seriesId) delete link.seriesId;
    });
    return this.graph.series.length !== before;
  }

  async listSeries(): Promise<CampaignSeries[]> {
    return Promise.resolve(
      [...this.graph.series].sort((a, b) => b.updatedAt - a.updatedAt),
    );
  }

  async getFranchise(campaignId: string): Promise<CampaignSeries | null> {
    return this.getSeries(campaignId);
  }

  async getCampaignSeries(): Promise<CampaignSeries[]> {
    return this.listSeries();
  }
}

let defaultService: CampaignSequelService | null = null;

export function getCampaignSequelService(dataSource?: CampaignDataSource): CampaignSequelService {
  if (dataSource) return new CampaignSequelService({ dataSource });
  if (!defaultService) defaultService = new CampaignSequelService();
  return defaultService;
}

export function resetCampaignSequelService(seed?: Pick<SequelGraph, "links" | "series">): void {
  defaultGraph = seed ? { links: seed.links, series: seed.series } : { links: [], series: [] };
  defaultService = null;
}

export function seedCampaignSeries(series: CampaignSeries[], links: CampaignSequelLink[] = []): void {
  resetCampaignSequelService({ links, series });
}