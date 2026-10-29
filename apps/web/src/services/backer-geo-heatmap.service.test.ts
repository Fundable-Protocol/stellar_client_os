import { beforeEach, describe, expect, it } from "vitest";
import { BackerGeoHeatMapService } from "./backer-geo-heatmap.service";

const CAMPAIGN_ID = "camp-geo-001";

function makeEvent(overrides: Partial<Parameters<BackerGeoHeatMapService["recordPledgeEvent"]>[0]> = {}) {
  return {
    campaignId: CAMPAIGN_ID,
    countryCode: "US",
    countryName: "United States",
    pledgedXlm: "100 XLM",
    pledgedAt: "2026-10-01T10:00:00Z",
    ...overrides,
  };
}

describe("BackerGeoHeatMapService (#1339)", () => {
  let service: BackerGeoHeatMapService;

  beforeEach(() => {
    service = new BackerGeoHeatMapService();
  });

  // ---------------------------------------------------------------------------
  // Ingestion validation
  // ---------------------------------------------------------------------------

  it("records a pledge event successfully", () => {
    expect(() => service.recordPledgeEvent(makeEvent())).not.toThrow();
    const result = service.getHeatMap(CAMPAIGN_ID);
    expect(result.totalBackers).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].countryCode).toBe("US");
    expect(result.data[0].backerCount).toBe(1);
  });

  it("normalises country code to uppercase", () => {
    service.recordPledgeEvent(makeEvent({ countryCode: "ng" }));
    const result = service.getHeatMap(CAMPAIGN_ID);
    expect(result.data[0].countryCode).toBe("NG");
  });

  it("rejects invalid country codes", () => {
    expect(() => service.recordPledgeEvent(makeEvent({ countryCode: "USA" }))).toThrow("ISO 3166-1 alpha-2");
    expect(() => service.recordPledgeEvent(makeEvent({ countryCode: "" }))).toThrow("ISO 3166-1 alpha-2");
  });

  it("rejects missing countryName", () => {
    expect(() => service.recordPledgeEvent(makeEvent({ countryName: "" }))).toThrow("countryName is required");
  });

  // ---------------------------------------------------------------------------
  // Aggregation
  // ---------------------------------------------------------------------------

  it("aggregates multiple backers from the same country", () => {
    service.recordPledgeEvent(makeEvent({ pledgedXlm: "50 XLM" }));
    service.recordPledgeEvent(makeEvent({ pledgedXlm: "150 XLM" }));
    const result = service.getHeatMap(CAMPAIGN_ID);
    expect(result.data[0].backerCount).toBe(2);
    // 50 + 150 = 200 XLM -> 200_000_000 stroops
    expect(result.data[0].totalPledgedXlm).toBe("200000000");
    expect(result.totalBackers).toBe(2);
  });

  it("sorts countries by backer count descending", () => {
    service.recordPledgeEvent(makeEvent({ countryCode: "NG", countryName: "Nigeria" }));
    service.recordPledgeEvent(makeEvent({ countryCode: "US", countryName: "United States" }));
    service.recordPledgeEvent(makeEvent({ countryCode: "US", countryName: "United States" }));
    const result = service.getHeatMap(CAMPAIGN_ID);
    expect(result.data[0].countryCode).toBe("US");
    expect(result.data[1].countryCode).toBe("NG");
  });

  it("calculates sharePercent correctly", () => {
    service.recordPledgeEvent(makeEvent({ countryCode: "US", countryName: "United States" }));
    service.recordPledgeEvent(makeEvent({ countryCode: "US", countryName: "United States" }));
    service.recordPledgeEvent(makeEvent({ countryCode: "NG", countryName: "Nigeria" }));
    const result = service.getHeatMap(CAMPAIGN_ID);
    const us = result.data.find((d) => d.countryCode === "US")!;
    expect(us.sharePercent).toBeCloseTo(66.67, 1);
  });

  // ---------------------------------------------------------------------------
  // Filtering — tier
  // ---------------------------------------------------------------------------

  it("filters by tierLabel", () => {
    service.recordPledgeEvent(makeEvent({ tierLabel: "Early Bird" }));
    service.recordPledgeEvent(makeEvent({ countryCode: "NG", countryName: "Nigeria", tierLabel: "Standard" }));
    const earlyBirdResult = service.getHeatMap(CAMPAIGN_ID, { tierLabel: "Early Bird" });
    expect(earlyBirdResult.totalBackers).toBe(1);
    expect(earlyBirdResult.data[0].countryCode).toBe("US");
  });

  // ---------------------------------------------------------------------------
  // Filtering — date range
  // ---------------------------------------------------------------------------

  it("filters by fromDate", () => {
    service.recordPledgeEvent(makeEvent({ pledgedAt: "2026-09-01T00:00:00Z" }));
    service.recordPledgeEvent(makeEvent({ countryCode: "NG", countryName: "Nigeria", pledgedAt: "2026-10-15T00:00:00Z" }));
    const result = service.getHeatMap(CAMPAIGN_ID, { fromDate: "2026-10-01T00:00:00Z" });
    expect(result.totalBackers).toBe(1);
    expect(result.data[0].countryCode).toBe("NG");
  });

  it("filters by toDate", () => {
    service.recordPledgeEvent(makeEvent({ pledgedAt: "2026-09-01T00:00:00Z" }));
    service.recordPledgeEvent(makeEvent({ countryCode: "NG", countryName: "Nigeria", pledgedAt: "2026-11-01T00:00:00Z" }));
    const result = service.getHeatMap(CAMPAIGN_ID, { toDate: "2026-10-01T00:00:00Z" });
    expect(result.totalBackers).toBe(1);
    expect(result.data[0].countryCode).toBe("US");
  });

  // ---------------------------------------------------------------------------
  // Available tiers
  // ---------------------------------------------------------------------------

  it("returns sorted unique tier labels", () => {
    service.recordPledgeEvent(makeEvent({ tierLabel: "VIP" }));
    service.recordPledgeEvent(makeEvent({ tierLabel: "Early Bird" }));
    service.recordPledgeEvent(makeEvent({ tierLabel: "VIP" }));
    const tiers = service.getAvailableTiers(CAMPAIGN_ID);
    expect(tiers).toEqual(["Early Bird", "VIP"]);
  });

  // ---------------------------------------------------------------------------
  // Empty state
  // ---------------------------------------------------------------------------

  it("returns empty result for a campaign with no events", () => {
    const result = service.getHeatMap("unknown-camp");
    expect(result.totalBackers).toBe(0);
    expect(result.data).toHaveLength(0);
  });
});