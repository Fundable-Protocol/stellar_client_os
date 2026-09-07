import { describe, expect, it } from "vitest";
import {
  InMemoryCampaignDataSource,
  createCampaign,
  exportCampaignCsv,
  findDuplicateCampaigns,
  queryCampaigns,
  getCampaignCreatorBadge,
  getCampaignCreatorBadges,
  transitionCampaignStatus,
  type CampaignRecord,
} from "./campaign.service";

const fixture = (overrides: Partial<CampaignRecord> = {}): CampaignRecord => ({
  id: "campaign-1",
  creator: "creator-1",
  name: "Mangrove restoration",
  description: "Coastal impact",
  status: "DRAFT",
  goalAmount: "1000",
  raisedAmount: "250",
  sponsorCount: 1,
  treeCount: 10,
  createdAt: 1_000,
  updatedAt: 1_000,
  statusChangedAt: 1_000,
  sponsors: [{ id: "sponsor-1", campaignId: "campaign-1", address: "GABC", amount: "250", token: "USDC", sponsoredAt: 1_000 }],
  statusHistory: [],
  ...overrides,
});

describe("campaign service", () => {
  it("filters and sorts campaigns without losing numeric precision", async () => {
    const source = new InMemoryCampaignDataSource();
    await source.saveCampaign(fixture());
    await source.saveCampaign(fixture({ id: "campaign-2", name: "Forest", goalAmount: "9000000000000000000", createdAt: 2_000 }));
    const result = await queryCampaigns({ filter: { search: "forest" }, sort: { field: "goalAmount", direction: "DESC" } }, source);
    expect(result.map((campaign) => campaign.id)).toEqual(["campaign-2"]);
  });

  it("awards creator badges at 10, 50, and 100 campaigns", () => {
    expect(getCampaignCreatorBadge(9)).toBeNull();
    expect(getCampaignCreatorBadge(10)?.name).toBe("Campaign Starter");
    expect(getCampaignCreatorBadge(50)?.name).toBe("Campaign Builder");
    expect(getCampaignCreatorBadge(100)?.name).toBe("Campaign Champion");
    expect(getCampaignCreatorBadges(99).map((badge) => badge.threshold)).toEqual([10, 50]);
  });

  it("persists verification transitions with timestamp and audit actor", async () => {
    const source = new InMemoryCampaignDataSource();
    const campaign = fixture({ status: "PENDING_VERIFICATION", statusHistory: [] });
    await source.saveCampaign(campaign);
    const updated = await transitionCampaignStatus(campaign, "ACTIVE", "verifier-7", "Tree verification complete", source, 42_000);
    expect(updated.status).toBe("ACTIVE");
    expect(updated.statusChangedAt).toBe(42_000);
    expect(updated.statusHistory.at(-1)).toMatchObject({ fromStatus: "PENDING_VERIFICATION", toStatus: "ACTIVE", changedBy: "verifier-7", changedAt: 42_000 });
    expect((await source.getCampaigns())[0].statusHistory).toHaveLength(1);
  });

  it("exports sponsor and impact CSV reports with escaped values", async () => {
    const source = new InMemoryCampaignDataSource();
    await source.saveCampaign(fixture({ name: "Trees, everywhere" }));
    expect(await exportCampaignCsv("campaign-1", "sponsors", source)).toContain("sponsor_id,campaign_id,address,amount,token,sponsored_at");
    expect(await exportCampaignCsv("campaign-1", "impact", source)).toContain('campaign-1,"Trees, everywhere"');
  });

  it("creates an auditable initial status entry", async () => {
    const source = new InMemoryCampaignDataSource();
    const campaign = await createCampaign({ creator: "creator-1", name: "New campaign", goalAmount: "100" }, source, 10_000);
    expect(campaign.statusHistory[0]).toMatchObject({ fromStatus: null, toStatus: "DRAFT", changedBy: "creator-1", changedAt: 10_000 });
  });

  it("persists location and durationMs and derives duration from a deadline", async () => {
    const source = new InMemoryCampaignDataSource();
    const campaign = await createCampaign(
      { creator: "creator-1", name: "Mangrove restoration", location: "Kenya", deadline: 110_000, goalAmount: "100" },
      source,
      10_000,
    );
    expect(campaign.location).toBe("Kenya");
    expect(campaign.durationMs).toBe(100_000);
  });
});

