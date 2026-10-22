import { calculateCo2Offset } from "@/lib/co2-impact";
import {
  resolveWidgetTheme,
  resolveWidgetColor,
  progressPercent,
  daysRemaining,
  campaignFundingToken,
  buildEmbedSnippet,
  widgetIframeSrc,
  WIDGET_IFRAME_MIN_HEIGHT,
  WIDGET_THEMES,
  type WidgetColors,
  type WidgetEmbedTheme,
  type WidgetTheme,
} from "@/lib/widget-theme";
import { campaignProgressCache } from "@/services/campaign-progress-cache.service";
import type { CampaignRecord } from "@/services/campaign.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_SPECIES_ID = "oak";
const THEME_COLORS: Record<WidgetTheme, { accentColor: string; backgroundColor: string }> = {
  light: { accentColor: "#059669", backgroundColor: "#ffffff" },
  dark: { accentColor: "#34d399", backgroundColor: "#0f172a" },
  forest: { accentColor: "#6ee7b7", backgroundColor: "#0b1f16" },
};
const TOKEN_COLORS: Record<string, string> = {
  "text-emerald-600": "#059669",
  "text-emerald-400": "#34d399",
  "text-emerald-300": "#6ee7b7",
  "bg-emerald-500": "#10b981",
  "bg-emerald-400": "#34d399",
  "bg-slate-100": "#f1f5f9",
  "bg-slate-800": "#1e293b",
  "bg-emerald-950": "#022c22",
};

function resolveWidgetColors(theme: WidgetTheme, params: URLSearchParams): WidgetColors {
  const defaults = THEME_COLORS[theme];
  return {
    accentColor: resolveWidgetColor(params.get("color"), defaults.accentColor),
    backgroundColor: resolveWidgetColor(params.get("background"), defaults.backgroundColor),
  };
}

const WIDGET_PROGRESS_TTL_SECONDS = 15;
const CAMPAIGN_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

type WidgetCampaign = Pick<
  CampaignRecord,
  "id" | "name" | "goalAmount" | "raisedAmount" | "treeCount" | "createdAt"
> &
  Partial<Pick<CampaignRecord, "deadline" | "sponsors">> & {
    fundingToken?: "XLM" | "USDC" | "mixed" | "unknown";
  };

function formatAmount(amount: string): string {
  const normalized = amount.replaceAll(",", "");
  if (/^-?\d+$/.test(normalized)) return BigInt(normalized).toLocaleString("en-US");
  const numeric = Number(normalized);
  return Number.isFinite(numeric)
    ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(numeric)
    : amount;
}

async function getWidgetCampaign(id: string) {
  let result = await campaignProgressCache.getOrFetch(id, false, WIDGET_PROGRESS_TTL_SECONDS);
  if (
    result.metrics.campaignName === undefined ||
    result.metrics.campaignCreatedAt === undefined ||
    result.metrics.fundingToken === undefined
  ) {
    campaignProgressCache.invalidate(id);
    result = await campaignProgressCache.getOrFetch(id, false, WIDGET_PROGRESS_TTL_SECONDS);
  }
  const metrics = result.metrics;
  const campaign: WidgetCampaign = {
    id: metrics.campaignId,
    name: metrics.campaignName ?? metrics.campaignId,
    goalAmount: metrics.goalAmount,
    raisedAmount: metrics.raisedAmount,
    treeCount: metrics.treeCount,
    createdAt: metrics.campaignCreatedAt ?? Date.now(),
    deadline: metrics.campaignDeadline,
  };
  const fundingToken = metrics.fundingToken ?? "unknown";
  campaign.fundingToken = fundingToken;
  return { campaign, cacheHit: result.cacheHit, fundingToken };
}

// ── Escaping (all values are escaped before interpolation) ───────────────────

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Sub-renderers (pure, testable) ───────────────────────────────────────────

