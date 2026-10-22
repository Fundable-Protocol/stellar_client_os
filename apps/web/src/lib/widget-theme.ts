import type { CampaignRecord } from "@/services/campaign.service";

/**
 * Shared pure helpers for the embeddable campaign impact widget (#951).
 * Kept React-free so both the widget page and the embed API route can use
 * them, and so they unit-test without a DOM.
 */

export type WidgetTheme = "light" | "dark" | "forest";
export type WidgetEmbedTheme = WidgetTheme | "auto";

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

export interface WidgetColors {
  accentColor?: string;
  backgroundColor?: string;
}

export function resolveWidgetColor(value: string | null | undefined, fallback: string): string {
  const normalized = value?.startsWith("#") ? value : `#${value ?? ""}`;
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized : fallback;
}

export function resolveWidgetTheme(value: string | string[] | undefined): WidgetTheme {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "light" || raw === "dark" || raw === "forest") return raw;
  return DEFAULT_WIDGET_THEME;
}

/** Funding progress clamped to [0, 100]; BigInt-safe for token amounts. */
export function progressPercent(
  campaign: Pick<CampaignRecord, "goalAmount" | "raisedAmount">,
): number {
  const goal = BigInt(campaign.goalAmount || "0");
  if (goal === 0n) return 0;
  const raised = BigInt(campaign.raisedAmount || "0");
  const pct = Number((raised * 100n) / goal);
  return Math.max(0, Math.min(pct, 100));
}

export const WIDGET_IFRAME_MIN_HEIGHT = 390;

function validateCampaignId(campaignId: string): void {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(campaignId)) {
    throw new Error("Invalid campaign identifier");
  }
}

function validateWidgetBaseUrl(baseUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error("Invalid widget base URL");
  }
  if ((parsed.protocol !== "https:" && parsed.protocol !== "http:") || parsed.username || parsed.password) {
    throw new Error("Invalid widget base URL");
  }
  return parsed.origin;
}

/**
 * Embed URL for a campaign's impact widget — served by the route handler at
 * `/api/campaigns/[id]/widget` (HTML, layout-free, embeddable).
 */
export function widgetIframeSrc(
  campaignId: string,
  baseUrl: string,
  theme: WidgetEmbedTheme = "auto",
  colors: WidgetColors = {},
): string {
  validateCampaignId(campaignId);
  const base = validateWidgetBaseUrl(baseUrl);
  const params = new URLSearchParams({ theme });
  if (colors.accentColor) params.set("color", colors.accentColor);
  if (colors.backgroundColor) params.set("background", colors.backgroundColor);
  return `${base}/api/campaigns/${encodeURIComponent(campaignId)}/widget?${params}`;
}

/** The copy-paste <iframe> snippet campaign owners embed on their sites. */
export function buildEmbedSnippet(
  campaignId: string,
  baseUrl: string,
  theme: WidgetEmbedTheme = "auto",
  colors: WidgetColors = {},
): string {
  const src = widgetIframeSrc(campaignId, baseUrl, theme, colors);
  const iframe = `<iframe src="${src}" width="100%" height="${WIDGET_IFRAME_MIN_HEIGHT}" frameborder="0" loading="lazy" title="Fundable campaign impact"></iframe>`;
  if (theme !== "auto") return iframe;
  return `${iframe}
<script>
(() => {
  const frame = document.currentScript.previousElementSibling;
  if (!frame) return;
  const base = frame.getAttribute("src");
  const prefersDark = () => {
    for (let node = frame.parentElement; node; node = node.parentElement) {
      if (node.classList.contains("dark")) return true;
      const style = getComputedStyle(node);
      if (style.colorScheme === "dark") return true;
      const rgb = style.backgroundColor.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
      if (!rgb) continue;
      const alpha = style.backgroundColor.match(/rgba\\([^,]+,[^,]+,[^,]+,\\s*([^)]+)\\)/);
      if (alpha && Number(alpha[1]) === 0) continue;
      const [red, green, blue] = rgb.slice(1).map(Number);
      return (red * 299 + green * 587 + blue * 114) / 1000 < 127;
    }
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  };
  const update = () => {
    const url = new URL(base, location.href);
    url.searchParams.set("theme", prefersDark() ? "dark" : "light");
    if (frame.src !== url.href) frame.src = url.href;
  };
  update();
  const observer = new MutationObserver(update);
  for (let node = frame.parentElement; node; node = node.parentElement) {
    observer.observe(node, { attributes: true, attributeFilter: ["class", "style"] });
  }
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", update);
})();
</script>`;
}

/** Copy-paste snippet for the reusable host-theme-aware Web Component. */
export function buildWebComponentSnippet(
  campaignId: string,
  baseUrl: string,
  theme: WidgetEmbedTheme = "auto",
): string {
  validateCampaignId(campaignId);
  const base = validateWidgetBaseUrl(baseUrl);
  return `<fundable-widget campaign-id="${encodeURIComponent(campaignId)}" theme="${theme}"></fundable-widget>\n<script src="${base}/fundable-widget.js" defer></script>`;
}

/** Number of whole days left before an epoch-seconds or epoch-milliseconds deadline. */
export function daysRemaining(deadline: number | undefined, now = Date.now()): number | null {
  if (deadline === undefined || !Number.isFinite(deadline) || deadline <= 0) return null;
  const deadlineMs = deadline < 1_000_000_000_000 ? deadline * 1000 : deadline;
  return Math.max(0, Math.ceil((deadlineMs - now) / 86_400_000));
}

/** Pick a recognized currency from actual funding records; the active donate flow defaults to USDC. */
export function campaignFundingToken(
  sponsors: readonly Pick<CampaignRecord["sponsors"][number], "token">[] = [],
  donations: { totalsByToken: Record<"XLM" | "USDC", string> } = {
    totalsByToken: { XLM: "0", USDC: "0" },
  },
): "XLM" | "USDC" | "mixed" | "unknown" {
  const tokens = new Set<"XLM" | "USDC">();
  let hasUnknownToken = false;
  for (const sponsor of sponsors) {
    const token = sponsor.token.toUpperCase();
    if (token === "XLM" || token === "USDC") tokens.add(token);
    else hasUnknownToken = true;
  }
  for (const token of ["XLM", "USDC"] as const) {
    if (BigInt(donations.totalsByToken[token] || "0") > 0n) tokens.add(token);
  }
  if (tokens.size > 1) return "mixed";
  if (hasUnknownToken || tokens.size === 0) return "unknown";
  return tokens.values().next().value ?? "unknown";
}
