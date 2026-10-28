/**
 * Campaign data export — issue #1184
 *
 * Creators can download their campaign data in two formats:
 *
 *   - **CSV** — one row per backer with every field the platform records:
 *     pledged total, pledge count, average pledge, first/last pledge, reward
 *     tier selection, privacy visibility, message, latest transaction and
 *     featured status.
 *   - **PDF** — a branded analytics report with vector charts (funding over
 *     time, reward-tier distribution) plus a summary and backer table.
 *
 * The service reads from the same sources the creator dashboard already uses:
 * the campaign store (`campaign.service`), recorded backer contributions
 * (`campaign-backers.service`) and the demo fixture campaigns that power the
 * dashboard before a live indexer is wired up. It is deliberately independent
 * of the React layer so both the API route and tests can call it directly.
 */

import {
  PDFDocument,
  PDFFont,
  PDFPage,
  rgb,
  StandardFonts,
} from "pdf-lib";

import { formatTokenAmount, parseTokenAmount } from "@/types/campaign-backers";
import type { BackerVisibility } from "@/types/campaign-backers";
import {
  DEFAULT_REWARD_TIERS,
  getCampaignAnalyticsDashboard,
  type CampaignAnalyticsDashboard,
} from "./campaign-analytics-dashboard.service";
import { backersService } from "./campaign-backers.service";
import {
  getCampaign,
  getCampaignDataSource,
  type CampaignDataSource,
} from "./campaign.service";
import { demoCampaigns } from "./campaign-trending.service";

// -- Public types --------------------------------------------------------------

export interface CampaignExportBackerRow {
  /** 1-based rank by total pledged amount. */
  rank: number;
  backerAddress: string;
  displayName: string;
  totalPledged: string;
  token: string;
  contributionCount: number;
  averagePledge: string;
  /** Unix timestamp in milliseconds. */
  firstPledgeAt: number;
  /** Unix timestamp in milliseconds. */
  lastPledgeAt: number;
  rewardTierId: string;
  rewardTierName: string;
  rewardTierPrice: string;
  visibility: BackerVisibility;
  message: string;
  latestTransactionHash: string;
  isFeatured: boolean;
}

export interface CampaignExportSummary {
  campaignId: string;
  campaignName: string;
  creator: string;
  status: string;
  goalAmount: string;
  raisedAmount: string;
  currency: string;
  backerCount: number;
  contributionCount: number;
  totalPledged: string;
  averagePledge: string;
  /** Raised / goal as a percentage, rounded to one decimal. */
  fundingProgress: number;
  createdAt: number;
  exportedAt: number;
}

export interface CampaignExportTierRow {
  tierId: string;
  name: string;
  price: string;
  backers: number;
  pledged: string;
  /** Share of backers that selected this tier, 0–100. */
  share: number;
}

export interface CampaignExportDailyPoint {
  /** UTC date (YYYY-MM-DD). */
  date: string;
  amount: string;
  contributions: number;
  cumulative: string;
}

export interface CampaignExportAnalytics {
  visitors: number;
  contributions: number;
  conversionRate: number;
  funnel: Array<{ label: string; count: number; conversionRate: number }>;
}

export interface CampaignExportDataset {
  summary: CampaignExportSummary;
  backers: CampaignExportBackerRow[];
  rewardTiers: CampaignExportTierRow[];
  daily: CampaignExportDailyPoint[];
  analytics: CampaignExportAnalytics | null;
}

export interface BuildCampaignExportOptions {
  dataSource?: CampaignDataSource;
  now?: number;
}

// -- Shared helpers ------------------------------------------------------------

const DEFAULT_TOKEN = "XLM";

function toMillis(timestamp: number): number {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 0;
  // The trending fixture stores Unix seconds; backer/campaign records use ms.
  return timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
}

