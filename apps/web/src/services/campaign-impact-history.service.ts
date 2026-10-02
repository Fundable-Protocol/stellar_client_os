/**
 * Campaign Impact History Service
 *
 * Issue #902: feat(api): Campaign impact API - query historical data
 *
 * Provides historical query capabilities for campaign ecological impact over time:
 * - Tree count (cumulative planted / funded)
 * - CO2 sequestration (in tonnes and kg)
 * - Sponsor count (unique contributors over time)
 *
 * Supports querying for any specific date in campaign history, date ranges,
 * and generating historical timeline checkpoints.
 */

import { getCampaign, getCampaignDataSource, type CampaignRecord } from "./campaign.service";
import { CampaignAnalyticsService } from "./campaignAnalytics";

export interface CampaignImpactDataPoint {
  /** ISO date string (YYYY-MM-DD) */
  date: string;
  /** Unix timestamp in seconds */
  timestamp: number;
  /** Number of trees planted/funded as of this date */
  treeCount: number;
  /** Estimated CO2 sequestered in metric tonnes */
  co2SequestrationTonnes: number;
  /** Estimated CO2 sequestered in kilograms */
  co2SequestrationKg: number;
  /** Formatted string of CO2 sequestration in tonnes */
  co2Sequestration: string;
  /** Unique sponsors who contributed on or before this date */
  sponsorCount: number;
  /** Cumulative amount raised as of this date in stroops / base units */
  cumulativeRaised: string;
  /** Percentage of funding goal reached as of this date (0 - 100) */
  fundingProgressPercent: number;
}

export interface CampaignImpactHistoryResult {
  campaignId: string;
  campaignName: string;
  creator: string;
  startDate: string;
  targetAmount: string;
  /** Query parameter date if a specific date was requested */
  queryDate?: string;
  /** The impact metrics for the requested query date, or current if no date specified */
  impactAtDate?: CampaignImpactDataPoint;
  /** Current impact metrics as of today */
  currentImpact: CampaignImpactDataPoint;
  /** Historical timeline data points representing impact progression over time */
  timeline: CampaignImpactDataPoint[];
  /** Summary aggregates */
  summary: {
    totalTrees: number;
    totalCo2Tonnes: number;
    totalSponsors: number;
    totalRaised: string;
  };
}

export interface QueryImpactHistoryOptions {
  /** Query for a specific single date (YYYY-MM-DD or ISO string or unix timestamp) */
  date?: string | number;
  /** Start date filter for timeline */
  startDate?: string;
  /** End date filter for timeline */
  endDate?: string;
  /** Sampling interval for timeline */
  interval?: "day" | "week" | "month" | "year";
}

/** CO2 sequestration rate: standard benchmark 20 kg CO2 / tree / year */
const CO2_KG_PER_TREE_PER_YEAR = 20;

const analyticsService = new CampaignAnalyticsService();

/**
 * Normalizes input date to Unix timestamp (seconds) and ISO date string (YYYY-MM-DD)
 */
function normalizeDateInput(dateInput: string | number): { timestamp: number; dateStr: string } | null {
  let ms: number;
  if (typeof dateInput === "number") {
    // If seconds, convert to ms
    ms = dateInput < 10_000_000_000 ? dateInput * 1000 : dateInput;
  } else {
    const parsed = Date.parse(dateInput);
    if (isNaN(parsed)) return null;
    ms = parsed;
  }
  const dateObj = new Date(ms);
  const dateStr = dateObj.toISOString().split("T")[0];
  const timestamp = Math.floor(ms / 1000);
  return { timestamp, dateStr };
}

/**
 * Calculates impact data point for a campaign at a specific point in time (timestamp in seconds).
 */
