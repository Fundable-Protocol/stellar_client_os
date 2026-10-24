import { beforeEach, describe, expect, it } from "vitest";

import {
  BACKER_CSV_COLUMNS,
  backersToCsv,
  buildCampaignBackersCsv,
  buildCampaignExportDataset,
  buildCampaignExportPdf,
  resolveTierForAmount,
} from "./campaign-export.service";
import { backersService } from "./campaign-backers.service";
import { createCampaign, InMemoryCampaignDataSource } from "./campaign.service";

const NOW = Date.UTC(2026, 8, 1, 12, 0, 0);

async function seedCampaign(
  dataSource: InMemoryCampaignDataSource,
  overrides: Partial<Parameters<InMemoryCampaignDataSource["saveCampaign"]>[0]> = {},
) {
  const campaign = await createCampaign(
    {
      id: "export-campaign",
      creator: "GCREATOR",
      name: "Reforest the Highlands",
      goalAmount: "30000",
    },
    dataSource,
    NOW,
  );
  const seeded = {
    ...campaign,
    status: "ACTIVE" as const,
    raisedAmount: "16250",
    sponsorCount: 3,
    sponsors: [
      {
        id: "s1",
        campaignId: campaign.id,
        address: "GBACKER1",
        amount: "15000",
        token: "XLM",
        sponsoredAt: Date.UTC(2026, 7, 1),
      },
      {
        id: "s2",
        campaignId: campaign.id,
        address: "gbacker1",
        amount: "500",
        token: "XLM",
        sponsoredAt: Date.UTC(2026, 7, 3),
      },
      {
        id: "s3",
        campaignId: campaign.id,
        address: "GBACKER2",
        amount: "250",
        token: "XLM",
        sponsoredAt: Date.UTC(2026, 7, 2),
      },
    ],
    ...overrides,
  };
  await dataSource.saveCampaign(seeded);
  return seeded;
}