function dateKey(timestamp: number): string {
  return new Date(toMillis(timestamp)).toISOString().slice(0, 10);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function percentage(numerator: number, denominator: number): number {
  return denominator <= 0 ? 0 : round1((numerator / denominator) * 100);
}

function sumScaled(values: bigint[]): bigint {
  return values.reduce((total, value) => total + value, 0n);
}

/** Reward tier a backer selected, based on their total pledged amount. */
export function resolveTierForAmount(amount: string): {
  tierId: string;
  name: string;
  price: string;
} {
  const scaled = parseTokenAmount(amount) ?? 0n;
  let selected = DEFAULT_REWARD_TIERS[0];
  for (const tier of DEFAULT_REWARD_TIERS) {
    const price = parseTokenAmount(tier.price);
    if (price !== null && scaled >= price) selected = tier;
  }
  return { tierId: selected.tierId, name: selected.name, price: selected.price };
}

interface RawContribution {
  backerAddress: string;
  amount: string;
  token?: string;
  at: number;
  displayName?: string;
  message?: string;
  txHash?: string;
}

interface ExportCampaignMeta {
  id: string;
  name: string;
  creator: string;
  status: string;
  goalAmount: string;
  raisedAmount: string;
}

/**
 * Resolve campaign metadata and contribution history for an export.
 *
 * Stored campaigns win over the demo fixtures. When no backer contributions
 * have been recorded yet we fall back to the campaign's sponsor ledger so a
 * new campaign still produces a meaningful backer list.
 */
function resolveSources(
  campaignId: string,
  stored: Awaited<ReturnType<typeof getCampaign>>,
  demo: ReturnType<typeof demoCampaigns>[number] | undefined,
): { meta: ExportCampaignMeta; contributions: RawContribution[] } | null {
  if (stored) {
    const recorded: RawContribution[] = backersService
      .getContributions(campaignId)
      .map((entry) => ({
        backerAddress: entry.backerAddress,
        amount: entry.amount,
        token: entry.token,
        at: entry.contributedAt,
        displayName: entry.displayName,
        message: entry.message,
        txHash: entry.txHash,
      }));

    // Include sponsor-ledger entries that have not been mirrored into the
    // backer tracker yet. Addresses already represented there are skipped so a
    // pledge is never counted twice.
    const trackedAddresses = new Set(
      recorded.map((entry) => entry.backerAddress.trim().toLowerCase()),
    );
    const sponsors: RawContribution[] = (stored.sponsors ?? [])
      .filter((sponsor) => !trackedAddresses.has(sponsor.address.trim().toLowerCase()))
      .map((sponsor) => ({
        backerAddress: sponsor.address,
        amount: sponsor.amount,
        token: sponsor.token,
        at: sponsor.sponsoredAt,
      }));

    const contributions = [...recorded, ...sponsors];

    return {
      meta: {
        id: stored.id,
        name: stored.name,
        creator: stored.creator,
        status: stored.status,
        goalAmount: stored.goalAmount,
        raisedAmount: stored.raisedAmount,
      },
      contributions,
    };
  }

  if (!demo) return null;

  return {
    meta: {
      id: demo.id,
      name: `Campaign #${demo.id}`,
      creator: demo.creator,
      status: demo.status,
      goalAmount: demo.targetAmount,
      raisedAmount: demo.totalRaised,
    },
    contributions: (demo.contributions ?? []).map((entry) => ({
      backerAddress: entry.contributor,
      amount: entry.amount,
      token: DEFAULT_TOKEN,
      at: toMillis(entry.timestamp),
    })),
  };
}

// -- Dataset builder -----------------------------------------------------------

/**
 * Collect everything needed for an export. Returns `null` when the campaign
 * cannot be found in the campaign store or the demo fixtures.
 */
export async function buildCampaignExportDataset(
  campaignId: string,
  options: BuildCampaignExportOptions = {},
): Promise<CampaignExportDataset | null> {
  const id = campaignId?.trim();
  if (!id) return null;

  const now = options.now ?? Date.now();
  const dataSource = options.dataSource ?? getCampaignDataSource();
  const stored = await getCampaign(id, dataSource);
  const demo = stored ? undefined : demoCampaigns().find((campaign) => campaign.id === id);
  const sources = resolveSources(id, stored, demo);
  if (!sources) return null;

  const { meta, contributions } = sources;
  const currency =
    contributions.find((entry) => entry.token?.trim())?.token?.trim().toUpperCase() ??
    DEFAULT_TOKEN;

  // Aggregate contributions per backer address (case-insensitive).
  const buckets = new Map<
    string,
    {
      address: string;
      scaled: bigint;
      count: number;
      firstAt: number;
      lastAt: number;
      displayName?: string;
      message?: string;
      txHash?: string;
      token?: string;
    }
  >();

  for (const contribution of contributions) {
    const address = contribution.backerAddress?.trim();
    if (!address) continue;
    const scaled = parseTokenAmount(contribution.amount);
    if (scaled === null || scaled <= 0n) continue;

    const key = address.toLowerCase();
    const at = toMillis(contribution.at);
    const existing = buckets.get(key);
    if (existing) {
      existing.scaled += scaled;
      existing.count += 1;
      existing.firstAt = Math.min(existing.firstAt, at);
      existing.lastAt = Math.max(existing.lastAt, at);
      existing.displayName = contribution.displayName ?? existing.displayName;
      existing.message = contribution.message ?? existing.message;
      existing.txHash = contribution.txHash ?? existing.txHash;
      existing.token = contribution.token?.trim() || existing.token;
    } else {
      buckets.set(key, {
        address,
        scaled,
        count: 1,
        firstAt: at,
        lastAt: at,
        displayName: contribution.displayName,
        message: contribution.message,
        txHash: contribution.txHash,
        token: contribution.token?.trim() || undefined,
      });
    }
  }

  const ranked = Array.from(buckets.values()).sort(
    (a, b) => (a.scaled < b.scaled ? 1 : a.scaled > b.scaled ? -1 : 0) || a.address.localeCompare(b.address),
  );

  const backers: CampaignExportBackerRow[] = ranked.map((bucket, index) => {
    const totalPledged = formatTokenAmount(bucket.scaled);
    const tier = resolveTierForAmount(totalPledged);
    const preference = backersService.getPrivacyPreference(id, bucket.address);

    return {
      rank: index + 1,
      backerAddress: bucket.address,
      displayName: bucket.displayName?.trim() || bucket.address,
      totalPledged,
      token: bucket.token?.toUpperCase() || currency,
      contributionCount: bucket.count,
      averagePledge: formatTokenAmount(bucket.scaled / BigInt(bucket.count)),
      firstPledgeAt: bucket.firstAt,
      lastPledgeAt: bucket.lastAt,
      rewardTierId: tier.tierId,
      rewardTierName: tier.name,
      rewardTierPrice: tier.price,
      visibility: preference.visibility,
      message: bucket.message?.trim() ?? "",
      latestTransactionHash: bucket.txHash ?? "",
      isFeatured: backersService.isFeatured(id, bucket.address),
    };
  });

  const totalScaled = sumScaled(ranked.map((bucket) => bucket.scaled));
  const contributionCount = ranked.reduce((total, bucket) => total + bucket.count, 0);
  const goalScaled = parseTokenAmount(meta.goalAmount ?? "") ?? 0n;
  const raisedScaled = parseTokenAmount(meta.raisedAmount ?? "") ?? totalScaled;

  const rewardTiers: CampaignExportTierRow[] = DEFAULT_REWARD_TIERS.map((tier) => {
    const matching = backers.filter((backer) => backer.rewardTierId === tier.tierId);
    const pledged = sumScaled(
      matching.map((backer) => parseTokenAmount(backer.totalPledged) ?? 0n),
    );
    return {
      tierId: tier.tierId,
      name: tier.name,
      price: tier.price,
      backers: matching.length,
      pledged: formatTokenAmount(pledged),
      share: percentage(matching.length, backers.length),
    };
  });

  // Daily funding series, grouped by UTC date.
  const dailyBuckets = new Map<string, { scaled: bigint; count: number }>();
  for (const contribution of contributions) {
    const scaled = parseTokenAmount(contribution.amount);
    if (scaled === null || scaled <= 0n) continue;
    const key = dateKey(contribution.at);
    const bucket = dailyBuckets.get(key) ?? { scaled: 0n, count: 0 };
    bucket.scaled += scaled;
    bucket.count += 1;
    dailyBuckets.set(key, bucket);
  }

  let cumulative = 0n;
  const daily: CampaignExportDailyPoint[] = Array.from(dailyBuckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, bucket]) => {
      cumulative += bucket.scaled;
      return {
        date,
        amount: formatTokenAmount(bucket.scaled),
        contributions: bucket.count,
        cumulative: formatTokenAmount(cumulative),
      };
    });

  const dashboard: CampaignAnalyticsDashboard | null = stored
    ? await getCampaignAnalyticsDashboard(id, dataSource, now).catch(() => null)
    : null;

  const analytics: CampaignExportAnalytics | null = dashboard
    ? {
        visitors: dashboard.totals.visitors,
        contributions: dashboard.totals.contributions,
        conversionRate: dashboard.totals.conversionRate,
        funnel: dashboard.funnel.map((stage) => ({
          label: stage.label,
          count: stage.count,
          conversionRate: stage.conversionRate,
        })),
      }
    : null;

  return {
    summary: {
      campaignId: meta.id,
      campaignName: meta.name,
      creator: meta.creator,
      status: meta.status,
      goalAmount: meta.goalAmount,
      raisedAmount: meta.raisedAmount || formatTokenAmount(totalScaled),
      currency,
      backerCount: backers.length,
      contributionCount,
      totalPledged: formatTokenAmount(totalScaled),
      averagePledge:
        backers.length > 0
          ? formatTokenAmount(totalScaled / BigInt(backers.length))
          : "0",
      fundingProgress: percentage(Number(raisedScaled), Number(goalScaled)),
      createdAt: toMillis(stored?.createdAt ?? 0),
      exportedAt: now,
    },
    backers,
    rewardTiers,
    daily,
    analytics,
  };
}