describe("findDuplicateCampaigns", () => {
  it("flags an identical name/location/duration for the same creator", async () => {
    const source = new InMemoryCampaignDataSource();
    await source.saveCampaign(fixture({ creator: "creator-1", name: "Mangrove restoration", location: "Kenya", durationMs: 2_592_000_000 }));
    const duplicates = await findDuplicateCampaigns(
      { creator: "creator-1", name: "Mangrove restoration", location: "Kenya", durationMs: 2_592_000_000 },
      source,
    );
    expect(duplicates.map((campaign) => campaign.id)).toEqual(["campaign-1"]);
  });

  it("ignores campaigns from a different creator", async () => {
    const source = new InMemoryCampaignDataSource();
    await source.saveCampaign(fixture({ creator: "creator-1", name: "Mangrove restoration", location: "Kenya", durationMs: 2_592_000_000 }));
    const duplicates = await findDuplicateCampaigns(
      { creator: "creator-2", name: "Mangrove restoration", location: "Kenya", durationMs: 2_592_000_000 },
      source,
    );
    expect(duplicates).toEqual([]);
  });

  it("does not match when the location differs", async () => {
    const source = new InMemoryCampaignDataSource();
    await source.saveCampaign(fixture({ creator: "creator-1", name: "Mangrove restoration", location: "Kenya", durationMs: 2_592_000_000 }));
    const duplicates = await findDuplicateCampaigns(
      { creator: "creator-1", name: "Mangrove restoration", location: "Tanzania", durationMs: 2_592_000_000 },
      source,
    );
    expect(duplicates).toEqual([]);
  });

  it("does not match when the duration differs", async () => {
    const source = new InMemoryCampaignDataSource();
    await source.saveCampaign(fixture({ creator: "creator-1", name: "Mangrove restoration", location: "Kenya", durationMs: 2_592_000_000 }));
    const duplicates = await findDuplicateCampaigns(
      { creator: "creator-1", name: "Mangrove restoration", location: "Kenya", durationMs: 3_110_400_000 },
      source,
    );
    expect(duplicates).toEqual([]);
  });

  it("matches on trimmed, case-insensitive name and location", async () => {
    const source = new InMemoryCampaignDataSource();
    await source.saveCampaign(fixture({ creator: "creator-1", name: "Mangrove Restoration", location: "Kenya", durationMs: 2_592_000_000 }));
    const duplicates = await findDuplicateCampaigns(
      { creator: "creator-1", name: "  mangrove restoration ", location: "kenya", durationMs: 2_592_000_000 },
      source,
    );
    expect(duplicates.map((campaign) => campaign.id)).toEqual(["campaign-1"]);
  });

  it("treats absent location/duration on both sides as equal", async () => {
    const source = new InMemoryCampaignDataSource();
    await source.saveCampaign(fixture({ creator: "creator-1", name: "Mangrove restoration" }));
    const duplicates = await findDuplicateCampaigns({ creator: "creator-1", name: "Mangrove restoration" }, source);
    expect(duplicates.map((campaign) => campaign.id)).toEqual(["campaign-1"]);
  });

  it("does not match an explicit location against an absent one", async () => {
    const source = new InMemoryCampaignDataSource();
    await source.saveCampaign(fixture({ creator: "creator-1", name: "Mangrove restoration" }));
    const duplicates = await findDuplicateCampaigns(
      { creator: "creator-1", name: "Mangrove restoration", location: "Kenya", durationMs: 2_592_000_000 },
      source,
    );
    expect(duplicates).toEqual([]);
  });
});
