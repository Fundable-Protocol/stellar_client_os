import {
  analyzeCampaignSentiment,
  type CampaignSentiment,
  type SponsorFeedback,
} from "@/lib/sentiment";

/**
 * Campaign sentiment service (#949).
 *
 * Stores per-campaign sentiment analyses (in-memory data source, same
 * pattern as campaign/batch-verification services) and exposes the
 * low-sentiment outreach list for creator-success workflows.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SentimentRecord {
  campaignId: string;
  sentiment: CampaignSentiment;
  analyzedAt: number;
}

export interface SentimentDataSource {
  getAll(): Promise<SentimentRecord[]>;
  save(record: SentimentRecord): Promise<SentimentRecord>;
}

export class InMemorySentimentDataSource implements SentimentDataSource {
  private records = new Map<string, SentimentRecord>();

  async getAll(): Promise<SentimentRecord[]> {
    return Array.from(this.records.values());
  }

  async save(record: SentimentRecord): Promise<SentimentRecord> {
    this.records.set(record.campaignId, record);
    return record;
  }
}

let defaultDataSource: SentimentDataSource | undefined;

export function getSentimentDataSource(): SentimentDataSource {
  return (defaultDataSource ??= new InMemorySentimentDataSource());
}

export function setSentimentDataSource(dataSource: SentimentDataSource): void {
  defaultDataSource = dataSource;
}

// ── Operations ────────────────────────────────────────────────────────────────

/** Analyze (or re-analyze) a campaign's sponsor feedback and store the result. */
export async function analyzeCampaign(
  campaignId: string,
  feedback: SponsorFeedback[],
  dataSource = getSentimentDataSource(),
  now = Date.now(),
): Promise<SentimentRecord> {
  const sentiment = analyzeCampaignSentiment(campaignId, feedback);
  return dataSource.save({ campaignId, sentiment, analyzedAt: now });
}

export async function getCampaignSentiment(
  campaignId: string,
  dataSource = getSentimentDataSource(),
): Promise<SentimentRecord | null> {
  const all = await dataSource.getAll();
  return all.find((r) => r.campaignId === campaignId) ?? null;
}

/** All campaigns whose sentiment is below the outreach threshold. */
export async function getOutreachList(
  dataSource = getSentimentDataSource(),
): Promise<SentimentRecord[]> {
  const all = await dataSource.getAll();
  return all.filter((r) => r.sentiment.needsOutreach).sort((a, b) => {
    const sa = a.sentiment.averageScore ?? 0;
    const sb = b.sentiment.averageScore ?? 0;
    return sa - sb; // worst first
  });
}

/** Aggregate counts for dashboards. */
export async function getSentimentSummary(
  dataSource = getSentimentDataSource(),
): Promise<{
  campaigns: number;
  withData: number;
  flagged: number;
  labels: { positive: number; neutral: number; negative: number; noData: number };
}> {
  const all = await dataSource.getAll();
  const labels = { positive: 0, neutral: 0, negative: 0, noData: 0 };
  let flagged = 0;

  for (const r of all) {
    labels[r.sentiment.label === "no-data" ? "noData" : r.sentiment.label]++;
    if (r.sentiment.needsOutreach) flagged++;
  }

  return { campaigns: all.length, withData: all.length - labels.noData, flagged, labels };
}