// -- CSV -----------------------------------------------------------------------

export const BACKER_CSV_COLUMNS = [
  "campaign_id",
  "rank",
  "backer_address",
  "display_name",
  "total_pledged",
  "token",
  "contribution_count",
  "average_pledge",
  "first_pledge_at",
  "last_pledge_at",
  "reward_tier_id",
  "reward_tier_name",
  "reward_tier_price",
  "visibility",
  "message",
  "latest_transaction_hash",
  "is_featured",
] as const;

function csvCell(value: string | number | boolean): string {
  const text = String(value);
  // Neutralise spreadsheet formula injection without mangling ordinary text.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function toIso(timestamp: number): string {
  if (!timestamp) return "";
  return new Date(timestamp).toISOString();
}

/**
 * Serialise the backer list to CSV. Every backer field captured by the export
 * dataset gets its own column, including reward tier selection and privacy.
 */
export function backersToCsv(
  backers: CampaignExportBackerRow[],
  campaignId = "",
): string {
  const rows: Array<Array<string | number | boolean>> = [Array.from(BACKER_CSV_COLUMNS)];
  for (const backer of backers) {
    rows.push([
      campaignId,
      backer.rank,
      backer.backerAddress,
      backer.displayName,
      backer.totalPledged,
      backer.token,
      backer.contributionCount,
      backer.averagePledge,
      toIso(backer.firstPledgeAt),
      toIso(backer.lastPledgeAt),
      backer.rewardTierId,
      backer.rewardTierName,
      backer.rewardTierPrice,
      backer.visibility,
      backer.message,
      backer.latestTransactionHash,
      backer.isFeatured,
    ]);
  }
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

export async function buildCampaignBackersCsv(
  campaignId: string,
  options: BuildCampaignExportOptions = {},
): Promise<string | null> {
  const dataset = await buildCampaignExportDataset(campaignId, options);
  return dataset ? backersToCsv(dataset.backers, dataset.summary.campaignId) : null;
}

// -- PDF -----------------------------------------------------------------------

const PAGE_W = 595.28; // A4 portrait points
const PAGE_H = 841.89;
const MARGIN = 42;
const CONTENT_W = PAGE_W - MARGIN * 2;

const COLORS = {
  primary: rgb(0.31, 0.18, 0.61),
  primarySoft: rgb(0.91, 0.89, 0.98),
  dark: rgb(0.12, 0.12, 0.16),
  muted: rgb(0.38, 0.38, 0.43),
  light: rgb(0.955, 0.95, 0.975),
  border: rgb(0.84, 0.82, 0.9),
  white: rgb(1, 1, 1),
  green: rgb(0.1, 0.45, 0.28),
  greenSoft: rgb(0.86, 0.95, 0.89),
};

/** pdf-lib's standard fonts only cover WinAnsi — replace unsupported glyphs. */
function pdfText(value: string): string {
  return value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^ -~¡-ÿ]/g, "?");
}

