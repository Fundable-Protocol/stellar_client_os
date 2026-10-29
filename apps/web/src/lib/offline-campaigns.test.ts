import { describe, expect, it } from "vitest";
import { toOfflineCampaignRecord } from "./offline-campaigns";

describe("toOfflineCampaignRecord", () => {
  it("keeps public campaign fields and omits private API fields", () => {
    const result = toOfflineCampaignRecord({
      id: "campaign-123",
      name: "Community forest",
      description: "Plant trees together.",
      location: "Kenya",
      goalAmount: "1000",
      raisedAmount: "250",
      treeCount: 40,
      status: "ACTIVE",
      deadline: 1800000000000,
      creatorEmail: "private@example.test",
      walletSecret: "never persist this",
    });

    expect(result).toMatchObject({
      id: "campaign-123",
      name: "Community forest",
      description: "Plant trees together.",
      location: "Kenya",
      goalAmount: "1000",
      raisedAmount: "250",
      treeCount: 40,
      status: "ACTIVE",
      url: "/campaigns/campaign-123",
    });
    expect(result).not.toHaveProperty("creatorEmail");
    expect(result).not.toHaveProperty("walletSecret");
  });

  it("supports campaign objects wrapped in a data field", () => {
    expect(toOfflineCampaignRecord({ data: { id: 42, title: "Wrapped campaign" } })).toMatchObject({
      id: "42",
      name: "Wrapped campaign",
      url: "/campaigns/42",
    });
  });

  it("rejects objects without a usable campaign id", () => {
    expect(toOfflineCampaignRecord({ name: "No id" })).toBeNull();
    expect(toOfflineCampaignRecord(null)).toBeNull();
  });
});
