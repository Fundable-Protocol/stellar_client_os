import { beforeEach, describe, expect, it } from "vitest";

import {
  createCampaign,
  InMemoryCampaignDataSource,
  setCampaignDataSource,
} from "@/services/campaign.service";
import { backersService } from "@/services/campaign-backers.service";
import { GET } from "./route";

const CAMPAIGN_ID = "route-export-campaign";

async function seedCampaign() {
  const dataSource = new InMemoryCampaignDataSource();
  setCampaignDataSource(dataSource);
  backersService.reset();

  const campaign = await createCampaign(
    {
      id: CAMPAIGN_ID,
      creator: "GCREATOR",
      name: "Coastal Mangroves",
      goalAmount: "10000",
    },
    dataSource,
  );
  await dataSource.saveCampaign({
    ...campaign,
    status: "ACTIVE",
    raisedAmount: "1500",
    sponsorCount: 2,
    sponsors: [
      {
        id: "sponsor-1",
        campaignId: CAMPAIGN_ID,
        address: "GBACKER1",
        amount: "1000",
        token: "XLM",
        sponsoredAt: Date.UTC(2026, 7, 1),
      },
      {
        id: "sponsor-2",
        campaignId: CAMPAIGN_ID,
        address: "GBACKER2",
        amount: "500",
        token: "XLM",
        sponsoredAt: Date.UTC(2026, 7, 2),
      },
    ],
  });
}

function request(path: string): Request {
  return new Request(`http://localhost${path}`);
}

function context(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/campaigns/:id/export", () => {
  beforeEach(async () => {
    await seedCampaign();
  });

  it("returns the full backer CSV", async () => {
    const response = await GET(
      request(`/api/campaigns/${CAMPAIGN_ID}/export?report=backers&format=csv`),
      context(CAMPAIGN_ID),
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/csv");
    expect(response.headers.get("Content-Disposition")).toContain(
      `fundable-campaign-${CAMPAIGN_ID}-backers`,
    );
    expect(body.split("\n")[0]).toContain("backer_address");
    expect(body).toContain("GBACKER1");
    expect(body).toContain("1000");
    expect(body).toContain("TIER_4");
  });

  it("returns a PDF analytics report", async () => {
    const response = await GET(
      request(`/api/campaigns/${CAMPAIGN_ID}/export?report=analytics&format=pdf`),
      context(CAMPAIGN_ID),
    );
    const bytes = new Uint8Array(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toContain(
      `fundable-campaign-${CAMPAIGN_ID}`,
    );
    expect(new TextDecoder().decode(bytes.slice(0, 8))).toBe("%PDF-1.7");
    expect(bytes.byteLength).toBeGreaterThan(1_000);
  });

  it("keeps the original sponsor CSV export working", async () => {
    const response = await GET(
      request(`/api/campaigns/${CAMPAIGN_ID}/export?report=sponsors&format=csv`),
      context(CAMPAIGN_ID),
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("sponsor");
  });

  it("returns 404 for unknown campaigns", async () => {
    const response = await GET(
      request("/api/campaigns/missing/export?report=backers&format=csv"),
      context("missing"),
    );

    expect(response.status).toBe(404);
  });

  it("rejects unsupported formats and analytics CSV", async () => {
    const invalid = await GET(
      request(`/api/campaigns/${CAMPAIGN_ID}/export?format=xlsx`),
      context(CAMPAIGN_ID),
    );
    expect(invalid.status).toBe(400);

    const analyticsCsv = await GET(
      request(`/api/campaigns/${CAMPAIGN_ID}/export?report=analytics&format=csv`),
      context(CAMPAIGN_ID),
    );
    expect(analyticsCsv.status).toBe(400);
  });
});
