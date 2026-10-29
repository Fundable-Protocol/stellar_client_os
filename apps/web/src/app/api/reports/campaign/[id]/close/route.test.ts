import { describe, expect, it, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  createCampaign,
  InMemoryCampaignDataSource,
  setCampaignDataSource,
  type CampaignRecord,
} from "@/services/campaign.service";
import { clearImpactReportStore } from "@/services/automated-campaign-impact-report.service";
import { GET, POST } from "./route";

function makeRequest(url: string, method = "GET", body?: unknown): NextRequest {
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new NextRequest(new URL(url, "http://localhost:3000"), init);
}

describe("/api/reports/campaign/[id]/close route", () => {
  let dataSource: InMemoryCampaignDataSource;

  beforeEach(async () => {
    clearImpactReportStore();
    dataSource = new InMemoryCampaignDataSource();
    setCampaignDataSource(dataSource);

    await createCampaign({
      id: "close-test-camp",
      creator: "GCREATOR_TEST",
      creatorEmail: "creator@test.com",
      name: "Close Test Campaign",
      status: "COMPLETED",
      goalAmount: "50000",
      raisedAmount: "50000",
      treeCount: 250,
      sponsorCount: 5,
    } as Partial<CampaignRecord>, dataSource);
  });

  it("POST triggers report generation and returns success", async () => {
    const response = await POST(
      makeRequest("/api/reports/campaign/close-test-camp/close", "POST"),
      { params: Promise.resolve({ id: "close-test-camp" }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.report.campaignId).toBe("close-test-camp");
    expect(body.report.publicUrl).toBe("/campaigns/close-test-camp/impact-report");
  });

  it("GET returns generated impact report metadata", async () => {
    // Generate first
    await POST(
      makeRequest("/api/reports/campaign/close-test-camp/close", "POST"),
      { params: Promise.resolve({ id: "close-test-camp" }) },
    );

    const response = await GET(
      makeRequest("/api/reports/campaign/close-test-camp/close"),
      { params: Promise.resolve({ id: "close-test-camp" }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.campaignId).toBe("close-test-camp");
    expect(body.campaignPerformance).toBeDefined();
    expect(body.publicShareUrl).toContain("/campaigns/close-test-camp/impact-report");
  });

  it("GET returns 404 for non-existent campaign", async () => {
    const response = await GET(
      makeRequest("/api/reports/campaign/non-existent/close"),
      { params: Promise.resolve({ id: "non-existent" }) },
    );
    expect(response.status).toBe(404);
  });
});
