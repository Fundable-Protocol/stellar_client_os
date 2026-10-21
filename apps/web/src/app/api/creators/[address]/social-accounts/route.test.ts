import { beforeEach, describe, expect, it } from "vitest";
import { GET, POST, PATCH, DELETE } from "./route";
import { resetSocialSchedulerStore } from "@/services/campaign-social-scheduler.service";

const CREATOR = "GD6W...X892";

describe("/api/creators/[address]/social-accounts route (Issue #1266)", () => {
  beforeEach(() => {
    resetSocialSchedulerStore();
  });

  it("returns default disconnected social settings on GET", async () => {
    const req = new Request(`http://localhost/api/creators/${CREATOR}/social-accounts`);
    const res = await GET(req, { params: Promise.resolve({ address: CREATOR }) });
    expect(res.status).toBe(200);
    const { settings } = await res.json();
    expect(settings.creatorAddress).toBe(CREATOR);
    expect(settings.accounts.twitter.connected).toBe(false);
    expect(settings.accounts.facebook.connected).toBe(false);
    expect(settings.accounts.linkedin.connected).toBe(false);
  });

  it("connects, updates defaults, and disconnects social accounts", async () => {
    const postReq = new Request(`http://localhost/api/creators/${CREATOR}/social-accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        platform: "twitter",
        handle: "amazon_reserve",
        displayName: "Amazon Reserve Official",
      }),
    });

    const postRes = await POST(postReq, { params: Promise.resolve({ address: CREATOR }) });
    expect(postRes.status).toBe(200);
    const connected = await postRes.json();
    expect(connected.settings.accounts.twitter.connected).toBe(true);
    expect(connected.settings.accounts.twitter.handle).toBe("@amazon_reserve");

    const patchReq = new Request(`http://localhost/api/creators/${CREATOR}/social-accounts`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        defaultHashtags: ["#Amazon", "#Reforestation"],
        timezone: "America/Sao_Paulo",
      }),
    });

    const patchRes = await PATCH(patchReq, { params: Promise.resolve({ address: CREATOR }) });
    expect(patchRes.status).toBe(200);
    const patched = await patchRes.json();
    expect(patched.settings.defaultHashtags).toEqual(["#Amazon", "#Reforestation"]);
    expect(patched.settings.timezone).toBe("America/Sao_Paulo");

    const delReq = new Request(
      `http://localhost/api/creators/${CREATOR}/social-accounts?platform=twitter`,
      { method: "DELETE" },
    );
    const delRes = await DELETE(delReq, { params: Promise.resolve({ address: CREATOR }) });
    expect(delRes.status).toBe(200);
    const disconnected = await delRes.json();
    expect(disconnected.settings.accounts.twitter.connected).toBe(false);
  });
});
