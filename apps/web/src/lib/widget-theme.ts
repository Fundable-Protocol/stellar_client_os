import type { CampaignRecord } from "@/services/campaign.service";

/**
 * Shared pure helpers for the embeddable campaign impact widget (#951).
 * Kept React-free so both the widget page and the embed API route can use
 * them, and so they unit-test without a DOM.
 */

export type WidgetTheme = "light" | "dark" | "forest";

export interface WidgetThemeTokens {
  bg: string;
  text: string;
  muted: string;
  border: string;
  bar: string;
  barBg: string;
  accent: string;
}

export const WIDGET_THEMES: Record<WidgetTheme, WidgetThemeTokens> = {
  light: {
    bg: "bg-white",
    text: "text-slate-900",
    muted: "text-slate-500",
    border: "border-slate-200",
    bar: "bg-emerald-500",
    barBg: "bg-slate-100",
    accent: "text-emerald-600",
  },
  dark: {
    bg: "bg-slate-900",
    text: "text-white",
    muted: "text-slate-400",
    border: "border-slate-700",
    bar: "bg-emerald-400",
    barBg: "bg-slate-800",
    accent: "text-emerald-400",
  },
  forest: {
    bg: "bg-[#0b1f16]",
    text: "text-emerald-50",
    muted: "text-emerald-200/70",
    border: "border-emerald-900",
    bar: "bg-emerald-400",
    barBg: "bg-emerald-950",
    accent: "text-emerald-300",
  },
};

export const DEFAULT_WIDGET_THEME: WidgetTheme = "light";

export function resolveWidgetTheme(value: string | string[] | undefined): WidgetTheme {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "light" || raw === "dark" || raw === "forest") return raw;
  return DEFAULT_WIDGET_THEME;
}

/** Funding progress clamped to [0, 100]; BigInt-safe for token amounts. */
export function progressPercent(campaign: CampaignRecord): number {
  const goal = BigInt(campaign.goalAmount || "0");
  if (goal === 0n) return 0;
  const raised = BigInt(campaign.raisedAmount || "0");
  const pct = Number((raised * 100n) / goal);
  return Math.max(0, Math.min(pct, 100));
}

export const WIDGET_IFRAME_MIN_HEIGHT = 360;

/**
 * Embed URL for a campaign's impact widget — served by the route handler at
 * `/api/campaigns/[id]/widget` (HTML, layout-free, embeddable).
 */
export function widgetIframeSrc(
  campaignId: string,
  baseUrl: string,
  theme: WidgetTheme = DEFAULT_WIDGET_THEME,
): string {
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}/api/campaigns/${encodeURIComponent(campaignId)}/widget?theme=${theme}`;
}

/** The copy-paste <iframe> snippet campaign owners embed on their sites. */
export function buildEmbedSnippet(
  campaignId: string,
  baseUrl: string,
  theme: WidgetTheme = DEFAULT_WIDGET_THEME,
): string {
  const src = widgetIframeSrc(campaignId, baseUrl, theme);
  return `<iframe src="${src}" width="100%" height="${WIDGET_IFRAME_MIN_HEIGHT}" frameborder="0" loading="lazy" title="Fundable campaign impact"></iframe>`;
}
