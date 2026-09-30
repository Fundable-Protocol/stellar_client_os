import { calculateCo2Offset } from "@/lib/co2-impact";
import {
  resolveWidgetTheme,
  progressPercent,
  WIDGET_THEMES,
  type WidgetTheme,
} from "@/lib/widget-theme";
import { getCampaign } from "@/services/campaign.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_SPECIES_ID = "oak";

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
): string {
  return `<div class="tile">
    <div class="tile-value ${t.accent}">${escapeHtml(value)}</div>
    <div class="tile-label ${t.muted}">${escapeHtml(label)}</div>
  </div>`;
}

export function renderProgressBar(pct: number, t: (typeof WIDGET_THEMES)[WidgetTheme]): string {
  return `<div class="track ${t.barBg}">
    <div class="fill ${t.bar}" style="width:${pct}%"></div>
  </div>`;
}

/**
 * Renders the complete widget HTML for a campaign.
 * Pure function of (campaign, theme) — no env or network access.
 */
export function renderWidgetHtml(
  campaign: NonNullable<Awaited<ReturnType<typeof getCampaign>>>,
  theme: WidgetTheme,
): string {
  const t = WIDGET_THEMES[theme];
  const trees = Math.max(0, campaign.treeCount);
  const impact = calculateCo2Offset(DEFAULT_SPECIES_ID, trees, campaign.createdAt);
  const pct = progressPercent(campaign);

  const tiles = [
    renderStatTile(trees.toLocaleString(), "Trees", t),
    renderStatTile(impact.co2PerYearTonnes.toFixed(1), "t CO₂ / yr", t),
    renderStatTile(impact.co2Over10YearsTonnes.toFixed(1), "t CO₂ / 10 yr", t),
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
    background: ${t.bg === "bg-white" ? "#ffffff" : t.bg === "bg-slate-900" ? "#0f172a" : "#0b1f16"};
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
</style>
</head>
<body>
  <div class="card">
    <div class="eyebrow">Campaign impact</div>
    <h1 class="title">${escapeHtml(campaign.name)}</h1>

    <div style="margin-top:14px">
      <div class="row">
        <span>Progress</span>
        <span style="font-weight:600">${pct}%</span>
      </div>
      ${renderProgressBar(pct, t)}
      <div class="row">
        <span>${escapeHtml(campaign.raisedAmount)} raised</span>
        <span>goal ${escapeHtml(campaign.goalAmount)}</span>
      </div>
    </div>

    <div class="grid">
      ${tiles}
    </div>

    <p class="species">${escapeHtml(speciesLine)}</p>

    <p class="footer">Powered by <a href="https://fundable.stellar" target="_blank" rel="noopener noreferrer">Fundable</a></p>
  </div>
</body>
</html>`;
}

import {
  buildEmbedSnippet,
  widgetIframeSrc,
  WIDGET_IFRAME_MIN_HEIGHT,
} from "@/lib/widget-theme";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(request.url);

  const campaign = await getCampaign(id);
  if (!campaign) {
    return new Response("Campaign not found.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const themeParam = url.searchParams.get("theme") ?? undefined;
  const theme = resolveWidgetTheme(themeParam);

  // ?format=meta → JSON metadata + copy-paste snippet for campaign owners.
  if (url.searchParams.get("format") === "meta") {
    return Response.json(
      {
        campaignId: id,
        theme,
        iframeSrc: widgetIframeSrc(id, url.origin, theme),
        minHeight: WIDGET_IFRAME_MIN_HEIGHT,
        snippet: buildEmbedSnippet(id, url.origin, theme),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const html = renderWidgetHtml(campaign, theme);

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
      // Note: no X-Frame-Options / CSP frame-ancestors is set here on purpose —
      // absence is what allows any external site to embed this endpoint.
    },
  });
}
