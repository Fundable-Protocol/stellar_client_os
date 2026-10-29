// @vitest-environment node
import { Keypair } from "@stellar/stellar-sdk";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getStatus, DELETE as withdraw } from "./route";
import { POST as sessionRoute } from "./session/route";
import { POST as emailRoute } from "./email/route";
import { POST as phoneRoute } from "./phone/route";
import { POST as submitGovernmentId, PATCH as reviewGovernmentId } from "./government-id/route";
import { GET as adminQueue } from "@/app/api/admin/creator-verifications/route";
import { GET as searchCampaigns } from "@/app/api/campaigns/search/route";
import { GET as listCampaigns } from "@/app/api/campaigns/route";
import { creatorIdentityVerificationService } from "@/services/creator-identity-verification.service";
import { createCampaign, InMemoryCampaignDataSource, setCampaignDataSource } from "@/services/campaign.service";
import { EmailService } from "@/services/email.service";

const ADMIN_KEY = "test-admin-key";
const creatorKeys = Keypair.random();
const CREATOR = creatorKeys.publicKey();
const ctx = (address = CREATOR) => ({ params: Promise.resolve({ address }) });
const url = (path = "") => `http://localhost/api/creators/${CREATOR}/verification${path}`;

function jsonRequest(path: string, body: unknown, init: { token?: string; method?: string; admin?: boolean } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  if (init.admin) headers.authorization = `Bearer ${ADMIN_KEY}`;
  return new Request(url(path), { method: init.method ?? "POST", headers, body: JSON.stringify(body) });
}

async function openSession(keys = creatorKeys, address = keys.publicKey()): Promise<string> {
  const challengeRes = await sessionRoute(jsonRequest("/session", { action: "challenge" }), ctx(address));
  expect(challengeRes.status).toBe(200);
  const challenge = await challengeRes.json();
  const signature = keys.sign(Buffer.from(challenge.message, "utf8")).toString("base64");
  const verifyRes = await sessionRoute(jsonRequest("/session", { action: "verify", nonce: challenge.nonce, signature }), ctx(address));
  expect(verifyRes.status).toBe(200);
  return (await verifyRes.json()).token;
}

async function verifyContact(step: "email" | "phone", value: string, token: string) {
  const route = step === "email" ? emailRoute : phoneRoute;
  const start = await route(jsonRequest(`/${step}`, { action: "start", [step]: value }, { token }), ctx());
  expect(start.status).toBe(202);
  const { dispatch } = await start.json();
  expect(dispatch.devCode).toMatch(/^\d{6}$/);
  const confirm = await route(jsonRequest(`/${step}`, { action: "confirm", code: dispatch.devCode }, { token }), ctx());
  expect(confirm.status).toBe(200);
  return (await confirm.json()).verification;
}

const previousEnv = { dev: process.env.CREATOR_VERIFICATION_DEV_CODES, admin: process.env.ADMIN_API_KEY };

beforeEach(async () => {
  process.env.CREATOR_VERIFICATION_DEV_CODES = "true";
  process.env.ADMIN_API_KEY = ADMIN_KEY;
  vi.spyOn(EmailService.prototype, "sendEmail").mockResolvedValue(true);
  vi.spyOn(console, "log").mockImplementation(() => {});
  creatorIdentityVerificationService.reset();
  const source = new InMemoryCampaignDataSource(async () => {});
  setCampaignDataSource(source);
  await createCampaign({ id: "verified-forest", creator: CREATOR, name: "Mangrove forest revival", goalAmount: "1000" }, source);
  await createCampaign({ id: "other-forest", creator: Keypair.random().publicKey(), name: "Mangrove forest guardians", goalAmount: "1000" }, source);
});

afterAll(() => {
  process.env.CREATOR_VERIFICATION_DEV_CODES = previousEnv.dev;
  process.env.ADMIN_API_KEY = previousEnv.admin;
  vi.restoreAllMocks();
});

