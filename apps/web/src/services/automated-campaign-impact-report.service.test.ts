import { describe, expect, it, beforeEach, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  clearImpactReportStore,
  generateCampaignImpactReport,
  generatePendingCampaignCloseReports,
  getCampaignImpactReport,
  getCreatorImpactReports,
  renderImpactReportEmailHtml,
} from "./automated-campaign-impact-report.service";
import {
  createCampaign,
  InMemoryCampaignDataSource,
  setCampaignDataSource,
  transitionCampaignStatus,
  type CampaignRecord,
} from "./campaign.service";
import {
  clearCampaignAnalyticsDashboard,
  recordBackerContribution,
} from "./campaign-analytics-dashboard.service";

describe("Automated Campaign Impact Report Generator", () => {
  let dataSource: InMemoryCampaignDataSource;
  const mockEmailService = {
    sendEmail: vi.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    clearImpactReportStore();
    dataSource = new InMemoryCampaignDataSource();
    setCampaignDataSource(dataSource);
  });

  async function createTestCampaign(overrides: Partial<CampaignRecord> = {}): Promise<CampaignRecord> {
    const now = overrides.createdAt ?? 1700000000000;
    const camp = await createCampaign({
      id: overrides.id ?? "impact-camp-1",
      creator: overrides.creator ?? "GCREATOR1",
      creatorEmail: overrides.creatorEmail ?? "creator@example.com",
      name: overrides.name ?? "Rainforest Conservation 2026",
      description: overrides.description ?? "Preserving 10,000 hectares of primary rainforest with local communities.",
      location: overrides.location ?? "Amazonas, Brazil",
      speciesId: overrides.speciesId ?? "oak",
      species: overrides.species ?? "Oak",
      goalAmount: overrides.goalAmount ?? "1000000000",
      raisedAmount: overrides.raisedAmount ?? "1000000000",
      treeCount: overrides.treeCount ?? 5000,
      sponsorCount: overrides.sponsorCount ?? 25,
      status: overrides.status ?? "ACTIVE",
      sponsors: overrides.sponsors ?? [
        {
          id: "sp-1",
          campaignId: overrides.id ?? "impact-camp-1",
          address: "GSPONSOR1",
          amount: "500000000",
          token: "XLM",
          sponsoredAt: now - 100000,
        },
        {
          id: "sp-2",
          campaignId: overrides.id ?? "impact-camp-1",
          address: "GSPONSOR2",
          amount: "500000000",
          token: "XLM",
          sponsoredAt: now - 50000,
        },
      ],
    } as Partial<CampaignRecord>, dataSource, now);

    // If override status is different from DRAFT
    if (overrides.status && overrides.status !== "DRAFT") {
      camp.status = overrides.status;
      camp.statusChangedAt = overrides.statusChangedAt ?? now;
      await dataSource.saveCampaign(camp);
    }

    return camp;
  }

  describe("generateCampaignImpactReport", () => {
    it("generates a complete PDF impact report summarising performance, demographics, and stated impact", async () => {
      const campaignId = "camp-full-impact";
      clearCampaignAnalyticsDashboard(campaignId);

      // Record demographics in analytics
      await createTestCampaign({
        id: campaignId,
        status: "COMPLETED",
        statusChangedAt: 1700000000000,
        treeCount: 2000,
      });

      await recordBackerContribution(campaignId, {
        amount: "600000000",
        backerId: "backer-us",
        region: "United States",
      }, dataSource);

      await recordBackerContribution(campaignId, {
        amount: "400000000",
        backerId: "backer-de",
        region: "Germany",
      }, dataSource);

      const report = await generateCampaignImpactReport(campaignId, {
        dataSource,
        emailService: mockEmailService,
        baseUrl: "https://fundable.stellar",
        now: 1700000100000,
      });

      expect(report).toBeDefined();
      expect(report.campaignId).toBe(campaignId);
      expect(report.campaignName).toBe("Rainforest Conservation 2026");
      expect(report.creator).toBe("GCREATOR1");
      expect(report.creatorEmail).toBe("creator@example.com");

      // Verify campaign performance
      expect(report.campaignPerformance).toMatchObject({
        raisedAmount: "1000000000",
        goalAmount: "1000000000",
        treeCount: 2000,
      });

      // Verify backer demographics
      expect(report.demographics.length).toBeGreaterThanOrEqual(2);
      const usDemo = report.demographics.find((d) => d.region === "United States");
      expect(usDemo).toBeDefined();
      expect(usDemo?.backers).toBe(1);

      // Verify stated project impact
      expect(report.statedProjectImpact).toContain("Preserving 10,000 hectares");

      // Verify PDF bytes
      expect(report.pdfBytes).toBeInstanceOf(Uint8Array);
      expect(report.pdfBytes!.length).toBeGreaterThan(1000);
      const doc = await PDFDocument.load(report.pdfBytes!);
      expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);

      // Verify public link
      expect(report.publicUrl).toBe(`/campaigns/${campaignId}/impact-report`);
      expect(report.publicShareUrl).toBe(`https://fundable.stellar/campaigns/${campaignId}/impact-report`);
      expect(report.downloadUrl).toBe(`/api/reports/campaign/${campaignId}`);

      // Verify email delivery to creator
      expect(mockEmailService.sendEmail).toHaveBeenCalledTimes(1);
      const emailArg = mockEmailService.sendEmail.mock.calls[0][0];
      expect(emailArg.to).toBe("creator@example.com");
      expect(emailArg.subject).toContain("Campaign Impact Report: Rainforest Conservation 2026");
      expect(emailArg.html).toContain("Trees Planted");
      expect(emailArg.html).toContain(report.publicShareUrl);
      expect(emailArg.html).toContain(report.downloadUrl);
    });

    it("persists impact report summary onto the campaign record", async () => {
      const camp = await createTestCampaign({ id: "camp-persist", status: "COMPLETED" });
      await generateCampaignImpactReport(camp.id, { dataSource, emailService: mockEmailService });

      const reloaded = await dataSource.getCampaigns();
      const updated = reloaded.find((c) => c.id === camp.id);
      expect(updated?.impactReport).toBeDefined();
      expect(updated?.impactReport?.publicUrl).toBe(`/campaigns/${camp.id}/impact-report`);
      expect(updated?.impactReport?.emailSent).toBe(true);
    });
  });

  describe("Acceptance Criteria: Report generated within 24 hours of campaign close", () => {
    it("generatePendingCampaignCloseReports processes completed campaigns closed within 24 hours", async () => {
      const now = Date.now();
      const twelveHoursAgo = now - 12 * 60 * 60 * 1000;
      const thirtyHoursAgo = now - 30 * 60 * 60 * 1000;

      // Campaign 1: completed 12h ago, no report -> should generate
      await createTestCampaign({
        id: "camp-recent-close",
        creator: "GCREATOR_RECENT",
        status: "COMPLETED",
        statusChangedAt: twelveHoursAgo,
      });

      // Campaign 2: completed 30h ago, already has report -> should skip
      const oldCamp = await createTestCampaign({
        id: "camp-old-close",
        creator: "GCREATOR_OLD",
        status: "COMPLETED",
        statusChangedAt: thirtyHoursAgo,
      });
      oldCamp.impactReport = {
        id: "old-report",
        generatedAt: thirtyHoursAgo,
        publicUrl: `/campaigns/${oldCamp.id}/impact-report`,
        downloadUrl: `/api/reports/campaign/${oldCamp.id}`,
        emailSent: true,
      };
      await dataSource.saveCampaign(oldCamp);

      // Campaign 3: still ACTIVE -> should not generate
      await createTestCampaign({
        id: "camp-active",
        status: "ACTIVE",
      });

      const processed = await generatePendingCampaignCloseReports({
        dataSource,
        emailService: mockEmailService,
        now,
      });

      expect(processed.map((r) => r.campaignId)).toContain("camp-recent-close");
      expect(processed.map((r) => r.campaignId)).not.toContain("camp-old-close");
      expect(processed.map((r) => r.campaignId)).not.toContain("camp-active");
    });
  });

  describe("Acceptance Criteria: Creator receives report via email and in dashboard", () => {
    it("delivers report email to creator with performance, demographics, and links", () => {
      const camp = {
        id: "test-email-camp",
        name: "Mangrove Reforestation",
        treeCount: 1500,
        creatorEmail: "creator@mangrove.org",
      } as CampaignRecord;

      const email = renderImpactReportEmailHtml(camp, {
        publicShareUrl: "https://fundable.stellar/campaigns/test-email-camp/impact-report",
        downloadUrl: "/api/reports/campaign/test-email-camp",
        treeCount: 1500,
        co2KgPerYear: 30000,
        raisedAmount: "500000",
        goalAmount: "500000",
        sponsorCount: 18,
        demographics: [{ region: "Kenya", backers: 10, totalAmount: "300000", share: 60 }],
      });

      expect(email.subject).toBe("Campaign Impact Report: Mangrove Reforestation is ready");
      expect(email.html).toContain("1,500");
      expect(email.html).toContain("30000.0 kg");
      expect(email.html).toContain("Kenya");
      expect(email.html).toContain("https://fundable.stellar/campaigns/test-email-camp/impact-report");
      expect(email.html).toContain("/api/reports/campaign/test-email-camp");
    });

    it("retrieves reports for creator dashboard via getCreatorImpactReports", async () => {
      const creatorAddr = "GCREATOR_DASHBOARD_TEST";

      const camp1 = await createTestCampaign({
        id: "dash-camp-1",
        creator: creatorAddr,
        status: "COMPLETED",
      });
      const camp2 = await createTestCampaign({
        id: "dash-camp-2",
        creator: creatorAddr,
        status: "COMPLETED",
      });
      await createTestCampaign({
        id: "other-creator-camp",
        creator: "GOTHER",
        status: "COMPLETED",
      });

      // Generate reports
      await generateCampaignImpactReport(camp1.id, { dataSource, emailService: mockEmailService });
      await generateCampaignImpactReport(camp2.id, { dataSource, emailService: mockEmailService });

      const creatorReports = await getCreatorImpactReports(creatorAddr, dataSource);
      expect(creatorReports.length).toBe(2);
      expect(creatorReports.map((r) => r.campaignId)).toEqual(
        expect.arrayContaining(["dash-camp-1", "dash-camp-2"]),
      );
      expect(creatorReports.some((r) => r.campaignId === "other-creator-camp")).toBe(false);
    });
  });

  describe("Acceptance Criteria: Report shareable as a public link", () => {
    it("generates a public shareable URL accessible by any viewer", async () => {
      const camp = await createTestCampaign({
        id: "shareable-camp",
        status: "COMPLETED",
      });

      const report = await generateCampaignImpactReport(camp.id, {
        dataSource,
        baseUrl: "https://fundable.stellar",
      });

      expect(report.publicUrl).toBe(`/campaigns/shareable-camp/impact-report`);
      expect(report.publicShareUrl).toBe("https://fundable.stellar/campaigns/shareable-camp/impact-report");

      const loaded = await getCampaignImpactReport(camp.id, dataSource);
      expect(loaded?.publicShareUrl).toBe(report.publicShareUrl);
    });
  });

  describe("Campaign close transition integration", () => {
    it("automatically triggers impact report generation when campaign status transitions to COMPLETED", async () => {
      const draft = await createCampaign({
        id: "auto-close-camp",
        creator: "GCREATOR_AUTO",
        creatorEmail: "autocreator@example.com",
        name: "Auto Close Test Campaign",
        goalAmount: "1000",
        raisedAmount: "1000",
        treeCount: 50,
      }, dataSource);

      const pending = await transitionCampaignStatus(draft, "PENDING_VERIFICATION", "admin", "Submitted", dataSource);
      const active = await transitionCampaignStatus(pending, "ACTIVE", "admin", "Approved", dataSource);

      // Now complete the campaign
      await transitionCampaignStatus(active, "COMPLETED", "admin", "Funding goal achieved", dataSource);

      // Give async microtask a moment to run
      await new Promise((resolve) => setTimeout(resolve, 50));

      const report = await getCampaignImpactReport("auto-close-camp", dataSource);
      expect(report).toBeDefined();
      expect(report?.campaignId).toBe("auto-close-camp");
      expect(report?.campaignName).toBe("Auto Close Test Campaign");
    });
  });
});