export function renderStatTile(
  value: string,
  label: string,
  t: (typeof WIDGET_THEMES)[WidgetTheme],
  accentColor = TOKEN_COLORS[t.accent] ?? "#059669",
): string {
  return `<div class="tile">
    <div class="tile-value ${t.accent}" style="color:${accentColor}">${escapeHtml(value)}</div>
    <div class="tile-label ${t.muted}">${escapeHtml(label)}</div>
  </div>`;
}

export function renderProgressBar(
  pct: number,
  t: (typeof WIDGET_THEMES)[WidgetTheme],
  accentColor = TOKEN_COLORS[t.bar] ?? "#10b981",
): string {
  const trackColor = TOKEN_COLORS[t.barBg] ?? "#f1f5f9";
  return `<div class="track ${t.barBg}" style="background-color:${trackColor}">
    <div class="fill ${t.bar}" style="width:${pct}%;background-color:${accentColor}"></div>
  </div>`;
}

/**
 * Renders the complete widget HTML for a campaign.
 * Pure function of (campaign, theme) — no env or network access.
 */
export function renderWidgetHtml(
  campaign: WidgetCampaign,
  theme: WidgetTheme,
  colors: WidgetColors = {},
  campaignUrl: string = `/campaigns/${encodeURIComponent(campaign.id)}/donate`,
  autoTheme = false,
): string {
  const t = WIDGET_THEMES[theme];
  const themeColors = THEME_COLORS[theme];
  const accentColor = resolveWidgetColor(colors.accentColor, themeColors.accentColor);
  const backgroundColor = resolveWidgetColor(colors.backgroundColor, themeColors.backgroundColor);
  const trees = Math.max(0, campaign.treeCount);
  const impact = calculateCo2Offset(DEFAULT_SPECIES_ID, trees, campaign.createdAt);
  const pct = progressPercent(campaign);
  const remainingDays = daysRemaining(campaign.deadline);
  const currency = campaign.fundingToken ?? campaignFundingToken(campaign.sponsors);
  const currencyLabel =
    currency === "mixed"
      ? "mixed XLM/USDC"
      : currency === "unknown"
        ? "token units (currency unspecified)"
        : currency;

  const tiles = [
    renderStatTile(trees.toLocaleString(), "Trees", t, accentColor),
    renderStatTile(impact.co2PerYearTonnes.toFixed(1), "t CO₂ / yr", t, accentColor),
    renderStatTile(impact.co2Over10YearsTonnes.toFixed(1), "t CO₂ / 10 yr", t, accentColor),
  ].join("");

  const speciesLine = `${impact.speciesLabel} · ${impact.co2PerTreePerYearKg} kg CO₂/tree/yr${
    impact.co2Multiplier > 1 ? ` · ${impact.co2Multiplier}× rainy-season bonus` : ""
  }`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Fundable — Campaign Impact</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    color-scheme: ${autoTheme ? "light dark" : theme};
    background: ${backgroundColor};
    color: ${t.text === "text-slate-900" ? "#0f172a" : t.text === "text-white" ? "#ffffff" : "#ecfdf5"};
    padding: 16px;
  }
  .card { max-width: 420px; margin: 0 auto; border: 1px solid ${
    t.border === "border-slate-200" ? "#e2e8f0" : t.border === "border-slate-700" ? "#334155" : "#14532d"
  }; border-radius: 14px; padding: 18px; }
  .eyebrow { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; ${t.muted === "text-slate-500" ? "color:#64748b" : t.muted === "text-slate-400" ? "color:#94a3b8" : "color:rgba(167,243,208,0.7)"} }
  .title { margin-top: 4px; font-size: 17px; font-weight: 700; line-height: 1.35; }
  .row { display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px; }
  .track { height: 9px; border-radius: 999px; overflow: hidden; margin: 6px 0 4px; }
  .fill { height: 100%; border-radius: 999px; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 16px; }
  .tile { border: 1px solid ${
    t.border === "border-slate-200" ? "#e2e8f0" : t.border === "border-slate-700" ? "#334155" : "#14532d"
  }; border-radius: 12px; padding: 12px 6px; text-align: center; }
  .tile-value { font-size: 19px; font-weight: 800; }
  .tile-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2px; }
  .species { margin-top: 12px; font-size: 11px; ${t.muted === "text-slate-500" ? "color:#64748b" : t.muted === "text-slate-400" ? "color:#94a3b8" : "color:rgba(167,243,208,0.7)"} }
  .footer { margin-top: 14px; padding-top: 10px; border-top: 1px solid ${
    t.border === "border-slate-200" ? "#e2e8f0" : t.border === "border-slate-700" ? "#334155" : "#14532d"
  }; text-align: center; font-size: 11px; }
  .footer a { font-weight: 600; text-decoration: none; }
  .campaign-cta { display:block; margin-top:16px; padding:10px 14px; border-radius:9px; background:${accentColor}; color:#fff; text-align:center; font-size:13px; font-weight:700; text-decoration:none; }
  .live-status { margin-top:8px; text-align:center; font-size:10px; ${t.muted === "text-slate-500" ? "color:#64748b" : t.muted === "text-slate-400" ? "color:#94a3b8" : "color:rgba(167,243,208,0.7)"} }
  @media (prefers-color-scheme: dark) {
    ${autoTheme ? `
    body { background:#0f172a; color:#f8fafc; }
    .card,.tile { border-color:#334155; }
    .eyebrow,.species,.live-status { color:#94a3b8; }
    .track { background:#1e293b !important; }
    .fill,.campaign-cta { background-color:#34d399 !important; }
    .tile-value { color:#34d399 !important; }
    .campaign-cta { color:#ffffff !important; }
    ` : ""}
  }
</style>
</head>
<body>
  <div class="card">
    <div class="eyebrow">Campaign impact</div>
    <h1 class="title" id="campaign-title">${escapeHtml(campaign.name)}</h1>

    <div style="margin-top:14px">
      <div class="row">
        <span>Progress</span>
        <span id="progress-percent" style="font-weight:600">${pct}%</span>
      </div>
      <div id="progress-bar">${renderProgressBar(pct, t, accentColor)}</div>
      <div class="row">
        <span><span id="raised-amount">${escapeHtml(formatAmount(campaign.raisedAmount))}</span> <span id="funding-token">${currencyLabel}</span> raised</span>
        <span>goal <span id="goal-amount">${escapeHtml(formatAmount(campaign.goalAmount))}</span></span>
      </div>
    </div>

    <p class="live-status" id="days-remaining">${remainingDays === null ? "Funding timeline not set" : remainingDays === 0 ? "Funding deadline reached" : `${remainingDays} ${remainingDays === 1 ? "day" : "days"} remaining`}</p>

    <div class="grid">
      ${tiles}
    </div>

    <p class="species">${escapeHtml(speciesLine)}</p>

    <a class="campaign-cta" id="campaign-cta" href="${escapeHtml(campaignUrl)}" target="_blank" rel="noopener noreferrer">Back Project</a>
    <p class="footer">Powered by <a href="https://fundable.stellar" target="_blank" rel="noopener noreferrer">Fundable</a></p>
    <p class="live-status" id="live-status" aria-live="polite">Live updates enabled</p>
  </div>
  <script>
    async function refreshCampaign() {
      const status = document.getElementById("live-status");
      try {
        const response = await fetch(location.pathname + "?format=json", { cache: "no-store" });
        if (!response.ok) throw new Error("Campaign data unavailable");
        const data = await response.json();
        document.getElementById("campaign-title").textContent = data.title;
        document.getElementById("progress-percent").textContent = data.progressPercent + "%";
        document.querySelector("#progress-bar .fill").style.width = data.progressPercent + "%";
        document.getElementById("raised-amount").textContent = data.raisedAmount;
        document.getElementById("goal-amount").textContent = data.goalAmount;
        document.getElementById("funding-token").textContent = data.fundingTokenLabel;
        document.getElementById("days-remaining").textContent = data.daysRemaining === null
          ? "Funding timeline not set"
          : data.daysRemaining === 0 ? "Funding deadline reached"
          : data.daysRemaining + (data.daysRemaining === 1 ? " day remaining" : " days remaining");
        document.getElementById("campaign-cta").href = data.campaignUrl;
        status.textContent = "Live updates enabled";
      } catch {
        status.textContent = "Live updates temporarily unavailable";
      }
    }
    window.setInterval(refreshCampaign, 15000);
  </script>
</body>
</html>`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(request.url);
  if (!CAMPAIGN_ID_PATTERN.test(id)) {
    return new Response("Invalid campaign identifier.", {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const themeParam = url.searchParams.get("theme") ?? undefined;
  const theme = resolveWidgetTheme(themeParam);
  const colors = resolveWidgetColors(theme, url.searchParams);
  const autoTheme = themeParam === undefined || themeParam === "auto";
  const embedTheme: WidgetEmbedTheme = autoTheme ? "auto" : theme;
  const embedColors = {
    accentColor: url.searchParams.has("color") ? colors.accentColor : undefined,
    backgroundColor: url.searchParams.has("background") ? colors.backgroundColor : undefined,
  };

  let campaign: WidgetCampaign;
  let cacheHit: boolean;
  let fundingToken: "XLM" | "USDC" | "mixed" | "unknown";
  try {
    ({ campaign, cacheHit, fundingToken } = await getWidgetCampaign(id));
  } catch (error) {
    if (error instanceof Error && error.message === `Campaign ${id} not found`) {
      return new Response(
        "<!doctype html><html lang=\"en\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Campaign unavailable</title><body style=\"font:16px system-ui;padding:24px;color:#475569\">This campaign could not be found.</body></html>",
        { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } },
      );
    }
    console.error(`[campaign-widget] Could not load campaign ${id}`, error);
    return new Response(
      "<!doctype html><html lang=\"en\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Widget unavailable</title><body style=\"font:16px system-ui;padding:24px;color:#475569\">Campaign progress is temporarily unavailable. Please try again shortly.</body></html>",
      { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
  const campaignUrl = new URL(`/campaigns/${encodeURIComponent(campaign.id)}/donate`, url.origin).toString();

  // ?format=meta → JSON metadata + copy-paste snippet for campaign owners.
  if (url.searchParams.get("format") === "meta") {
    return Response.json(
      {
        campaignId: id,
        theme: embedTheme,
        iframeSrc: widgetIframeSrc(id, url.origin, embedTheme, embedColors),
        minHeight: WIDGET_IFRAME_MIN_HEIGHT,
        snippet: buildEmbedSnippet(id, url.origin, embedTheme, embedColors),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  if (url.searchParams.get("format") === "json") {
    const pct = progressPercent(campaign);
    return Response.json(
      {
        title: campaign.name,
        progressPercent: pct,
        raisedAmount: formatAmount(campaign.raisedAmount),
        goalAmount: formatAmount(campaign.goalAmount),
        fundingToken,
        fundingTokenLabel:
          fundingToken === "mixed"
            ? "mixed XLM/USDC"
            : fundingToken === "unknown"
              ? "token units (currency unspecified)"
              : fundingToken,
        daysRemaining: daysRemaining(campaign.deadline),
        campaignUrl,
      },
      {
        headers: {
          "Cache-Control": "public, max-age=15, stale-while-revalidate=15",
          "X-Cache": cacheHit ? "HIT" : "MISS",
        },
      },
    );
  }

  const html = renderWidgetHtml(campaign, theme, colors, campaignUrl, autoTheme);

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=15, s-maxage=15, stale-while-revalidate=15",
      "X-Cache": cacheHit ? "HIT" : "MISS",
      // Note: no X-Frame-Options / CSP frame-ancestors is set here on purpose —
      // absence is what allows any external site to embed this endpoint.
    },
  });
}