describe("campaign export service", () => {
  beforeEach(() => {
    backersService.reset();
  });

  it("aggregates every backer into a ranked row with tier and pledge fields", async () => {
    const dataSource = new InMemoryCampaignDataSource();
    await seedCampaign(dataSource);

    const dataset = await buildCampaignExportDataset("export-campaign", {
      dataSource,
      now: NOW,
    });

    expect(dataset).not.toBeNull();
    const { summary, backers } = dataset!;

    expect(summary).toMatchObject({
      campaignId: "export-campaign",
      campaignName: "Reforest the Highlands",
      creator: "GCREATOR",
      status: "ACTIVE",
      goalAmount: "30000",
      raisedAmount: "16250",
      currency: "XLM",
      backerCount: 2,
      contributionCount: 3,
      totalPledged: "15750",
      averagePledge: "7875",
      fundingProgress: 54.2,
    });

    // Same wallet address with different casing is merged into one backer.
    expect(backers).toHaveLength(2);
    expect(backers[0]).toMatchObject({
      rank: 1,
      backerAddress: "GBACKER1",
      totalPledged: "15500",
      contributionCount: 2,
      averagePledge: "7750",
      token: "XLM",
      rewardTierId: "TIER_5",
      rewardTierName: "Legendary Guardian",
      visibility: "PUBLIC",
      isFeatured: false,
    });
    expect(backers[0].lastPledgeAt).toBe(Date.UTC(2026, 7, 3));
    expect(backers[1]).toMatchObject({
      rank: 2,
      backerAddress: "GBACKER2",
      totalPledged: "250",
      rewardTierId: "TIER_2",
    });
  });

  it("includes private backers in the creator-facing export", async () => {
    const dataSource = new InMemoryCampaignDataSource();
    await seedCampaign(dataSource);
    backersService.recordContribution({
      campaignId: "export-campaign",
      backerAddress: "GPRIVATE",
      amount: "1000",
      token: "XLM",
      contributedAt: Date.UTC(2026, 7, 4),
    });
    backersService.setPrivacyPreference({
      campaignId: "export-campaign",
      backerAddress: "GPRIVATE",
      visibility: "PRIVATE",
    });

    const dataset = await buildCampaignExportDataset("export-campaign", {
      dataSource,
      now: NOW,
    });

    const row = dataset!.backers.find((backer) => backer.backerAddress === "GPRIVATE");
    expect(row).toMatchObject({ visibility: "PRIVATE", totalPledged: "1000" });
    expect(dataset!.summary.backerCount).toBe(3);
  });

  it("builds the daily funding series with cumulative totals", async () => {
    const dataSource = new InMemoryCampaignDataSource();
    await seedCampaign(dataSource);

    const dataset = await buildCampaignExportDataset("export-campaign", {
      dataSource,
      now: NOW,
    });

    expect(dataset!.daily).toEqual([
      { date: "2026-08-01", amount: "15000", contributions: 1, cumulative: "15000" },
      { date: "2026-08-02", amount: "250", contributions: 1, cumulative: "15250" },
      { date: "2026-08-03", amount: "500", contributions: 1, cumulative: "15750" },
    ]);
  });

  it("summarises reward tier selections and revenue", async () => {
    const dataSource = new InMemoryCampaignDataSource();
    await seedCampaign(dataSource);

    const dataset = await buildCampaignExportDataset("export-campaign", {
      dataSource,
      now: NOW,
    });

    const legendary = dataset!.rewardTiers.find((tier) => tier.tierId === "TIER_5");
    const fieldImpactor = dataset!.rewardTiers.find((tier) => tier.tierId === "TIER_2");
    expect(legendary).toMatchObject({ backers: 1, pledged: "15500", share: 50 });
    expect(fieldImpactor).toMatchObject({ backers: 1, pledged: "250", share: 50 });
  });

  it("serialises all backer fields to CSV with escaping", async () => {
    const dataSource = new InMemoryCampaignDataSource();
    await seedCampaign(dataSource);
    backersService.recordContribution({
      campaignId: "export-campaign",
      backerAddress: "GMESSAGE",
      amount: "600",
      token: "USDC",
      contributedAt: Date.UTC(2026, 7, 5),
      displayName: "Ada, \"The Planter\"",
      message: "Keep growing, and going",
      txHash: "abc123",
    });
    backersService.registerCampaignCreator("export-campaign", "GCREATOR");
    backersService.featureBacker({
      campaignId: "export-campaign",
      backerAddress: "GMESSAGE",
      featuredBy: "GCREATOR",
      note: "Top supporter",
    });

    const csv = await buildCampaignBackersCsv("export-campaign", {
      dataSource,
      now: NOW,
    });
    const lines = (csv ?? "").trim().split("\n");

    expect(csv).not.toBeNull();
    expect(lines[0]).toBe(BACKER_CSV_COLUMNS.join(","));
    expect(lines).toHaveLength(4);
    expect(csv).toContain('"Ada, ""The Planter"""');
    expect(csv).toContain('"Keep growing, and going"');
    expect(csv).toContain("abc123");
    const messageRow = lines.find((line) => line.includes("GMESSAGE"));
    expect(messageRow).toBeDefined();
    expect(messageRow).toContain("USDC");
    expect(messageRow!.endsWith("true")).toBe(true);
    const sponsorRow = lines.find((line) => line.includes("GBACKER1"));
    expect(sponsorRow).toContain("XLM");
  });

  it("returns null for unknown campaigns", async () => {
    const dataSource = new InMemoryCampaignDataSource();
    await expect(
      buildCampaignExportDataset("does-not-exist", { dataSource }),
    ).resolves.toBeNull();
    await expect(
      buildCampaignBackersCsv("does-not-exist", { dataSource }),
    ).resolves.toBeNull();
  });

  it("falls back to the demo campaigns used by the creator dashboard", async () => {
    const dataset = await buildCampaignExportDataset("1", { now: NOW });

    expect(dataset).not.toBeNull();
    expect(dataset!.backers.length).toBeGreaterThan(0);
    expect(dataset!.summary.campaignId).toBe("1");
  });

  it("renders a PDF report with charts and the backer table", async () => {
    const dataSource = new InMemoryCampaignDataSource();
    await seedCampaign(dataSource);
    const dataset = await buildCampaignExportDataset("export-campaign", {
      dataSource,
      now: NOW,
    });

    const bytes = await buildCampaignExportPdf(dataset!);
    const header = new TextDecoder().decode(bytes.slice(0, 8));

    expect(header).toBe("%PDF-1.7");
    expect(bytes.byteLength).toBeGreaterThan(1_000);
  });

  it("renders a PDF for a campaign without any backers", async () => {
    const dataSource = new InMemoryCampaignDataSource();
    await createCampaign(
      { id: "empty-campaign", creator: "GCREATOR", name: "New campaign", goalAmount: "5000" },
      dataSource,
      NOW,
    );
    const dataset = await buildCampaignExportDataset("empty-campaign", {
      dataSource,
      now: NOW,
    });

    expect(dataset!.backers).toHaveLength(0);
    expect(dataset!.daily).toHaveLength(0);
    const bytes = await buildCampaignExportPdf(dataset!);
    expect(new TextDecoder().decode(bytes.slice(0, 8))).toBe("%PDF-1.7");
  });

  it("maps pledged amounts to reward tiers", () => {
    expect(resolveTierForAmount("50")).toMatchObject({ tierId: "TIER_1" });
    expect(resolveTierForAmount("250")).toMatchObject({ tierId: "TIER_2" });
    expect(resolveTierForAmount("999.99")).toMatchObject({ tierId: "TIER_3" });
    expect(resolveTierForAmount("5000")).toMatchObject({ tierId: "TIER_5" });
  });

  it("handles an empty backer list without throwing", () => {
    const csv = backersToCsv([], "export-campaign");
    expect(csv).toBe(`${BACKER_CSV_COLUMNS.join(",")}\n`);
  });
});
