import { calculateCo2Offset } from "@/lib/co2-impact";
import { getCampaign, type CampaignRecord } from "./campaign.service";

export interface CampaignImpactSnapshot {
  campaignId: string;
  asOf: string;
  asOfMs: number;
  treeCount: number;
  co2SequestrationKg: number;
  sponsorCount: number;
  interpolated: boolean;
}

interface RecordedSnapshot {
  at: number;
  treeCount: number;
  sponsorCount: number;
  co2SequestrationKg?: number;
}

const snapshots = new Map<string, RecordedSnapshot[]>();

const DEMO_CAMPAIGN: Pick<CampaignRecord, "id" | "createdAt" | "treeCount" | "sponsorCount" | "name"> = {
  id: "camp-101",
  name: "Save the Amazon RainForest Reserve",
  createdAt: Date.parse("2026-08-01T00:00:00.000Z"),
  treeCount: 1_500,
  sponsorCount: 6,
};

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function toIsoDate(ms: number): string {
  return new Date(ms).toISOString();
}

function parseAsOf(raw: string | number | undefined, now = Date.now()): number {
  if (raw === undefined || raw === null || raw === "") return now;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const asNumber = Number(raw);
  if (Number.isFinite(asNumber) && String(raw).trim() !== "" && !String(raw).includes("-")) {
    return asNumber < 1e12 ? asNumber * 1000 : asNumber;
  }
  const parsed = Date.parse(String(raw));
  if (Number.isNaN(parsed)) throw new Error("date must be an ISO date or unix timestamp");
  return parsed;
}

function interpolateCount(current: number, progress: number): number {
  return Math.max(0, Math.round(current * progress));
}

function demoOrCampaign(campaignId: string, campaign: CampaignRecord | null) {
  if (campaign) return campaign;
  if (campaignId === "camp-101" || campaignId === "demo") return DEMO_CAMPAIGN;
  return null;
}

/**
 * Query campaign impact (trees, CO2, sponsors) as of any date in history (#970).
 *
 * Uses recorded snapshots when present; otherwise linearly interpolates from
 * campaign creation to the current totals.
 */
export async function getCampaignImpactAt(
  campaignId: string,
  date?: string | number,
  now = Date.now(),
): Promise<CampaignImpactSnapshot | null> {
  const asOfMs = parseAsOf(date, now);
  const campaign = demoOrCampaign(campaignId, await getCampaign(campaignId));
  if (!campaign) return null;

  const recorded = (snapshots.get(campaignId) ?? [])
    .filter((entry) => entry.at <= asOfMs)
    .sort((a, b) => b.at - a.at)[0];

  if (recorded) {
    const treeCount = recorded.treeCount;
    return {
      campaignId,
      asOf: toIsoDate(asOfMs),
      asOfMs,
      treeCount,
      co2SequestrationKg: recorded.co2SequestrationKg ?? calculateCo2Offset("oak", treeCount).co2PerYearKg,
      sponsorCount: recorded.sponsorCount,
      interpolated: false,
    };
  }

  const createdAt = campaign.createdAt || asOfMs;
  const elapsed = now - createdAt;
  const progress = elapsed <= 0 ? (asOfMs >= createdAt ? 1 : 0) : clamp01((asOfMs - createdAt) / elapsed);
  const treeCount = interpolateCount(campaign.treeCount, progress);
  const sponsorCount = interpolateCount(campaign.sponsorCount, progress);

  return {
    campaignId,
    asOf: toIsoDate(asOfMs),
    asOfMs,
    treeCount,
    co2SequestrationKg: calculateCo2Offset("oak", treeCount).co2PerYearKg,
    sponsorCount,
    interpolated: asOfMs < now,
  };
}

export async function recordCampaignImpactSnapshot(
  campaignId: string,
  input: { treeCount: number; sponsorCount: number; co2SequestrationKg?: number; at?: number },
): Promise<CampaignImpactSnapshot | null> {
  const campaign = demoOrCampaign(campaignId, await getCampaign(campaignId));
  if (!campaign) return null;
  if (!Number.isFinite(input.treeCount) || input.treeCount < 0) {
    throw new Error("treeCount must be a non-negative number");
  }
  if (!Number.isFinite(input.sponsorCount) || input.sponsorCount < 0) {
    throw new Error("sponsorCount must be a non-negative number");
  }

  const at = input.at ?? Date.now();
  const entry: RecordedSnapshot = {
    at,
    treeCount: Math.floor(input.treeCount),
    sponsorCount: Math.floor(input.sponsorCount),
    co2SequestrationKg: input.co2SequestrationKg,
  };
  const list = snapshots.get(campaignId) ?? [];
  list.push(entry);
  snapshots.set(campaignId, list);
  return getCampaignImpactAt(campaignId, at);
}

export function clearCampaignImpactSnapshots(campaignId?: string): void {
  if (campaignId) snapshots.delete(campaignId);
  else snapshots.clear();
}
