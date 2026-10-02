import { beforeEach, describe, expect, it } from "vitest";
import { GET, renderWidgetHtml, renderStatTile, renderProgressBar } from "./route";
import {
  InMemoryCampaignDataSource,
  setCampaignDataSource,
  type CampaignRecord,
} from "@/services/campaign.service";
import { WIDGET_THEMES } from "@/lib/widget-theme";

const campaign = (overrides: Partial<CampaignRecord> = {}): CampaignRecord => ({
  id: "campaign-w1",
  creator: "creator-1",
  name: "Mangrove restoration",
  status: "ACTIVE",
  goalAmount: "1000",
  raisedAmount: "250",
  sponsorCount: 1,
  treeCount: 10,
  createdAt: 1_000,
  updatedAt: 1_000,
  statusChangedAt: 1_000,
  sponsors: [],
  statusHistory: [],
  ...overrides,
});

beforeEach(() => {
  setCampaignDataSource(new InMemoryCampaignDataSource());
});

async function seedCampaign(record: CampaignRecord) {
  const source = new InMemoryCampaignDataSource();
  await source.saveCampaign(record);
  setCampaignDataSource(source);
}

describe("renderWidgetHtml (pure)", () => {
  it("escapes the campaign name", () => {
    const html = renderWidgetHtml(campaign({ name: "<script>x</script>" }), "light");
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;x&lt;/script&gt;");
  });

  it("shows tree count and CO2 figures", () => {
    const html = renderWidgetHtml(campaign({ treeCount: 100 }), "light");
    expect(html).toContain("100");
    expect(html).toContain("t CO₂ / yr");
    expect(html).toContain("t CO₂ / 10 yr");
    expect(html).toContain("Oak");
  });

  it("switches palettes by theme", () => {
    expect(renderWidgetHtml(campaign(), "light")).toContain("#ffffff");
    expect(renderWidgetHtml(campaign(), "dark")).toContain("#0f172a");
    expect(renderWidgetHtml(campaign(), "forest")).toContain("#0b1f16");
  });

  it("clamps progress at 100%", () => {
    const html = renderWidgetHtml(
      campaign({ goalAmount: "100", raisedAmount: "999999" }),
      "light",
    );
    expect(html).toContain("100%");
  });
});

describe("renderStatTile / renderProgressBar", () => {
  it("escapes tile values", () => {
    const tile = renderStatTile("<b>1</b>", "label", WIDGET_THEMES.light);
    expect(tile).not.toContain("<b>");
  });

  it("renders fill width from pct", () => {
    expect(renderProgressBar(42, WIDGET_THEMES.light)).toContain("width:42%");
  });
});

describe("GET /api/campaigns/[id]/widget", () => {
  it("200s with text/html for an existing campaign", async () => {
    await seedCampaign(campaign());
    const res = await GET(new Request("https://app.test/api/campaigns/campaign-w1/widget"), {
      params: Promise.resolve({ id: "campaign-w1" }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    // Absence of X-Frame-Options is what makes the endpoint embeddable.
    expect(res.headers.get("X-Frame-Options")).toBeNull();
    expect(await res.text()).toContain("Mangrove restoration");
  });

  it("404s for unknown campaigns", async () => {
    const res = await GET(new Request("https://app.test/api/campaigns/ghost/widget"), {
      params: Promise.resolve({ id: "ghost" }),
    });
    expect(res.status).toBe(404);
  });

  it("honors ?theme= and ?format=meta", async () => {
    await seedCampaign(campaign());

    const themed = await GET(
      new Request("https://app.test/api/campaigns/campaign-w1/widget?theme=forest"),
      { params: Promise.resolve({ id: "campaign-w1" }) },
    );
    expect(await themed.text()).toContain("#0b1f16");

    const meta = await GET(
      new Request("https://app.test/api/campaigns/campaign-w1/widget?format=meta"),
      { params: Promise.resolve({ id: "campaign-w1" }) },
    );
    expect(meta.headers.get("Content-Type")).toContain("application/json");
    const body = await meta.json();
    expect(body.iframeSrc).toContain("/api/campaigns/campaign-w1/widget?theme=light");
    expect(body.snippet).toContain("<iframe");
  });
});