export function calculateImpactAtTimestamp(
  campaign: CampaignRecord,
  targetTimestamp: number,
  targetDateStr: string
): CampaignImpactDataPoint {
  const goal = BigInt(campaign.goalAmount || "1");
  const targetMs = targetTimestamp * 1000;

  // Sponsors active on or before targetTimestamp
  const eligibleSponsors = (campaign.sponsors || []).filter(
    (s) => (s.sponsoredAt || campaign.createdAt) <= targetMs
  );

  const uniqueSponsorAddresses = new Set(eligibleSponsors.map((s) => s.address));
  const sponsorCountAtDate = Math.min(
    uniqueSponsorAddresses.size,
    campaign.sponsorCount
  );

  // Cumulative funding raised on or before targetTimestamp
  const raisedBigInt = eligibleSponsors.reduce((acc, s) => {
    try {
      return acc + BigInt(s.amount || "0");
    } catch {
      return acc;
    }
  }, 0n);

  const raisedAtDate = raisedBigInt > 0n ? raisedBigInt.toString() : (
    // If no individual sponsor timestamps, extrapolate proportionally based on campaign age vs target
    targetMs >= campaign.updatedAt ? campaign.raisedAmount : "0"
  );

  const currentRaised = BigInt(campaign.raisedAmount || "0");
  const fundingRatio = currentRaised > 0n
    ? Math.min(Number(BigInt(raisedAtDate)) / Number(currentRaised), 1.0)
    : targetMs >= campaign.createdAt ? 1.0 : 0.0;

  // Progress towards total goal
  const fundingProgressPercent = goal > 0n
    ? Math.min(Number((BigInt(raisedAtDate) * 100n) / goal), 100)
    : 0;

  // Trees planted / verified by target date
  let treeCount = 0;
  if (campaign.verificationEvidence && campaign.verificationEvidence.length > 0) {
    // If verification evidence exists, tally verified trees up to targetMs
    const evidenceTrees = campaign.verificationEvidence
      .filter((ev) => (ev.timestamp || campaign.createdAt) <= targetMs)
      .reduce((sum, ev) => sum + (ev.treesCount || 0), 0);
    
    if (evidenceTrees > 0) {
      treeCount = Math.min(evidenceTrees, campaign.treeCount);
    } else {
      treeCount = Math.round(campaign.treeCount * fundingRatio);
    }
  } else {
    treeCount = Math.round(campaign.treeCount * fundingRatio);
  }

  // Calculate CO2 sequestration
  // If campaign has co2Sequestration declared, scale it by tree progress
  let co2Tonnes = 0;
  if (campaign.co2Sequestration && !isNaN(parseFloat(campaign.co2Sequestration))) {
    const totalDeclaredTonnes = parseFloat(campaign.co2Sequestration);
    co2Tonnes = Math.round(totalDeclaredTonnes * fundingRatio * 100) / 100;
  } else {
    // Standard conversion: 20 kg CO2 / tree / year = 0.02 tonnes / tree / year
    co2Tonnes = Math.round((treeCount * CO2_KG_PER_TREE_PER_YEAR / 1000) * 100) / 100;
  }

  const co2Kg = Math.round(co2Tonnes * 1000);

  return {
    date: targetDateStr,
    timestamp: targetTimestamp,
    treeCount,
    co2SequestrationTonnes: co2Tonnes,
    co2SequestrationKg: co2Kg,
    co2Sequestration: co2Tonnes.toFixed(2),
    sponsorCount: sponsorCountAtDate,
    cumulativeRaised: raisedAtDate,
    fundingProgressPercent,
  };
}

/**
 * Query historical impact data for a campaign.
 * Retrieves tree count, CO2 sequestration, and sponsor count for any date in history,
 * plus timeline data over time.
 */
