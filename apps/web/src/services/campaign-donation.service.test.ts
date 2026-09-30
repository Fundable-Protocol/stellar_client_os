import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryCampaignDataSource, createCampaign } from "./campaign.service";
import { CampaignDonationService } from "./campaign-donation.service";
import { MAX_DONATION_MESSAGE_LENGTH } from "@/types/campaign-donation";

const CAMPAIGN_ID = "camp-1001";

describe("CampaignDonationService (#1001)", () => {
  let source: InMemoryCampaignDataSource;
  let service: CampaignDonationService;

  async function seedActiveCampaign(goalAmount = "1000") {
    await createCampaign(
      { id: CAMPAIGN_ID, creator: "GCREATOR", name: "Amazon reforestation", goalAmount },
      source,
      1,
    );
    const campaign = (await source.getCampaigns())[0];
    return source.saveCampaign({ ...campaign, status: "ACTIVE" });
  }

  beforeEach(() => {
    source = new InMemoryCampaignDataSource();
    service = new CampaignDonationService();
  });

  it("requires a connected donor address", async () => {
    await seedActiveCampaign();
    const result = await service.donate({ campaignId: CAMPAIGN_ID, donorAddress: "  ", amount: "50" }, source);
    expect(result).toMatchObject({ ok: false, code: "INVALID_DONOR" });
  });

  it("rejects an unknown campaign", async () => {
    const result = await service.donate(
      { campaignId: "missing", donorAddress: "GDONOR", amount: "50" },
      source,
    );
    expect(result).toMatchObject({ ok: false, code: "INVALID_CAMPAIGN" });
  });

  it("rejects campaigns that are not accepting donations", async () => {
    await createCampaign({ id: CAMPAIGN_ID, creator: "GCREATOR", name: "Draft", goalAmount: "1000" }, source, 1);
    const result = await service.donate(
      { campaignId: CAMPAIGN_ID, donorAddress: "GDONOR", amount: "50" },
      source,
    );
    expect(result).toMatchObject({ ok: false, code: "CAMPAIGN_NOT_ACCEPTING" });
  });

  it.each(["0", "-5", "1.5", "abc", "", "1000001"])(
    "rejects invalid amount %j",
    async (amount) => {
      await seedActiveCampaign();
      const result = await service.donate(
        { campaignId: CAMPAIGN_ID, donorAddress: "GDONOR", amount },
        source,
      );
      expect(result.ok).toBe(false);
      expect(result).toMatchObject({ code: "INVALID_AMOUNT" });
    },
  );

  it("rejects unsupported tokens", async () => {
    await seedActiveCampaign();
    const result = await service.donate(
      { campaignId: CAMPAIGN_ID, donorAddress: "GDONOR", amount: "50", token: "BTC" },
      source,
    );
    expect(result).toMatchObject({ ok: false, code: "INVALID_TOKEN" });
  });

  it("rejects an over-long donor message", async () => {
    await seedActiveCampaign();
    const result = await service.donate(
      {
        campaignId: CAMPAIGN_ID,
        donorAddress: "GDONOR",
        amount: "50",
        message: "x".repeat(MAX_DONATION_MESSAGE_LENGTH + 1),
      },
      source,
    );
    expect(result).toMatchObject({ ok: false, code: "MESSAGE_TOO_LONG" });
  });

  it("records a one-time donation at the creator's discretion and issues a receipt", async () => {
    await seedActiveCampaign();
    const result = await service.donate(
      {
        campaignId: CAMPAIGN_ID,
        donorAddress: "GDONOR1234567890",
        amount: "500",
        token: "XLM",
        message: "  For the rangers  ",
        anonymous: true,
        txHash: "abc123",
      },
      source,
      5_000,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.donation).toMatchObject({
      campaignId: CAMPAIGN_ID,
      donorAddress: "GDONOR1234567890",
      amount: "500",
      token: "XLM",
      allocation: "CREATOR_DISCRETION",
      message: "For the rangers",
      anonymous: true,
      status: "CONFIRMED",
      txHash: "abc123",
    });
    // No tree is assigned to the donation — the amount goes straight to the campaign.
    expect(result.campaign.treeCount).toBe(0);
    expect(result.campaign.raisedAmount).toBe("500");
    expect(result.milestones).toEqual([25, 50]);

    expect(result.receipt.reference).toMatch(/^DON-camp-1001-[A-Z0-9]{6}$/);
    expect(result.receipt.campaignName).toBe("Amazon reforestation");
    expect(result.receipt.allocationLabel).toBe("Creator's discretion");
    expect(service.getReceipt(result.donation.id)).toEqual(result.receipt);
    expect(service.getDonations(CAMPAIGN_ID)).toHaveLength(1);
  });

  it("defaults to XLM when no token is supplied", async () => {
    await seedActiveCampaign();
    const result = await service.donate(
      { campaignId: CAMPAIGN_ID, donorAddress: "GDONOR", amount: "10" },
      source,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.donation.token).toBe("XLM");
  });

  it("is idempotent for a repeated idempotency key", async () => {
    await seedActiveCampaign();
    const payload = {
      campaignId: CAMPAIGN_ID,
      donorAddress: "GDONOR",
      amount: "200",
      idempotencyKey: "retry-7",
    };

    const first = await service.donate(payload, source, 10);
    const second = await service.donate(payload, source, 20);

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.donation.id).toBe(first.donation.id);

    const campaign = (await source.getCampaigns())[0];
    expect(campaign.raisedAmount).toBe("200");
    expect(service.getDonations(CAMPAIGN_ID)).toHaveLength(1);
  });

  it("summarises donations per token without mixing currencies", async () => {
    await seedActiveCampaign();
    await service.donate(
      { campaignId: CAMPAIGN_ID, donorAddress: "GA1", amount: "100", token: "XLM" },
      source,
      100,
    );
    await service.donate(
      { campaignId: CAMPAIGN_ID, donorAddress: "GA2", amount: "40", token: "USDC" },
      source,
      200,
    );
    await service.donate(
      { campaignId: CAMPAIGN_ID, donorAddress: "GA3", amount: "25", token: "XLM" },
      source,
      300,
    );

    expect(service.getSummary(CAMPAIGN_ID)).toEqual({
      campaignId: CAMPAIGN_ID,
      donationCount: 3,
      totalsByToken: { XLM: "125", USDC: "40" },
      latestDonationAt: 300,
    });
    expect(service.getDonations(CAMPAIGN_ID).map((donation) => donation.donorAddress)).toEqual([
      "GA1",
      "GA2",
      "GA3",
    ]);
  });
});
