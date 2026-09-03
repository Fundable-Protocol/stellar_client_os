import { beforeEach, describe, expect, it } from "vitest";
import { GET, PATCH, POST } from "./route";
import { backersService } from "@/services/campaign-backers.service";

const CAMPAIGN = "camp-api";
const CREATOR = "GCREATOR...AAAA";
const ALICE = "GALICE...AAAA";
const BOB = "GBOB...BBBB";

const params = { params: Promise.resolve({ id: CAMPAIGN }) };
const request = (url: string, init?: RequestInit) => new Request(url, init);
const json = <T>(response: Response) => response.json() as Promise<T>;

function seed() {
  backersService.reset();
  backersService.registerCampaignCreator(CAMPAIGN, CREATOR);
  backersService.recordContribution({ campaignId: CAMPAIGN, backerAddress: ALICE, amount: "900", token: "XLM", displayName: "Alice Adams" });
  backersService.recordContribution({ campaignId: CAMPAIGN, backerAddress: BOB, amount: "1200", token: "XLM", displayName: "Bob Bale" });
}

describe("GET /api/campaigns/:id/backers", () => {
  beforeEach(seed);

  it("returns the ranked leaderboard", async () => {
    const response = await GET(request(`http://test/api/campaigns/${CAMPAIGN}/backers`) as never, params as never);
    const body = await json<{ backers: { displayName: string; rank: number }[]; totalBackers: number }>(response);

    expect(response.status).toBe(200);
    expect(body.totalBackers).toBe(2);
    expect(body.backers[0]).toMatchObject({ rank: 1, displayName: "Bob Bale" });
  });

  it("applies privacy preferences for public viewers", async () => {
    backersService.setPrivacyPreference({ campaignId: CAMPAIGN, backerAddress: BOB, visibility: "ANONYMOUS" });
    backersService.setPrivacyPreference({ campaignId: CAMPAIGN, backerAddress: ALICE, visibility: "PRIVATE" });

    const publicResponse = await json<{ backers: { displayName: string }[]; privateBackers: number }>(
      await GET(request(`http://test/api/campaigns/${CAMPAIGN}/backers?viewer=GPUBLIC...PPPP`) as never, params as never),
    );
    expect(publicResponse.backers.map((entry) => entry.displayName)).toEqual(["Anonymous backer"]);
    expect(publicResponse.privateBackers).toBe(1);

    const creatorResponse = await json<{ backers: { displayName: string }[] }>(
      await GET(
        request(`http://test/api/campaigns/${CAMPAIGN}/backers?viewer=${CREATOR}&creator=${CREATOR}`) as never,
        params as never,
      ),
    );
    expect(creatorResponse.backers.map((entry) => entry.displayName)).toContain("Bob Bale");
  });

  it("honours the limit query parameter", async () => {
    const body = await json<{ backers: unknown[]; limit: number }>(
      await GET(request(`http://test/api/campaigns/${CAMPAIGN}/backers?limit=1`) as never, params as never),
    );
    expect(body.limit).toBe(1);
    expect(body.backers).toHaveLength(1);
  });
});

describe("POST /api/campaigns/:id/backers", () => {
  beforeEach(seed);

  it("records a contribution and returns the refreshed board", async () => {
    const response = await POST(
      request(`http://test/api/campaigns/${CAMPAIGN}/backers`, {
        method: "POST",
        body: JSON.stringify({ backerAddress: "GCAROL...CCCC", amount: "5000", token: "USDC", displayName: "Carol Cruz" }),
      }) as never,
      params as never,
    );

    expect(response.status).toBe(201);
    const body = await json<{ success: boolean; leaderboard: { backers: { displayName: string }[] } }>(response);
    expect(body.success).toBe(true);
    expect(body.leaderboard.backers[0].displayName).toBe("Carol Cruz");
  });

  it("rejects payloads without an address or amount", async () => {
    const noAddress = await POST(
      request(`http://test/api/campaigns/${CAMPAIGN}/backers`, { method: "POST", body: JSON.stringify({ amount: "10" }) }) as never,
      params as never,
    );
    expect(noAddress.status).toBe(400);

    const noAmount = await POST(
      request(`http://test/api/campaigns/${CAMPAIGN}/backers`, { method: "POST", body: JSON.stringify({ backerAddress: ALICE }) }) as never,
      params as never,
    );
    expect(noAmount.status).toBe(400);
  });
});

describe("PATCH /api/campaigns/:id/backers", () => {
  beforeEach(seed);

  it("updates the backer's privacy preference", async () => {
    const response = await PATCH(
      request(`http://test/api/campaigns/${CAMPAIGN}/backers`, {
        method: "PATCH",
        body: JSON.stringify({ backerAddress: BOB, visibility: "ANONYMOUS", showAmount: false }),
      }) as never,
      params as never,
    );

    expect(response.status).toBe(200);
    const body = await json<{ preference: { visibility: string; showAmount: boolean } }>(response);
    expect(body.preference).toMatchObject({ visibility: "ANONYMOUS", showAmount: false });
  });

  it("removes an existing feature when the backer opts out", async () => {
    backersService.featureBacker({ campaignId: CAMPAIGN, backerAddress: BOB, featuredBy: CREATOR });
    expect(backersService.isFeatured(CAMPAIGN, BOB)).toBe(true);

    const body = await json<{ removedFromFeatured: boolean }>(
      await PATCH(
        request(`http://test/api/campaigns/${CAMPAIGN}/backers`, {
          method: "PATCH",
          body: JSON.stringify({ backerAddress: BOB, visibility: "PRIVATE" }),
        }) as never,
        params as never,
      ),
    );

    expect(body.removedFromFeatured).toBe(true);
    expect(backersService.isFeatured(CAMPAIGN, BOB)).toBe(false);
  });

  it("rejects an unknown visibility", async () => {
    const response = await PATCH(
      request(`http://test/api/campaigns/${CAMPAIGN}/backers`, {
        method: "PATCH",
        body: JSON.stringify({ backerAddress: BOB, visibility: "SECRET" }),
      }) as never,
      params as never,
    );
    expect(response.status).toBe(400);
  });
});
