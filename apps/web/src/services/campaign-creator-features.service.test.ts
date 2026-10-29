import { describe, expect, beforeEach, it } from "vitest";
import { createCampaign, InMemoryCampaignDataSource } from "./campaign.service";
import {
  cloneCampaign,
  createPrivatePreview,
  getCampaignByPreviewToken,
  requestDeadlineExtension,
  resetCampaignCreatorFeatures,
  reviewDeadlineExtension,
} from "./campaign-creator-features.service";

const now = 1_700_000_000_000;

async function activeCampaign(source: InMemoryCampaignDataSource) {
  return createCampaign({
    id: "campaign-1",
    creator: "creator-1",
    name: "Forest",
    description: "A campaign description long enough for tests.",
    goalAmount: "1000",
    deadline: now + 10 * 24 * 60 * 60 * 1000,
    sponsors: [{ id: "s1", campaignId: "campaign-1", address: "backer-1", amount: "10", token: "XLM", sponsoredAt: now }],
  }, source, now).then((campaign) => source.saveCampaign({ ...campaign, status: "ACTIVE" }));
}

describe("campaign creator features", () => {
  beforeEach(() => resetCampaignCreatorFeatures());

  it("allows one reviewed extension of at most 30 days and notifies backers", async () => {
    const source = new InMemoryCampaignDataSource();
    const campaign = await activeCampaign(source);
    const request = await requestDeadlineExtension({ campaignId: campaign.id, requestedBy: campaign.creator, requestedDays: 30, dataSource: source, now });
    const result = await reviewDeadlineExtension({ campaignId: campaign.id, approved: true, reviewedBy: "staff", dataSource: source, now: now + 1 });
    expect(request.status).toBe("PENDING");
    expect(result.request.status).toBe("APPROVED");
    expect(result.campaign.deadline).toBe(campaign.deadline! + 30 * 24 * 60 * 60 * 1000);
    expect(result.notifications).toHaveLength(1);
    await expect(requestDeadlineExtension({ campaignId: campaign.id, requestedBy: campaign.creator, requestedDays: 1, dataSource: source })).rejects.toThrow("already used");
  });

  it("creates an unauthenticated preview token and clones into draft", async () => {
    const source = new InMemoryCampaignDataSource();
    const campaign = await activeCampaign(source);
    const token = await createPrivatePreview(campaign.id, source);
    expect((await getCampaignByPreviewToken(token, source))?.id).toBe(campaign.id);
    const clone = await cloneCampaign(campaign.id, "creator-1", undefined, source);
    expect(clone.status).toBe("DRAFT");
    expect(clone.raisedAmount).toBe("0");
    expect(clone.sponsors).toEqual([]);
    expect(clone.id).not.toBe(campaign.id);
  });
});
