import { describe, expect, it } from "vitest";
import {
  createCampaign,
  InMemoryCampaignDataSource,
  type CampaignRecord,
} from "./campaign.service";
import {
  addStaffPick,
  getStaffPicks,
  removeStaffPick,
  StaffPickError,
} from "./campaign-staff-picks.service";

function createTestDataSource(): InMemoryCampaignDataSource {
  return new InMemoryCampaignDataSource(async () => {});
}

async function seedCampaign(
  dataSource: InMemoryCampaignDataSource,
  id: string,
  name = "Test Campaign",
): Promise<CampaignRecord> {
  const campaign: CampaignRecord = {
    id,
    creator: "creator-addr",
    name,
    status: "ACTIVE",
    goalAmount: "10000",
    raisedAmount: "5000",
    sponsorCount: 3,
    treeCount: 50,
    createdAt: 1000,
    updatedAt: 1000,
    statusChangedAt: 1000,
    sponsors: [],
    statusHistory: [],
  };
  return dataSource.saveCampaign(campaign);
}

describe("campaign staff picks service", () => {
  it("marks a campaign as a staff pick and lists all staff picks", async () => {
    const ds = createTestDataSource();
    await seedCampaign(ds, "camp-1", "Forest Protection");
    await seedCampaign(ds, "camp-2", "Ocean Clean");

    expect(await getStaffPicks(ds)).toEqual([]);

    const updated = await addStaffPick(
      "camp-1",
      { reason: "High biodiversity impact and verified community team" },
      ds,
      2000,
    );

    expect(updated.isStaffPick).toBe(true);
    expect(updated.staffPickReason).toBe("High biodiversity impact and verified community team");
    expect(updated.staffPickedAt).toBe(2000);

    const picks = await getStaffPicks(ds);
    expect(picks.length).toBe(1);
    expect(picks[0].id).toBe("camp-1");
  });

  it("removes a staff pick designation", async () => {
    const ds = createTestDataSource();
    await seedCampaign(ds, "camp-1");
    await addStaffPick("camp-1", {}, ds, 2000);

    const removed = await removeStaffPick("camp-1", ds, 3000);
    expect(removed.isStaffPick).toBe(false);
    expect(removed.staffPickReason).toBeUndefined();
    expect(removed.staffPickedAt).toBeUndefined();

    const picks = await getStaffPicks(ds);
    expect(picks).toEqual([]);
  });

  it("throws StaffPickError if campaign is not found", async () => {
    const ds = createTestDataSource();
    await expect(addStaffPick("non-existent", {}, ds)).rejects.toThrow(StaffPickError);
    await expect(removeStaffPick("non-existent", ds)).rejects.toThrow(StaffPickError);
  });
});
