import { beforeEach, describe, expect, it } from "vitest";
import {
  exportCampaignCsv,
  exportCampaignJson,
  sponsorsToCsv,
  impactReportToCsv,
  timelineToCsv,
  campaignExportJson,
  csvEscape,
} from "../campaign.service";
import type { CampaignRecord } from "@/types/campaign";

const mockCampaign: CampaignRecord = {
  id: "camp-export-1",
  name: "Amazon Reforestation Initiative",
  creator: "G_CREATOR_KEY",
  description: "Planting native mahogany and cedar trees",
  status: "ACTIVE",
  goalAmount: "100000",
  raisedAmount: "45000",
  sponsorCount: 3,
  treeCount: 5000,
  treeSpecies: "Mahogany, Cedar",
  co2Sequestration: "125.5 tons/yr",
  location: "Amazonas, Brazil",
  gpsLocations: [
    { latitude: -3.4653, longitude: -62.2159, label: "Zone Alpha" },
    { latitude: -3.4700, longitude: -62.2200, label: "Zone Beta" },
  ],
  countries: ["BR"],
  sponsors: [
    { id: "sp-1", campaignId: "camp-export-1", address: "G_SPONSOR_1", amount: "20000", token: "USDC", sponsoredAt: 1718000000000 },
    { id: "sp-2", campaignId: "camp-export-1", address: "G_SPONSOR_2", amount: "15000", token: "XLM", sponsoredAt: 1718050000000 },
    { id: "sp-3", campaignId: "camp-export-1", address: "G_SPONSOR_3", amount: "10000", token: "USDC", sponsoredAt: 1718100000000 },
  ],
  statusHistory: [
    { id: "hist-1", fromStatus: "DRAFT", toStatus: "PENDING_APPROVAL", changedBy: "G_CREATOR_KEY", changedAt: 1717900000000, reason: "Submitted for audit" },
    { id: "hist-2", fromStatus: "PENDING_APPROVAL", toStatus: "ACTIVE", changedBy: "ADMIN", changedAt: 1717950000000, reason: "Approved by verifier" },
  ],
  createdAt: 1717800000000,
  updatedAt: 1718150000000,
};

describe("Campaign Export Service (Issue #872)", () => {
  describe("csvEscape", () => {
    it("escapes fields containing commas or quotes", () => {
      expect(csvEscape("simple")).toBe("simple");
      expect(csvEscape("hello, world")).toBe('"hello, world"');
      expect(csvEscape('tree "giant"')).toBe('"tree ""giant"""');
    });
  });

  describe("sponsorsToCsv", () => {
    it("generates correct CSV format with sponsor addresses and amounts", () => {
      const csv = sponsorsToCsv(mockCampaign);
      const lines = csv.trim().split("\n");
      expect(lines[0]).toBe("sponsor_id,campaign_id,address,amount,token,sponsored_at");
      expect(lines.length).toBe(4); // header + 3 sponsors
      expect(lines[1]).toContain("G_SPONSOR_1");
      expect(lines[1]).toContain("20000");
    });
  });

  describe("impactReportToCsv", () => {
    it("generates correct CSV with species, CO2 sequestration, and GPS locations", () => {
      const csv = impactReportToCsv(mockCampaign);
      const lines = csv.trim().split("\n");
      expect(lines[0]).toContain("tree_species");
      expect(lines[0]).toContain("co2_sequestration");
      expect(lines[0]).toContain("gps_locations");
      expect(lines[1]).toContain("Mahogany, Cedar");
      expect(lines[1]).toContain("125.5 tons/yr");
      expect(lines[1]).toContain("Zone Alpha");
    });
  });

  describe("timelineToCsv", () => {
    it("generates correct audit timeline CSV with transitions and reasons", () => {
      const csv = timelineToCsv(mockCampaign);
      const lines = csv.trim().split("\n");
      expect(lines[0]).toBe("event_id,from_status,to_status,changed_by,changed_at,reason");
      expect(lines.length).toBe(3); // header + 2 events
      expect(lines[1]).toContain("DRAFT");
      expect(lines[1]).toContain("PENDING_APPROVAL");
      expect(lines[1]).toContain("Submitted for audit");
    });
  });

  describe("campaignExportJson", () => {
    it("exports structured JSON matching the campaign data specification", () => {
      const json = campaignExportJson(mockCampaign);
      expect(json.campaign).toBeDefined();
      expect((json.campaign as any).name).toBe("Amazon Reforestation Initiative");
      expect((json.campaign as any).treeSpecies).toBe("Mahogany, Cedar");
      expect((json.campaign as any).co2Sequestration).toBe("125.5 tons/yr");
      expect(json.sponsors).toHaveLength(3);
      expect(json.timeline).toHaveLength(2);
      expect(json.exportedAt).toBeDefined();
    });
  });
});
