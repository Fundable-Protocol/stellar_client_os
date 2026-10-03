import { describe, expect, it, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { PDFDocument } from "pdf-lib";
import { createCampaign, InMemoryCampaignDataSource, setCampaignDataSource, type CampaignRecord } from "@/services/campaign.service";
import { GET } from "./route";

function makeRequest(url: string): NextRequest {
  return new NextRequest(new URL(url, "http://localhost"));
}

describe("GET /api/reports/campaign/[id] (#849)", () => {
  let dataSource: InMemoryCampaignDataSource;

  beforeEach(async () => {
    dataSource = new InMemoryCampaignDataSource();
    setCampaignDataSource(dataSource);
    await createCampaign({
      id: "impact-camp",
      creator: "GCREATOR",
      name: "Test Impact Campaign",
      location: "Lagos, Nigeria",
      speciesId: "mangrove",
      status: "ACTIVE",
      goalAmount: "1000000000",
      raisedAmount: "400000000",
      treeCount: 800,
      sponsorCount: 1,
      sponsors: [{
        id: "sp-1",
        campaignId: "impact-camp",
        address: "GSPONSORADDR",
        amount: "40000000",
        token: "XLM",
        sponsoredAt: 1700000000000,
      }],
    } as Partial<CampaignRecord>, dataSource);
  });

  it("returns a PDF attachment for a valid campaign", async () => {
    const response = await GET(makeRequest("/api/reports/campaign/impact-camp"), {
      params: Promise.resolve({ id: "impact-camp" }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain("attachment");
    expect(response.headers.get("content-disposition")).toContain(".pdf");
    expect(response.headers.get("cache-control")).toBe("private, no-store");

    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");

    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("returns 404 for a nonexistent campaign", async () => {
    const response = await GET(makeRequest("/api/reports/campaign/missing"), {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("Campaign not found");
  });

  it("returns 400 for invalid speciesBreakdown JSON", async () => {
    const response = await GET(
      makeRequest("/api/reports/campaign/impact-camp?speciesBreakdown=not-json"),
      { params: Promise.resolve({ id: "impact-camp" }) },
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("speciesBreakdown");
  });

  it("accepts a valid speciesBreakdown query param", async () => {
    const breakdown = encodeURIComponent(JSON.stringify([
      { species: "Mangrove", count: 800, co2KgPerYear: 22400 },
    ]));
    const response = await GET(
      makeRequest(`/api/reports/campaign/impact-camp?speciesBreakdown=${breakdown}`),
      { params: Promise.resolve({ id: "impact-camp" }) },
    );
    expect(response.status).toBe(200);
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("auto-derives species breakdown from campaign speciesId", async () => {
    const response = await GET(makeRequest("/api/reports/campaign/impact-camp"), {
      params: Promise.resolve({ id: "impact-camp" }),
    });
    expect(response.status).toBe(200);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(doc.getTitle()).toContain("Test Impact Campaign");
  });

  it("derives species from co2SequestrationKg when speciesId is absent", async () => {
    await createCampaign({
      id: "co2-camp",
      creator: "GCREATOR",
      name: "CO2 Campaign",
      status: "ACTIVE",
      goalAmount: "1000000000",
      raisedAmount: "100000000",
      treeCount: 300,
      co2SequestrationKg: "6300",
      sponsorCount: 0,
      sponsors: [],
    } as Partial<CampaignRecord>, dataSource);

    const response = await GET(makeRequest("/api/reports/campaign/co2-camp"), {
      params: Promise.resolve({ id: "co2-camp" }),
    });
    expect(response.status).toBe(200);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(doc.getTitle()).toContain("CO2 Campaign");
  });
});
