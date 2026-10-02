import { beforeEach, describe, expect, it } from "vitest";
import { GET, POST } from "./route";
import { donationService } from "@/services/campaign-donation.service";
import {
  InMemoryCampaignDataSource,
  createCampaign,
  setCampaignDataSource,
} from "@/services/campaign.service";

const CAMPAIGN_ID = "camp-api-donation";
const DONOR = "GDONOR...AAAA";

const params = (id = CAMPAIGN_ID) => ({ params: Promise.resolve({ id }) });
const json = <T>(response: Response) => response.json() as Promise<T>;

const postDonation = (body: unknown, id = CAMPAIGN_ID) =>
  POST(
    new Request(`http://test/api/campaigns/${id}/donations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }) as never,
    params(id) as never,
  );

describe("POST /api/campaigns/:id/donations (#1001)", () => {
  let source: InMemoryCampaignDataSource;

  beforeEach(async () => {
    source = new InMemoryCampaignDataSource();
    setCampaignDataSource(source);
    donationService.reset();
    await createCampaign(
      { id: CAMPAIGN_ID, creator: "GCREATOR", name: "Api campaign", goalAmount: "1000" },
      source,
      1,
    );
    const campaign = (await source.getCampaigns())[0];
    await source.saveCampaign({ ...campaign, status: "ACTIVE" });
  });

  it("records a one-time donation and returns its receipt", async () => {
    const response = await postDonation({
      donorAddress: DONOR,
      amount: "100",
      token: "XLM",
      message: "Keep going",
    });
    const body = await json<{
      donation: { amount: string; allocation: string };
      receipt: { reference: string; allocationLabel: string };
      campaign: { raisedAmount: string };
      milestones: number[];
    }>(response);

    expect(response.status).toBe(201);
    expect(body.donation).toMatchObject({ amount: "100", allocation: "CREATOR_DISCRETION" });
    expect(body.receipt.reference).toMatch(/^DON-camp-api-donation-[A-Z0-9]{6}$/);
    expect(body.receipt.allocationLabel).toBe("Creator's discretion");
    expect(body.campaign.raisedAmount).toBe("100");
    // 100/1000 is only 10% funded, so no milestone is crossed yet.
    expect(body.milestones).toEqual([]);
  });

  it("rejects a missing amount with 400", async () => {
    const response = await postDonation({ donorAddress: DONOR });
    expect(response.status).toBe(400);
    const body = await json<{ code: string }>(response);
    expect(body.code).toBe("INVALID_AMOUNT");
  });

  it("rejects a wallet-less donation with 400", async () => {
    const response = await postDonation({ amount: "10" });
    expect(response.status).toBe(400);
    expect((await json<{ code: string }>(response)).code).toBe("INVALID_DONOR");
  });

  it("returns 404 for an unknown campaign", async () => {
    const response = await postDonation({ donorAddress: DONOR, amount: "10" }, "missing-campaign");
    expect(response.status).toBe(404);
  });

  it("returns 409 when the campaign is not accepting donations", async () => {
    const draft = new InMemoryCampaignDataSource();
    setCampaignDataSource(draft);
    await createCampaign(
      { id: CAMPAIGN_ID, creator: "GCREATOR", name: "Draft", goalAmount: "1000" },
      draft,
      1,
    );

    const response = await postDonation({ donorAddress: DONOR, amount: "10" });
    expect(response.status).toBe(409);
    expect((await json<{ code: string }>(response)).code).toBe("CAMPAIGN_NOT_ACCEPTING");
  });

  it("rejects malformed JSON with 400", async () => {
    const response = await POST(
      new Request(`http://test/api/campaigns/${CAMPAIGN_ID}/donations`, {
        method: "POST",
        body: "not-json",
      }) as never,
      params() as never,
    );
    expect(response.status).toBe(400);
  });
});

describe("GET /api/campaigns/:id/donations (#1001)", () => {
  beforeEach(async () => {
    const source = new InMemoryCampaignDataSource();
    setCampaignDataSource(source);
    donationService.reset();
    await createCampaign(
      { id: CAMPAIGN_ID, creator: "GCREATOR", name: "Api campaign", goalAmount: "1000" },
      source,
      1,
    );
    const campaign = (await source.getCampaigns())[0];
    await source.saveCampaign({ ...campaign, status: "ACTIVE" });
    await postDonation({ donorAddress: DONOR, amount: "75", token: "XLM" });
    await postDonation({ donorAddress: "GOTHER...BBBB", amount: "30", token: "USDC" });
  });

  it("returns per-token donation totals", async () => {
    const response = await GET(
      new Request(`http://test/api/campaigns/${CAMPAIGN_ID}/donations`) as never,
      params() as never,
    );
    const body = await json<{
      donationCount: number;
      totalsByToken: Record<string, string>;
    }>(response);

    expect(response.status).toBe(200);
    expect(body.donationCount).toBe(2);
    expect(body.totalsByToken).toEqual({ XLM: "75", USDC: "30" });
  });
});
