/**
 * Shared helpers for the real-time campaign funding counter (issue #1259).
 *
 * Kept framework-free so the SSE route, the hook, and the animated number
 * component can all share the exact same formatting and easing maths.
 */

/** Interval used when the live SSE stream is unavailable (issue #1259 AC3). */
export const FUNDING_POLL_INTERVAL_MS = 30_000;

/** Idle refresh cadence of the server-side data source while an SSE stream is open. */
export const FUNDING_STREAM_TICK_MS = 2_000;

/** Heartbeat spacing for the SSE comment line that keeps proxies from idling out. */
export const FUNDING_STREAM_HEARTBEAT_MS = 15_000;

/**
 * Round-to-int easing for the number rolling animation: fast start, gentle
 * landing, always monotonic between `from` and `to` for t ∈ [0, 1].
 */
export function easeOutCubic(t: number): number {
  const clamped = Math.min(Math.max(t, 0), 1);
  return 1 - Math.pow(1 - clamped, 3);
}

/**
 * Grouped integer display for a funding amount, e.g. 33850 -> "33,850".
 * Negative or non-finite values degrade to "0" so the counter never shows NaN.
 */
export function formatFunding(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return Math.round(value).toLocaleString("en-US");
}

/** Value shown at animation time `t` (0..1) between two funding totals. */
export function tweenFundingValue(from: number, to: number, t: number): number {
  if (!Number.isFinite(from)) from = 0;
  if (!Number.isFinite(to)) to = 0;
  return from + (to - from) * easeOutCubic(t);
}

/** Funding percentage against the goal, clamped to whole 0..100 like the page. */
export function fundingPercent(raised: number, goal: number): number {
  const goalValue = Number.isFinite(goal) ? goal : 0;
  if (goalValue <= 0) return 0;
  return Math.min(100, Math.round(((Number.isFinite(raised) ? raised : 0) / goalValue) * 100));
}

/** Value shown at animation time `t` (0..1) between two impact totals (issue #1229). */
export function tweenImpactValue(from: number, to: number, t: number): number {
  if (!Number.isFinite(from)) from = 0;
  if (!Number.isFinite(to)) to = 0;
  return from + (to - from) * easeOutCubic(t);
}

/**
 * Grouped impact display with the creator-defined unit suffix, e.g.
 * (33850, "meals") -> "33,850 meals". Non-finite values degrade to "0" and a
 * blank unit is omitted so the counter never shows NaN or a dangling space.
 */
export function formatImpactValue(value: number, unit: string): string {
  const digits = formatFunding(value);
  const trimmedUnit = typeof unit === "string" ? unit.trim() : "";
  return trimmedUnit ? `${digits} ${trimmedUnit}` : digits;
}

/** Inputs for the shareable impact image card (issue #1229 AC3). */
export interface ImpactCardOptions {
  campaignName: string;
  metricName: string;
  value: number;
  unit: string;
  raisedAmount: number;
}

/** Escape text for safe embedding inside SVG/XML markup. */
function escapeSvgText(text: string): string {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Truncate long labels so the card layout never overflows. */
function truncateLabel(text: string, max: number): string {
  const value = String(text ?? "");
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/**
 * Build a self-contained SVG string for a shareable impact card. The SVG can
 * be drawn onto a canvas and exported as a PNG without any DOM dependencies,
 * so the share buttons and the counter component can share one renderer.
 */
export function buildImpactCardSvg({
  campaignName,
  metricName,
  value,
  unit,
  raisedAmount,
}: ImpactCardOptions): string {
  const width = 1200;
  const height = 630;
  const safeCampaign = escapeSvgText(truncateLabel(campaignName, 48));
  const safeMetric = escapeSvgText(truncateLabel(metricName, 40));
  const impactText = escapeSvgText(formatImpactValue(value, unit));
  const raisedText = escapeSvgText(`$${formatFunding(raisedAmount)} raised`);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<defs><linearGradient id="impactBg" x1="0" y1="0" x2="1" y2="1">`,
    `<stop offset="0%" stop-color="#0f172a"/><stop offset="100%" stop-color="#1e3a8a"/>`,
    `</linearGradient></defs>`,
    `<rect width="${width}" height="${height}" fill="url(#impactBg)"/>`,
    `<text x="80" y="140" fill="#93c5fd" font-family="system-ui, sans-serif" font-size="34" font-weight="600">${safeCampaign}</text>`,
    `<text x="80" y="230" fill="#e2e8f0" font-family="system-ui, sans-serif" font-size="30">${safeMetric}</text>`,
    `<text x="80" y="400" fill="#ffffff" font-family="system-ui, sans-serif" font-size="120" font-weight="700">${impactText}</text>`,
    `<text x="80" y="520" fill="#cbd5e1" font-family="system-ui, sans-serif" font-size="36">${raisedText}</text>`,
    `</svg>`,
  ].join("");
}