export async function getCampaignImpactHistory(
  campaignId: string,
  options: QueryImpactHistoryOptions = {},
  dataSource = getCampaignDataSource()
): Promise<CampaignImpactHistoryResult | null> {
  const campaign = await getCampaign(campaignId, dataSource);

  // If campaign is not found in standard store, check mock analytics store
  if (!campaign) {
    const mockData = await analyticsService.getCampaignHistoricalData(campaignId);
    if (!mockData) return null;

    // Convert mock data points to CampaignImpactDataPoints
    const timeline: CampaignImpactDataPoint[] = mockData.dataPoints.map((dp) => ({
      date: dp.date,
      timestamp: dp.timestamp,
      treeCount: dp.cumulativeTrees,
      co2SequestrationTonnes: dp.cumulativeCo2,
      co2SequestrationKg: Math.round(dp.cumulativeCo2 * 1000),
      co2Sequestration: dp.cumulativeCo2.toFixed(2),
      sponsorCount: Math.max(1, Math.round(dp.cumulativeTrees / 15)),
      cumulativeRaised: (dp.cumulativeTrees * 10).toString(),
      fundingProgressPercent: Math.min(100, Math.round((dp.cumulativeTrees / 100000) * 100)),
    }));

    const lastPoint = timeline[timeline.length - 1] || {
      date: new Date().toISOString().split("T")[0],
      timestamp: Math.floor(Date.now() / 1000),
      treeCount: 0,
      co2SequestrationTonnes: 0,
      co2SequestrationKg: 0,
      co2Sequestration: "0.00",
      sponsorCount: 0,
      cumulativeRaised: "0",
      fundingProgressPercent: 0,
    };

    let impactAtDate: CampaignImpactDataPoint | undefined;
    if (options.date) {
      const norm = normalizeDateInput(options.date);
      if (norm) {
        // Find closest point or interpolate
        const exact = timeline.find((p) => p.date === norm.dateStr);
        if (exact) {
          impactAtDate = exact;
        } else {
          // Find latest point before or equal to target timestamp
          const pastPoints = timeline.filter((p) => p.timestamp <= norm.timestamp);
          if (pastPoints.length > 0) {
            impactAtDate = {
              ...pastPoints[pastPoints.length - 1],
              date: norm.dateStr,
              timestamp: norm.timestamp,
            };
          } else {
            impactAtDate = {
              date: norm.dateStr,
              timestamp: norm.timestamp,
              treeCount: 0,
              co2SequestrationTonnes: 0,
              co2SequestrationKg: 0,
              co2Sequestration: "0.00",
              sponsorCount: 0,
              cumulativeRaised: "0",
              fundingProgressPercent: 0,
            };
          }
        }
      }
    }

    return {
      campaignId,
      campaignName: mockData.campaignName,
      creator: "Fundable Forest Foundation",
      startDate: timeline[0]?.date || new Date().toISOString().split("T")[0],
      targetAmount: "1000000",
      queryDate: options.date ? String(options.date) : undefined,
      impactAtDate,
      currentImpact: lastPoint,
      timeline,
      summary: {
        totalTrees: lastPoint.treeCount,
        totalCo2Tonnes: lastPoint.co2SequestrationTonnes,
        totalSponsors: lastPoint.sponsorCount,
        totalRaised: lastPoint.cumulativeRaised,
      },
    };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const nowIso = new Date().toISOString().split("T")[0];
  const startMs = campaign.createdAt || Date.now() - 30 * 24 * 3600 * 1000;
  const startSec = Math.floor(startMs / 1000);
  const startIso = new Date(startMs).toISOString().split("T")[0];

  // Current impact as of now
  const currentImpact = calculateImpactAtTimestamp(campaign, nowSec, nowIso);

  // Build timeline: dates for checkpoints (creation date, sponsor contribution dates, and today)
  const checkpointTimestamps = new Set<number>([startSec, nowSec]);
  for (const sponsor of campaign.sponsors || []) {
    if (sponsor.sponsoredAt) {
      checkpointTimestamps.add(Math.floor(sponsor.sponsoredAt / 1000));
    }
  }
  for (const evidence of campaign.verificationEvidence || []) {
    if (evidence.timestamp) {
      checkpointTimestamps.add(Math.floor(evidence.timestamp / 1000));
    }
  }

  // Sort timestamps ascending
  const sortedTimestamps = Array.from(checkpointTimestamps).sort((a, b) => a - b);
  const timeline: CampaignImpactDataPoint[] = sortedTimestamps.map((ts) => {
    const dStr = new Date(ts * 1000).toISOString().split("T")[0];
    return calculateImpactAtTimestamp(campaign, ts, dStr);
  });

  // Handle specific date query if provided
  let impactAtDate: CampaignImpactDataPoint | undefined;
  if (options.date !== undefined && options.date !== "") {
    const norm = normalizeDateInput(options.date);
    if (norm) {
      impactAtDate = calculateImpactAtTimestamp(campaign, norm.timestamp, norm.dateStr);
    }
  }

  // Filter timeline if startDate or endDate provided
  let filteredTimeline = timeline;
  if (options.startDate) {
    const startNorm = normalizeDateInput(options.startDate);
    if (startNorm) {
      filteredTimeline = filteredTimeline.filter((p) => p.timestamp >= startNorm.timestamp);
    }
  }
  if (options.endDate) {
    const endNorm = normalizeDateInput(options.endDate);
    if (endNorm) {
      filteredTimeline = filteredTimeline.filter((p) => p.timestamp <= endNorm.timestamp);
    }
  }

  return {
    campaignId: campaign.id,
    campaignName: campaign.name,
    creator: campaign.creator,
    startDate: startIso,
    targetAmount: campaign.goalAmount,
    queryDate: options.date ? String(options.date) : undefined,
    impactAtDate,
    currentImpact,
    timeline: filteredTimeline,
    summary: {
      totalTrees: currentImpact.treeCount,
      totalCo2Tonnes: currentImpact.co2SequestrationTonnes,
      totalSponsors: currentImpact.sponsorCount,
      totalRaised: currentImpact.cumulativeRaised,
    },
  };
}
