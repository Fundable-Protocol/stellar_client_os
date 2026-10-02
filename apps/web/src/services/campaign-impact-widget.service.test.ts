import { describe, expect, it } from "vitest";
import { buildCampaignImpactWidgetData } from "./campaign-impact-widget.service";

describe("campaign impact widget", () => {
  it("normalizes progress and environmental metrics for an embed", () => {
    const data = buildCampaignImpactWidgetData({
      id: "c-1", creator: "G...", name: "Trees", status: "COMPLETED", goalAmount: "100", raisedAmount: "125",
      sponsorCount: 4, treeCount: 250, createdAt: 1, updatedAt: 2, statusChangedAt: 2, sponsors: [], statusHistory: [],
    });
    expect(data.progressPercent).toBe(100);
    expect(data.co2OffsetTons).toBe(5.5);
    expect(data.embedPath).toBe("/campaigns/c-1/widget");
  });
});
