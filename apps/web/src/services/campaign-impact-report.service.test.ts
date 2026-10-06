import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildCampaignImpactReportPdf, type CampaignImpactReportInput, type SpeciesBreakdownEntry } from "./campaign-impact-report.service";
import type { CampaignRecord, SponsorRecord } from "./campaign.service";

function makeSponsor(overrides: Partial<SponsorRecord> = {}): SponsorRecord {
  return {
    id: "sp-1",
    campaignId: "camp-1",
    address: "GBUQWP3BOUZX34ULNQG23RQ6F4BFSRTNAQYI5EJGKZOJE7D5JUDPOEQ",
    amount: "50000000",
    token: "XLM",
    sponsoredAt: 1700000000000,
    ...overrides,
  };
}

function makeCampaign(overrides: Partial<CampaignRecord> = {}): CampaignRecord {
  return {
    id: "camp-1",
    creator: "GCREATOR",
    name: "Amazon Rainforest Reserve",
    description: "Protecting primary rainforest",
    location: "Amazonas, Brazil",
    speciesId: "oak",
    species: "Oak",
    status: "ACTIVE",
    goalAmount: "1000000000",
    raisedAmount: "500000000",
    sponsorCount: 2,
    treeCount: 1000,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    statusChangedAt: 1700000000000,
    sponsors: [makeSponsor(), makeSponsor({ id: "sp-2", address: "GSECOND", amount: "25000000" })],
    statusHistory: [],
    ...overrides,
  } as CampaignRecord;
}

async function loadPdf(bytes: Uint8Array): Promise<PDFDocument> {
  return PDFDocument.load(bytes);
}

describe("buildCampaignImpactReportPdf (#849)", () => {
  it("returns a valid, non-empty PDF", async () => {
    const input: CampaignImpactReportInput = { campaign: makeCampaign() };
    const bytes = await buildCampaignImpactReportPdf(input);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");

    const doc = await loadPdf(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("sets PDF title metadata from campaign name", async () => {
    const campaign = makeCampaign({ name: "Test Campaign XYZ" });
    const bytes = await buildCampaignImpactReportPdf({ campaign });
    const doc = await loadPdf(bytes);
    expect(doc.getTitle()).toContain("Test Campaign XYZ");
    expect(doc.getTitle()).toContain("Impact Report");
    expect(doc.getAuthor()).toBe("Fundable Protocol");
  });

  it("produces a multi-page PDF when many sponsors exceed one page", async () => {
    const manySponsors = Array.from({ length: 300 }, (_, i) =>
      makeSponsor({ id: `sp-${i}`, address: `GSPONSOR${i}` }),
    );
    const bytes = await buildCampaignImpactReportPdf({
      campaign: makeCampaign({ sponsors: manySponsors, sponsorCount: 300 }),
    });
    const doc = await loadPdf(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });

  it("handles campaign with zero trees without error", async () => {
    const bytes = await buildCampaignImpactReportPdf({
      campaign: makeCampaign({ treeCount: 0, speciesId: undefined, species: undefined, co2SequestrationKg: undefined }),
    });
    const doc = await loadPdf(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("handles campaign with no sponsors", async () => {
    const bytes = await buildCampaignImpactReportPdf({
      campaign: makeCampaign({ sponsors: [], sponsorCount: 0 }),
    });
    const doc = await loadPdf(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("accepts explicit speciesBreakdown without error", async () => {
    const breakdown: SpeciesBreakdownEntry[] = [
      { species: "Oak", count: 600, co2KgPerYear: 12600 },
      { species: "Pine", count: 400, co2KgPerYear: 7200 },
    ];
    const bytes = await buildCampaignImpactReportPdf({
      campaign: makeCampaign({ treeCount: 1000 }),
      speciesBreakdown: breakdown,
    });
    const doc = await loadPdf(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("accepts mixed-species fallback without error", async () => {
    const bytes = await buildCampaignImpactReportPdf({
      campaign: makeCampaign({ treeCount: 500, speciesId: undefined, species: undefined, co2SequestrationKg: undefined }),
    });
    const doc = await loadPdf(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("accepts embedded location map image", async () => {
    // 1x1 red PNG
    const pngBytes = Uint8Array.from(atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    ), (c) => c.charCodeAt(0));
    const bytes = await buildCampaignImpactReportPdf({
      campaign: makeCampaign(),
      locationMapBytes: pngBytes,
      locationMapFormat: "png",
    });
    const doc = await loadPdf(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("produces valid PDF for campaign with location set", async () => {
    const bytes = await buildCampaignImpactReportPdf({
      campaign: makeCampaign({ location: "Lagos, Nigeria" }),
    });
    const doc = await loadPdf(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });
});