function truncate(value: string, max: number): string {
  const text = pdfText(value);
  return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1))}…`;
}

function groupedAmount(value: string): string {
  const [whole, fraction] = value.split(".");
  const grouped = (whole || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction ? `${grouped}.${fraction}` : grouped;
}

function compactAmount(value: string): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  if (Math.abs(numeric) >= 1_000_000_000) return `${(numeric / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(numeric) >= 1_000_000) return `${(numeric / 1_000_000).toFixed(1)}M`;
  if (Math.abs(numeric) >= 1_000) return `${(numeric / 1_000).toFixed(1)}k`;
  if (Math.abs(numeric) >= 1) return numeric.toFixed(0);
  return numeric.toFixed(2);
}

function drawHeader(page: PDFPage, bold: PDFFont, regular: PDFFont, subtitle: string): number {
  page.drawRectangle({ x: 0, y: PAGE_H - 88, width: PAGE_W, height: 88, color: COLORS.primary });
  page.drawText("Fundable Protocol", {
    x: MARGIN,
    y: PAGE_H - 40,
    font: bold,
    size: 20,
    color: COLORS.white,
  });
  page.drawText(subtitle.toUpperCase(), {
    x: MARGIN,
    y: PAGE_H - 60,
    font: regular,
    size: 9,
    color: rgb(0.88, 0.84, 0.96),
  });
  return PAGE_H - 108;
}

