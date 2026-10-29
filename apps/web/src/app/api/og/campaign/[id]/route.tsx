import { ImageResponse } from "next/og";
import { CAMPAIGN_OG_CACHE_SECONDS } from "@/lib/campaign-og";
import { loadCampaignOgMetrics } from "@/services/campaign-og-image.service";

export const runtime = "edge";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const metrics = await loadCampaignOgMetrics(request, id);
  if (!metrics) {
    return new Response("Campaign not found", { status: 404 });
  }

  const barWidth = Math.max(4, Math.min(100, metrics.fundedPercent));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "56px 64px",
          background: "linear-gradient(135deg, #022c22 0%, #064e3b 45%, #0f172a 100%)",
          color: "#ecfdf5",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <img
            src={metrics.creatorAvatarUrl}
            alt=""
            width={88}
            height={88}
            style={{ borderRadius: 9999, border: "4px solid #34d399" }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 22, color: "#a7f3d0" }}>{metrics.creatorName}</div>
            <div style={{ fontSize: 42, fontWeight: 700, lineHeight: 1.15, maxWidth: 900 }}>
              {metrics.title.length > 72 ? `${metrics.title.slice(0, 69)}…` : metrics.title}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 28, fontWeight: 600 }}>
            <span>{metrics.fundedPercent}% funded</span>
            <span style={{ color: "#6ee7b7" }}>{metrics.daysLeftLabel}</span>
          </div>
          <div
            style={{
              width: "100%",
              height: 28,
              borderRadius: 9999,
              background: "rgba(255,255,255,0.15)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${barWidth}%`,
                height: "100%",
                borderRadius: 9999,
                background: "linear-gradient(90deg, #34d399, #10b981)",
              }}
            />
          </div>
          <div style={{ fontSize: 22, color: "#d1fae5" }}>
            {metrics.raisedAmount} raised · goal {metrics.goalAmount}
          </div>
        </div>

        <div style={{ fontSize: 20, color: "#6ee7b7", letterSpacing: 2, textTransform: "uppercase" }}>
          Fundable · Stellar reforestation
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        "Cache-Control": `public, max-age=0, s-maxage=${CAMPAIGN_OG_CACHE_SECONDS}, stale-while-revalidate=${CAMPAIGN_OG_CACHE_SECONDS * 2}`,
      },
    },
  );
}