describe("creator identity verification API", () => {
  it("returns a public, unverified status by default and rejects invalid addresses", async () => {
    const res = await getStatus(new Request(url()), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.owner).toBe(false);
    expect(body.verification.summary).toMatchObject({ status: "unverified", isVerified: false });

    const invalid = await getStatus(new Request("http://localhost/api/creators/nope/verification"), ctx("nope"));
    expect(invalid.status).toBe(400);
  });

  it("requires a wallet-signed session owned by the same creator for mutations", async () => {
    const anonymous = await emailRoute(jsonRequest("/email", { action: "start", email: "a@example.org" }), ctx());
    expect(anonymous.status).toBe(401);

    const intruder = Keypair.random();
    const intruderToken = await openSession(intruder);
    const forbidden = await emailRoute(jsonRequest("/email", { action: "start", email: "a@example.org" }, { token: intruderToken }), ctx());
    expect(forbidden.status).toBe(403);

    // A signature from another key cannot open a session for this creator.
    const challenge = await (await sessionRoute(jsonRequest("/session", { action: "challenge" }), ctx())).json();
    const forged = intruder.sign(Buffer.from(challenge.message, "utf8")).toString("base64");
    const rejected = await sessionRoute(jsonRequest("/session", { action: "verify", nonce: challenge.nonce, signature: forged }), ctx());
    expect(rejected.status).toBe(401);
  });

  it("validates request bodies and maps service errors to HTTP status codes", async () => {
    const token = await openSession();
    const badBody = await emailRoute(jsonRequest("/email", { action: "start" }, { token }), ctx());
    expect(badBody.status).toBe(400);
    const badEmail = await emailRoute(jsonRequest("/email", { action: "start", email: "not-an-email" }, { token }), ctx());
    expect(badEmail.status).toBe(400);
    const noChallenge = await phoneRoute(jsonRequest("/phone", { action: "confirm", code: "123456" }, { token }), ctx());
    expect(noChallenge.status).toBe(409);
    expect((await noChallenge.json()).code).toBe("NO_PENDING_CHALLENGE");
  });

  it("walks the full flow, earns the badge and surfaces it in search and listings", async () => {
    const token = await openSession();

    const afterEmail = await verifyContact("email", "creator@example.org", token);
    expect(afterEmail.summary.status).toBe("partial");
    const afterPhone = await verifyContact("phone", "+2348012345678", token);
    expect(afterPhone.summary.verifiedCount).toBe(2);

    const documentReference = `creator-identity/${CREATOR}/6f9619ff-8b86-d011-b42d-00cf4fc964ff.jpg`;
    const submitted = await submitGovernmentId(
      jsonRequest("/government-id", { documentType: "passport", issuingCountry: "NG", documentReference }, { token }),
      ctx(),
    );
    expect(submitted.status).toBe(202);
    expect((await submitted.json()).verification.steps[2].status).toBe("pending");

    // Admin review queue is protected.
    expect((await adminQueue(new Request("http://localhost/api/admin/creator-verifications"))).status).toBe(401);
    const queue = await adminQueue(
      new Request("http://localhost/api/admin/creator-verifications", { headers: { authorization: `Bearer ${ADMIN_KEY}` } }),
    );
    expect((await queue.json()).pending).toEqual([expect.objectContaining({ creator: CREATOR, documentReference })]);

    // Creators cannot approve themselves.
    const selfApprove = await reviewGovernmentId(
      jsonRequest("/government-id", { decision: "approve", reviewer: "me" }, { token, method: "PATCH" }),
      ctx(),
    );
    expect(selfApprove.status).toBe(401);

    const approved = await reviewGovernmentId(
      jsonRequest("/government-id", { decision: "approve", reviewer: "trust-team" }, { admin: true, method: "PATCH" }),
      ctx(),
    );
    expect(approved.status).toBe(200);
    expect((await approved.json()).verification.summary).toMatchObject({ status: "verified", isVerified: true });

    // Public status: badge visible, no personal data.
    const publicStatus = await (await getStatus(new Request(url()), ctx())).json();
    expect(publicStatus.verification.summary.isVerified).toBe(true);
    expect(JSON.stringify(publicStatus)).not.toContain("creator@example.org");
    expect(JSON.stringify(publicStatus)).not.toContain(documentReference);
    // Owner view with session.
    const ownerStatus = await (await getStatus(new Request(url(), { headers: { authorization: `Bearer ${token}` } }), ctx())).json();
    expect(ownerStatus.owner).toBe(true);
    expect(ownerStatus.verification.steps[0].maskedTarget).toBe("c•••r@example.org");

    // Search results surface verification status, rank verified creators first and support a verified-only filter.
    const search = await (await searchCampaigns(new Request("http://localhost/api/campaigns/search?q=mangrove"))).json();
    expect(search.data.map((result: { campaign: { id: string } }) => result.campaign.id)).toEqual(["verified-forest", "other-forest"]);
    expect(search.data[0].verification).toMatchObject({ status: "verified", isVerified: true });
    expect(search.data[1].verification).toMatchObject({ status: "unverified", isVerified: false });

    const verifiedOnly = await (await searchCampaigns(new Request("http://localhost/api/campaigns/search?verified=true"))).json();
    expect(verifiedOnly.data.map((result: { campaign: { id: string } }) => result.campaign.id)).toEqual(["verified-forest"]);
    expect((await searchCampaigns(new Request("http://localhost/api/campaigns/search?verified=maybe"))).status).toBe(400);

    // Campaign listing carries the badge state (synced onto the campaign records).
    const list = await (await listCampaigns(new Request("http://localhost/api/campaigns?limit=10"))).json();
    const listed = new Map(list.data.map((campaign: { id: string }) => [campaign.id, campaign]));
    expect(listed.get("verified-forest")).toMatchObject({ verified: true, verificationStatus: "verified" });
    expect(listed.get("other-forest")).toMatchObject({ verified: false, verificationStatus: "unverified" });
    const listVerified = await (await listCampaigns(new Request("http://localhost/api/campaigns?verified=true"))).json();
    expect(listVerified.data.map((campaign: { id: string }) => campaign.id)).toEqual(["verified-forest"]);
    expect((await listCampaigns(new Request("http://localhost/api/campaigns?verified=maybe"))).status).toBe(400);

    // Optional: the creator can withdraw, which removes the badge everywhere.
    const withdrawn = await withdraw(new Request(url(), { method: "DELETE", headers: { authorization: `Bearer ${token}` } }), ctx());
    expect(withdrawn.status).toBe(200);
    expect((await withdrawn.json()).verification.summary.status).toBe("unverified");
    const afterWithdraw = await (await searchCampaigns(new Request("http://localhost/api/campaigns/search?verified=true"))).json();
    expect(afterWithdraw.data).toEqual([]);
  });
});