function drawFooter(page: PDFPage, regular: PDFFont, pageNumber: number): void {
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: 26, color: COLORS.light });
  page.drawText("Generated by Fundable Protocol", {
    x: MARGIN,
    y: 8,
    font: regular,
    size: 7,
    color: COLORS.muted,
  });
  const label = `Page ${pageNumber}`;
  page.drawText(label, {
    x: PAGE_W - MARGIN - regular.widthOfTextAtSize(label, 7),
    y: 8,
    font: regular,
    size: 7,
    color: COLORS.muted,
  });
}

function statCard(
  page: PDFPage,
  bold: PDFFont,
  regular: PDFFont,
  x: number,
  y: number,
  width: number,
  label: string,
  value: string,
  accent = COLORS.primary,
): void {
  page.drawRectangle({
    x,
    y: y - 48,
    width,
    height: 48,
    color: COLORS.light,
    borderColor: COLORS.border,
    borderWidth: 1,
  });
  page.drawRectangle({ x, y: y - 48, width: 3, height: 48, color: accent });
  page.drawText(truncate(label, 24), {
    x: x + 10,
    y: y - 15,
    font: regular,
    size: 7,
    color: COLORS.muted,
  });
  page.drawText(truncate(value, 22), {
    x: x + 10,
    y: y - 35,
    font: bold,
    size: 13,
    color: accent,
  });
}

