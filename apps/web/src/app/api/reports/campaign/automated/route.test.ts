import { describe, expect, it, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  createCampaign,
  InMemoryCampaignDataSource,
  setCampaignDataSource,
  type CampaignRecord,
} from "@/services/campaign.service";
import { clearImpactReportStore } from "@/services/automated-campaign-impact-report.service";
import { POST, GET } from "./route";

function makeRequest(url: string, method = "POST"): NextRequest {
  return new NextRequest(new URL(url, "http://localhost:3000"), { method });
}

describe("/api/reports/campaign/automated route", () => {
  let dataSource: InMemoryCampaignDataSource;

  beforeEach(async () => {
    clearImpactReportStore();
    dataSource = new InMemoryCampaignDataSource();
    setCampaignDataSource(dataSource);

    const now = Date.now();
    await createCampaign({
      id: "auto-batch-camp",
      creator: "GCREATOR_BATCH",
      creatorEmail: "batch@test.com",
      name: "Batch Auto Test Campaign",
      status: "COMPLETED",
      statusChangedAt: now - 3600000, // 1 hour ago (within 24h)
      goalAmount: "20000",
      raisedAmount: "20000",
      treeCount: 100,
      sponsorCount: 3,
    } as Partial<CampaignRecord>, dataSource);
  });

  it("POST triggers batch generation for campaigns closed within 24 hours", async () => {
    const response = await POST(makeRequest("/api/reports/campaign/automated"));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.generatedCount).toBeGreaterThanOrEqual(1);
    expect(body.reports.some((r: { campaignId: string }) => r.campaignId === "auto-batch-camp")).toBe(true);
  });

  it("GET also triggers the automated report generation handler", async () => {
    const response = await GET(makeRequest("/api/reports/campaign/automated", "GET"));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
  });
});
