import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, renderWidgetHtml, renderStatTile, renderProgressBar } from "./route";
import {
  InMemoryCampaignDataSource,
  setCampaignDataSource,
  type CampaignRecord,
} from "@/services/campaign.service";
import { WIDGET_THEMES } from "@/lib/widget-theme";
import { campaignProgressCache } from "@/services/campaign-progress-cache.service";
import { donationService } from "@/services/campaign-donation.service";

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
  campaignProgressCache.clear();
  donationService.reset();
  setCampaignDataSource(new InMemoryCampaignDataSource());
});

afterEach(() => {
  vi.restoreAllMocks();
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

  it("shows funding currency, deadline, and a direct back-project action", () => {
    const html = renderWidgetHtml(
      campaign({
        deadline: Math.floor(Date.now() / 1000) + 86_400,
        sponsors: [{ id: "s1", campaignId: "c1", address: "G", amount: "10", token: "XLM", sponsoredAt: 1 }],
      }),
      "light",
    );
    expect(html).toContain("XLM</span> raised");
    expect(html).toContain("1 day remaining");
    expect(html).toContain(">Back Project</a>");
    expect(html).toContain("/campaigns/campaign-w1/donate");
  });

  it("does not assign a single currency to mixed or unknown campaign totals", () => {
    const mixed = renderWidgetHtml(
      campaign({
        sponsors: [
          { id: "s1", campaignId: "campaign-w1", address: "G1", amount: "10", token: "XLM", sponsoredAt: 1 },
          { id: "s2", campaignId: "campaign-w1", address: "G2", amount: "20", token: "USDC", sponsoredAt: 2 },
        ],
      }),
      "light",
    );
    expect(mixed).toContain('id="funding-token">mixed XLM/USDC</span> raised');

    const unknown = renderWidgetHtml(campaign(), "light");
    expect(unknown).toContain('id="funding-token">token units (currency unspecified)</span> raised');
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

  it("rejects malformed campaign identifiers", async () => {
    const res = await GET(new Request("https://app.test/api/campaigns/../widget"), {
      params: Promise.resolve({ id: "../" }),
    });
    expect(res.status).toBe(400);
  });

  it("honors ?theme= and ?format=meta", async () => {
    await seedCampaign(campaign());

    const themed = await GET(
      new Request("https://app.test/api/campaigns/campaign-w1/widget?theme=forest"),
      { params: Promise.resolve({ id: "campaign-w1" }) },
    );
    expect(await themed.text()).toContain("#0b1f16");

    const dark = await GET(
      new Request("https://app.test/api/campaigns/campaign-w1/widget?theme=dark"),
      { params: Promise.resolve({ id: "campaign-w1" }) },
    );
    expect(await dark.text()).toContain("#0f172a");

    const meta = await GET(
      new Request("https://app.test/api/campaigns/campaign-w1/widget?format=meta"),
      { params: Promise.resolve({ id: "campaign-w1" }) },
    );
    expect(meta.headers.get("Content-Type")).toContain("application/json");
    const body = await meta.json();
    expect(body.iframeSrc).toContain("/api/campaigns/campaign-w1/widget?theme=auto");
    expect(body.snippet).toContain("<iframe");
  });

  it("uses the cached progress snapshot for repeat widget and poll requests", async () => {
    await seedCampaign(campaign({
      deadline: 1_700_086_400,
      sponsors: [{ id: "s1", campaignId: "campaign-w1", address: "G", amount: "10", token: "XLM", sponsoredAt: 1 }],
    }));
    const first = await GET(
      new Request("https://app.test/api/campaigns/campaign-w1/widget"),
      { params: Promise.resolve({ id: "campaign-w1" }) },
    );
    const second = await GET(
      new Request("https://app.test/api/campaigns/campaign-w1/widget?format=json"),
      { params: Promise.resolve({ id: "campaign-w1" }) },
    );
    expect(first.headers.get("X-Cache")).toBe("MISS");
    expect(second.headers.get("X-Cache")).toBe("HIT");
    expect(await second.json()).toMatchObject({
      fundingToken: "XLM",
      fundingTokenLabel: "XLM",
      campaignUrl: "https://app.test/campaigns/campaign-w1/donate",
    });
  });

  it("reports mixed sponsorship currencies in the cached widget response", async () => {
    await seedCampaign(campaign({
      sponsors: [
        { id: "s1", campaignId: "campaign-w1", address: "G1", amount: "10", token: "XLM", sponsoredAt: 1 },
        { id: "s2", campaignId: "campaign-w1", address: "G2", amount: "20", token: "USDC", sponsoredAt: 2 },
      ],
    }));
    const response = await GET(
      new Request("https://app.test/api/campaigns/campaign-w1/widget?format=json"),
      { params: Promise.resolve({ id: "campaign-w1" }) },
    );
    expect(await response.json()).toMatchObject({
      fundingToken: "mixed",
      fundingTokenLabel: "mixed XLM/USDC",
    });
  });

  it("uses the per-token donation summary to identify mixed currency totals", async () => {
    await seedCampaign(campaign());
    vi.spyOn(donationService, "getSummary").mockReturnValue({
      campaignId: "campaign-w1",
      donationCount: 2,
      totalsByToken: { XLM: "25", USDC: "30" },
    });

    const response = await GET(
      new Request("https://app.test/api/campaigns/campaign-w1/widget?format=json"),
      { params: Promise.resolve({ id: "campaign-w1" }) },
    );
    expect(await response.json()).toMatchObject({
      fundingToken: "mixed",
      fundingTokenLabel: "mixed XLM/USDC",
    });
  });

  it("returns an explicit embeddable error document when campaign lookup fails", async () => {
    vi.spyOn(campaignProgressCache, "getOrFetch").mockRejectedValue(new Error("RPC unavailable"));
    const response = await GET(
      new Request("https://app.test/api/campaigns/campaign-w1/widget"),
      { params: Promise.resolve({ id: "campaign-w1" }) },
    );
    expect(response.status).toBe(500);
    expect(await response.text()).toContain("temporarily unavailable");
  });
});
