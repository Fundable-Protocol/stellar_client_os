import { beforeEach, describe, expect, it } from "vitest";
import { DELETE, POST } from "./route";
import { backersService } from "@/services/campaign-backers.service";
import { MAX_FEATURED_BACKERS } from "@/types/campaign-backers";

const CAMPAIGN = "camp-featured-api";
const CREATOR = "GCREATOR...AAAA";
const ALICE = "GALICE...AAAA";
const BOB = "GBOB...BBBB";
const CAROL = "GCAROL...CCCC";
const DAVE = "GDAVE...DDDD";

const params = { params: Promise.resolve({ id: CAMPAIGN }) };
const call = (method: string, body?: unknown, query = "") =>
  new Request(`http://test/api/campaigns/${CAMPAIGN}/backers/featured${query}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const json = <T>(response: Response) => response.json() as Promise<T>;

function seed() {
  backersService.reset();
  backersService.registerCampaignCreator(CAMPAIGN, CREATOR);
  backersService.recordContribution({ campaignId: CAMPAIGN, backerAddress: ALICE, amount: "100", displayName: "Alice Adams" });
  backersService.recordContribution({ campaignId: CAMPAIGN, backerAddress: BOB, amount: "200", displayName: "Bob Bale" });
  backersService.recordContribution({ campaignId: CAMPAIGN, backerAddress: CAROL, amount: "300", displayName: "Carol Cruz" });
  backersService.recordContribution({ campaignId: CAMPAIGN, backerAddress: DAVE, amount: "400", displayName: "Dave Diaz" });
}

describe("POST /api/campaigns/:id/backers/featured", () => {
  beforeEach(seed);

  it("lets the creator feature a backer", async () => {
    const response = await POST(call("POST", { backerAddress: ALICE, featuredBy: CREATOR, note: "First in." }) as never, params as never);
    expect(response.status).toBe(201);
    const body = await json<{ success: boolean; featured: { backerAddress: string; note?: string } }>(response);
    expect(body.success).toBe(true);
    expect(body.featured).toMatchObject({ backerAddress: ALICE, note: "First in." });
    expect(backersService.isFeatured(CAMPAIGN, ALICE)).toBe(true);
  });

  it("rejects anyone who is not the creator", async () => {
    const response = await POST(call("POST", { backerAddress: ALICE, featuredBy: BOB }) as never, params as never);
    expect(response.status).toBe(403);
    const body = await json<{ error: string }>(response);
    expect(body.error).toMatch(/Only the campaign creator/);
  });

  it("refuses to feature a backer who is not public", async () => {
    backersService.setPrivacyPreference({ campaignId: CAMPAIGN, backerAddress: BOB, visibility: "ANONYMOUS" });
    const response = await POST(call("POST", { backerAddress: BOB, featuredBy: CREATOR }) as never, params as never);
    expect(response.status).toBe(403);
    expect(backersService.isFeatured(CAMPAIGN, BOB)).toBe(false);
  });

  it(`caps featuring at ${MAX_FEATURED_BACKERS}`, async () => {
    for (const address of [ALICE, BOB, CAROL]) {
      expect((await POST(call("POST", { backerAddress: address, featuredBy: CREATOR }) as never, params as never)).status).toBe(201);
    }
    const overflow = await POST(call("POST", { backerAddress: DAVE, featuredBy: CREATOR }) as never, params as never);
    expect(overflow.status).toBe(403);
    const body = await json<{ error: string }>(overflow);
    expect(body.error).toMatch(/up to 3/);
  });

  it("requires an address and an actor", async () => {
    expect((await POST(call("POST", { featuredBy: CREATOR }) as never, params as never)).status).toBe(400);
    expect((await POST(call("POST", { backerAddress: ALICE }) as never, params as never)).status).toBe(400);
  });
});

describe("DELETE /api/campaigns/:id/backers/featured", () => {
  beforeEach(seed);

  it("removes a feature for the creator", async () => {
    backersService.featureBacker({ campaignId: CAMPAIGN, backerAddress: ALICE, featuredBy: CREATOR });

    const response = await DELETE(call("DELETE", { backerAddress: ALICE, featuredBy: CREATOR }) as never, params as never);
    expect(response.status).toBe(200);
    const body = await json<{ success: boolean; removed: boolean }>(response);
    expect(body).toMatchObject({ success: true, removed: true });
    expect(backersService.isFeatured(CAMPAIGN, ALICE)).toBe(false);
  });

  it("accepts query parameters when the client sends no body", async () => {
    backersService.featureBacker({ campaignId: CAMPAIGN, backerAddress: BOB, featuredBy: CREATOR });

    const response = await DELETE(
      call("DELETE", undefined, `?backerAddress=${encodeURIComponent(BOB)}&featuredBy=${encodeURIComponent(CREATOR)}`) as never,
      params as never,
    );
    expect(response.status).toBe(200);
    expect(backersService.isFeatured(CAMPAIGN, BOB)).toBe(false);
  });

  it("rejects non-creators", async () => {
    backersService.featureBacker({ campaignId: CAMPAIGN, backerAddress: ALICE, featuredBy: CREATOR });
    const response = await DELETE(call("DELETE", { backerAddress: ALICE, featuredBy: CAROL }) as never, params as never);
    expect(response.status).toBe(403);
    expect(backersService.isFeatured(CAMPAIGN, ALICE)).toBe(true);
  });
});