/** Vertical bar chart used for the daily funding trend. */
function drawFundingChart(
  page: PDFPage,
  bold: PDFFont,
  regular: PDFFont,
  box: { x: number; y: number; width: number; height: number },
  points: CampaignExportDailyPoint[],
): void {
  const { x, y, width, height } = box;
  const plotTop = y + height - 6;
  const plotBottom = y + 22;
  const plotHeight = plotTop - plotBottom;
  const plotWidth = width - 34;
  const plotX = x + 34;

  // Gridlines and value axis.
  const max = Math.max(...points.map((point) => Number(point.amount) || 0), 0);
  for (let index = 0; index <= 4; index += 1) {
    const gridY = plotBottom + (plotHeight * index) / 4;
    page.drawLine({
      start: { x: plotX, y: gridY },
      end: { x: plotX + plotWidth, y: gridY },
      thickness: 0.5,
      color: COLORS.border,
    });
    const value = (max * index) / 4;
    const label = compactAmount(String(value));
    page.drawText(label, {
      x: plotX - 6 - regular.widthOfTextAtSize(label, 6),
      y: gridY - 2,
      font: regular,
      size: 6,
      color: COLORS.muted,
    });
  }

  if (points.length === 0 || max <= 0) {
    page.drawText("No funding activity recorded yet", {
      x: plotX + 12,
      y: plotBottom + plotHeight / 2,
      font: regular,
      size: 8,
      color: COLORS.muted,
    });
    return;
  }

  const slot = plotWidth / points.length;
  const barWidth = Math.max(2, Math.min(18, slot * 0.62));
  const every = Math.max(1, Math.ceil(points.length / 8));

  points.forEach((point, index) => {
    const value = Number(point.amount) || 0;
    const barHeight = max <= 0 ? 0 : (value / max) * plotHeight;
    const barX = plotX + index * slot + (slot - barWidth) / 2;
    page.drawRectangle({
      x: barX,
      y: plotBottom,
      width: barWidth,
      height: Math.max(barHeight, value > 0 ? 1 : 0),
      color: COLORS.primary,
    });
    if (index % every === 0 || index === points.length - 1) {
      const label = point.date.slice(5);
      page.drawText(label, {
        x: barX + barWidth / 2 - regular.widthOfTextAtSize(label, 5.5) / 2,
        y: y + 6,
        font: regular,
        size: 5.5,
        color: COLORS.muted,
      });
    }
  });

  page.drawLine({
    start: { x: plotX, y: plotBottom },
    end: { x: plotX + plotWidth, y: plotBottom },
    thickness: 0.8,
    color: COLORS.muted,
  });
  page.drawText("Daily pledges", {
    x: plotX,
    y: y + height + 4,
    font: bold,
    size: 8,
    color: COLORS.dark,
  });
}

/** Horizontal bar chart used for reward-tier selection shares. */
function drawTierChart(
  page: PDFPage,
  bold: PDFFont,
  regular: PDFFont,
  box: { x: number; y: number; width: number; height: number },
  tiers: CampaignExportTierRow[],
): void {
  const { x, y, width } = box;
  const labelWidth = 112;
  const trackX = x + labelWidth;
  const trackWidth = width - labelWidth - 58;
  const max = Math.max(...tiers.map((tier) => Number(tier.pledged) || 0), 0);
  const rowHeight = Math.max(13, Math.min(20, box.height / Math.max(tiers.length, 1)));

  page.drawText("Reward tier selections", {
    x,
    y: y + box.height + 4,
    font: bold,
    size: 8,
    color: COLORS.dark,
  });

  if (max <= 0) {
    page.drawText("No reward tiers selected yet", {
      x,
      y: y + box.height / 2,
      font: regular,
      size: 8,
      color: COLORS.muted,
    });
    return;
  }

  tiers.forEach((tier, index) => {
    const rowY = y + box.height - (index + 1) * rowHeight;
    const value = Number(tier.pledged) || 0;
    const barWidth = max <= 0 ? 0 : Math.max(value > 0 ? 2 : 0, (value / max) * trackWidth);

    page.drawText(truncate(tier.name, 22), {
      x,
      y: rowY + 3,
      font: regular,
      size: 7,
      color: COLORS.dark,
    });
    page.drawRectangle({
      x: trackX,
      y: rowY,
      width: trackWidth,
      height: 8,
      color: COLORS.primarySoft,
    });
    page.drawRectangle({
      x: trackX,
      y: rowY,
      width: barWidth,
      height: 8,
      color: COLORS.green,
    });
    const label = `${tier.backers} backer${tier.backers === 1 ? "" : "s"} · ${groupedAmount(
      tier.pledged,
    )}`;
    page.drawText(truncate(label, 28), {
      x: trackX + trackWidth + 6,
      y: rowY + 1.5,
      font: regular,
      size: 6.5,
      color: COLORS.muted,
    });
  });
}

interface TableColumn {
  header: string;
  width: number;
  align?: "left" | "right";
  value: (row: CampaignExportBackerRow) => string;
}

const BACKER_COLUMNS: TableColumn[] = [
  { header: "#", width: 20, value: (row) => String(row.rank) },
  {
    header: "Backer",
    width: 150,
    value: (row) => truncate(row.displayName, 30),
  },
  {
    header: "Pledged",
    width: 74,
    align: "right",
    value: (row) => `${groupedAmount(row.totalPledged)} ${row.token}`,
  },
  {
    header: "Pledges",
    width: 42,
    align: "right",
    value: (row) => String(row.contributionCount),
  },
  {
    header: "Reward tier",
    width: 104,
    value: (row) => truncate(row.rewardTierName, 20),
  },
  {
    header: "Visibility",
    width: 55,
    value: (row) => row.visibility,
  },
  {
    header: "Last pledge",
    width: 64,
    value: (row) => (row.lastPledgeAt ? toIso(row.lastPledgeAt).slice(0, 10) : "—"),
  },
];

