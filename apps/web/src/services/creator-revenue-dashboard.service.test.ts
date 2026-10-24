import { beforeEach, describe, expect, it } from "vitest";
import { createCampaign, InMemoryCampaignDataSource } from "./campaign.service";
import { clearCreatorRevenueState, getCreatorRevenueDashboard, initiateCreatorWithdrawal } from "./creator-revenue-dashboard.service";

const creator = "GCREATOR";
describe("creator revenue dashboard", () => {
  const dataSource = new InMemoryCampaignDataSource();
  beforeEach(async () => {
    clearCreatorRevenueState();
    await createCampaign({ id: "active", creator, name: "Active campaign", goalAmount: "1000", raisedAmount: "1000" }, dataSource, 100);
    const completed = await createCampaign({ id: "completed", creator, name: "Settled campaign", goalAmount: "2000", raisedAmount: "2000" }, dataSource, 100);
    await dataSource.saveCampaign({ ...completed, status: "COMPLETED", statusChangedAt: 100, updatedAt: 100 });
  });
  it("breaks revenue down by campaign and separates pending from settled", async () => {
    const dashboard = await getCreatorRevenueDashboard(creator, "all", dataSource, 200);
    expect(dashboard.campaigns).toHaveLength(2);
    expect(dashboard.totals.pendingWithdrawals).toBeGreaterThan(0);
    expect(dashboard.totals.settledAmount).toBeGreaterThan(0);
    expect(dashboard.totals.platformFees).toBeGreaterThan(0);
  });
  it("only allows withdrawals from settled funds", async () => {
    const dashboard = await getCreatorRevenueDashboard(creator, "all", dataSource, 200);
    const request = await initiateCreatorWithdrawal(creator, dashboard.totals.availableToWithdraw, dataSource, 200);
    expect(request.status).toBe("requested");
    await expect(initiateCreatorWithdrawal(creator, 1, dataSource, 201)).rejects.toThrow(/exceeds settled/);
  });
});
