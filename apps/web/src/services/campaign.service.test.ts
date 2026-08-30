import { describe, expect, it } from "vitest";
import {
  InMemoryCampaignDataSource,
  createCampaign,
  exportCampaignCsv,
  queryCampaigns,
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
});