function drawTableHeader(
  page: PDFPage,
  bold: PDFFont,
  x: number,
  y: number,
  columns: TableColumn[],
): void {
  page.drawRectangle({
    x,
    y: y - 15,
    width: CONTENT_W,
    height: 15,
    color: COLORS.primary,
  });
  let cursor = x;
  const totalWidth = columns.reduce((total, column) => total + column.width, 0);
  const scale = CONTENT_W / totalWidth;
  for (const column of columns) {
    const width = column.width * scale;
    const label = truncate(column.header, Math.max(4, Math.floor(width / 4)));
    page.drawText(label, {
      x: column.align === "right" ? cursor + width - 4 - bold.widthOfTextAtSize(label, 6.5) : cursor + 4,
      y: y - 11,
      font: bold,
      size: 6.5,
      color: COLORS.white,
    });
    cursor += width;
  }
}

function drawBackerTable(
  pdf: PDFDocument,
  page: PDFPage,
  bold: PDFFont,
  regular: PDFFont,
  backers: CampaignExportBackerRow[],
  startY: number,
  pageNumber: number,
): { page: PDFPage; pageNumber: number; y: number } {
  let currentPage = page;
  let currentY = startY;
  let currentPageNumber = pageNumber;

  const totalWidth = BACKER_COLUMNS.reduce((total, column) => total + column.width, 0);
  const scale = CONTENT_W / totalWidth;
  const rowHeight = 15;

  currentPage.drawText("Backer list", {
    x: MARGIN,
    y: currentY,
    font: bold,
    size: 11,
    color: COLORS.dark,
  });
  currentY -= 18;
  drawTableHeader(currentPage, bold, MARGIN, currentY, BACKER_COLUMNS);
  currentY -= 15;

  if (backers.length === 0) {
    currentPage.drawText("No backers recorded for this campaign yet.", {
      x: MARGIN,
      y: currentY - 12,
      font: regular,
      size: 8,
      color: COLORS.muted,
    });
    return { page: currentPage, pageNumber: currentPageNumber, y: currentY - 24 };
  }

  backers.forEach((row, index) => {
    if (currentY - rowHeight < 40) {
      drawFooter(currentPage, regular, currentPageNumber);
      currentPage = pdf.addPage([PAGE_W, PAGE_H]);
      currentPageNumber += 1;
      currentY = drawHeader(
        currentPage,
        bold,
        regular,
        `Backer list — page ${currentPageNumber}`,
      );
      drawTableHeader(currentPage, bold, MARGIN, currentY, BACKER_COLUMNS);
      currentY -= 15;
    }

    if (index % 2 === 0) {
      currentPage.drawRectangle({
        x: MARGIN,
        y: currentY - rowHeight,
        width: CONTENT_W,
        height: rowHeight,
        color: COLORS.light,
      });
    }

    let cursor = MARGIN;
    for (const column of BACKER_COLUMNS) {
      const width = column.width * scale;
      const label = truncate(
        column.value(row),
        Math.max(4, Math.floor(width / 3.6)),
      );
      const size = 6.5;
      currentPage.drawText(label, {
        x:
          column.align === "right"
            ? cursor + width - 4 - regular.widthOfTextAtSize(label, size)
            : cursor + 4,
        y: currentY - 10.5,
        font: regular,
        size,
        color: COLORS.dark,
      });
      cursor += width;
    }

    currentY -= rowHeight;
  });

  return { page: currentPage, pageNumber: currentPageNumber, y: currentY };
}

/**
 * Build the PDF analytics report. Charts are drawn as vector graphics with
 * pdf-lib (no canvas/native dependencies), so this works in the Node runtime.
 */
export async function buildCampaignExportPdf(
  dataset: CampaignExportDataset,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let pageNumber = 1;

  let y = drawHeader(page, bold, regular, "Campaign data export");

  page.drawText(truncate(dataset.summary.campaignName, 60), {
    x: MARGIN,
    y,
    font: bold,
    size: 19,
    color: COLORS.dark,
  });
  y -= 16;
  page.drawText(
    truncate(
      `Campaign #${dataset.summary.campaignId} · ${dataset.summary.status} · Creator ${dataset.summary.creator}`,
      90,
    ),
    { x: MARGIN, y, font: regular, size: 8, color: COLORS.muted },
  );
  y -= 13;
  page.drawText(
    `Exported ${new Date(dataset.summary.exportedAt).toISOString().replace("T", " ").slice(0, 19)} UTC`,
    { x: MARGIN, y, font: regular, size: 8, color: COLORS.muted },
  );
  y -= 26;

  const cardGap = 10;
  const cardWidth = (CONTENT_W - cardGap * 3) / 4;
  const raised = `${groupedAmount(dataset.summary.raisedAmount)} ${dataset.summary.currency}`;
  const progress = `${dataset.summary.fundingProgress.toFixed(1)}%`;
  const backerCount = String(dataset.summary.backerCount);
  const average = `${groupedAmount(dataset.summary.averagePledge)} ${dataset.summary.currency}`;

  statCard(page, bold, regular, MARGIN, y, cardWidth, "Total raised", raised, COLORS.primary);
  statCard(
    page,
    bold,
    regular,
    MARGIN + cardWidth + cardGap,
    y,
    cardWidth,
    "Goal progress",
    progress,
    COLORS.green,
  );
  statCard(
    page,
    bold,
    regular,
    MARGIN + (cardWidth + cardGap) * 2,
    y,
    cardWidth,
    "Backers",
    backerCount,
    COLORS.primary,
  );
  statCard(
    page,
    bold,
    regular,
    MARGIN + (cardWidth + cardGap) * 3,
    y,
    cardWidth,
    "Average pledge",
    average,
    COLORS.green,
  );
  y -= 66;

  page.drawText(
    truncate(
      `Goal ${groupedAmount(dataset.summary.goalAmount)} ${dataset.summary.currency} · ${dataset.summary.contributionCount} pledges recorded`,
      100,
    ),
    { x: MARGIN, y, font: regular, size: 8, color: COLORS.muted },
  );
  y -= 20;

  drawFundingChart(page, bold, regular, { x: MARGIN, y: y - 146, width: CONTENT_W, height: 146 }, dataset.daily);
  y -= 172;

  drawTierChart(page, bold, regular, { x: MARGIN, y: y - 106, width: CONTENT_W, height: 106 }, dataset.rewardTiers);
  y -= 128;

  if (dataset.analytics) {
    page.drawRectangle({
      x: MARGIN,
      y: y - 34,
      width: CONTENT_W,
      height: 34,
      color: COLORS.greenSoft,
      borderColor: COLORS.border,
      borderWidth: 1,
    });
    page.drawText("Campaign analytics", {
      x: MARGIN + 10,
      y: y - 13,
      font: bold,
      size: 8,
      color: COLORS.green,
    });
    page.drawText(
      truncate(
        `${dataset.analytics.visitors} visitors · ${dataset.analytics.contributions} contributions · ${dataset.analytics.conversionRate.toFixed(
          1,
        )}% visitor conversion`,
        110,
      ),
      { x: MARGIN + 10, y: y - 26, font: regular, size: 7.5, color: COLORS.dark },
    );
    y -= 48;
  }

  drawFooter(page, regular, pageNumber);
  page = pdf.addPage([PAGE_W, PAGE_H]);
  pageNumber += 1;
  y = drawHeader(page, bold, regular, "Backer list");

  const table = drawBackerTable(pdf, page, bold, regular, dataset.backers, y, pageNumber);
  drawFooter(table.page, regular, table.pageNumber);

  return pdf.save();
}

export async function buildCampaignExportPdfForId(
  campaignId: string,
  options: BuildCampaignExportOptions = {},
): Promise<Uint8Array | null> {
  const dataset = await buildCampaignExportDataset(campaignId, options);
  return dataset ? buildCampaignExportPdf(dataset) : null;
}
