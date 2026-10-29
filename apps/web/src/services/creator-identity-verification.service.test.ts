// @vitest-environment node
import { createHash } from "node:crypto";
import { Keypair } from "@stellar/stellar-sdk";
import { beforeEach, describe, expect, it } from "vitest";
import {
  CreatorIdentityVerificationService,
  CreatorVerificationError,
  VERIFICATION_CODE_MAX_ATTEMPTS,
  VERIFICATION_CODE_RESEND_COOLDOWN_MS,
  VERIFICATION_CODE_TTL_MS,
  syncCreatorVerificationToCampaigns,
  withCreatorVerification,
} from "./creator-identity-verification.service";
import { createCampaign, InMemoryCampaignDataSource } from "./campaign.service";
import { summarizeCreatorVerification } from "@/lib/creator-verification";

const creatorKeys = Keypair.random();
const CREATOR = creatorKeys.publicKey();
const DOC_KEY = `creator-identity/${CREATOR}/0f8fad5b-d9cb-469f-a165-70867728950e.jpg`;

function setup() {
  let now = 1_800_000_000_000;
  let nextCode = "123456";
  const emails: Array<{ to: string; code: string }> = [];
  const sms: Array<{ to: string; code: string }> = [];
  const changes: Array<{ creator: string; status: string }> = [];
  const service = new CreatorIdentityVerificationService({
    now: () => now,
    generateCode: () => nextCode,
    sendEmailCode: async (to, code) => {
      emails.push({ to, code });
      return true;
    },
    sendSmsCode: async (to, code) => {
      sms.push({ to, code });
      return true;
    },
    onSummaryChange: async (creator, summary) => {
      changes.push({ creator, status: summary.status });
    },
    exposeDevCodes: false,
  });
  return {
    service,
    emails,
    sms,
    changes,
    advance: (ms: number) => {
      now += ms;
    },
    setCode: (code: string) => {
      nextCode = code;
    },
  };
}

async function expectError(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(CreatorVerificationError);
  await promise.catch((error: CreatorVerificationError) => expect(error.code).toBe(code));
}

async function verifyAll(ctx: ReturnType<typeof setup>) {
  await ctx.service.startEmailVerification(CREATOR, "Creator@Example.org");
  await ctx.service.confirmEmailVerification(CREATOR, "123456");
  await ctx.service.startPhoneVerification(CREATOR, "+234 801 234 5678");
  await ctx.service.confirmPhoneVerification(CREATOR, "123456");
  await ctx.service.submitGovernmentId(CREATOR, { documentType: "passport", issuingCountry: "ng", documentReference: DOC_KEY });
  return ctx.service.reviewGovernmentId(CREATOR, { decision: "approve", reviewer: "admin@fundable" });
}

describe("CreatorIdentityVerificationService", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it("is optional: unknown creators are unverified with every step not started", () => {
    const status = ctx.service.getPublicStatus(CREATOR);
    expect(status.summary.status).toBe("unverified");
    expect(status.steps.map((step) => [step.step, step.status])).toEqual([
      ["email", "not_started"],
      ["phone", "not_started"],
      ["government_id", "not_started"],
    ]);
  });

  it("rejects invalid creator addresses, emails and phone numbers", async () => {
    expect(() => ctx.service.getPublicStatus("not-an-address")).toThrow(CreatorVerificationError);
    await expectError(ctx.service.startEmailVerification(CREATOR, "nope"), "INVALID_INPUT");
    await expectError(ctx.service.startPhoneVerification(CREATOR, "08012345678"), "INVALID_INPUT");
  });

  it("verifies email with a one-time code and keeps only a masked destination", async () => {
    const dispatch = await ctx.service.startEmailVerification(CREATOR, "Creator@Example.org");
    expect(ctx.emails).toEqual([{ to: "creator@example.org", code: "123456" }]);
    expect(dispatch).toMatchObject({ step: "email", status: "pending", maskedTarget: "c•••r@example.org" });
    expect(dispatch.devCode).toBeUndefined();
    expect(ctx.service.getOwnerStatus(CREATOR).steps[0]).toMatchObject({ status: "pending", maskedTarget: "c•••r@example.org" });

    const owner = await ctx.service.confirmEmailVerification(CREATOR, "123456");
    expect(owner.steps[0].status).toBe("verified");
    expect(owner.summary).toMatchObject({ status: "partial", emailVerified: true, badges: ["email"] });
    expect(JSON.stringify(owner)).not.toContain("creator@example.org");
    expect(ctx.changes.at(-1)).toEqual({ creator: CREATOR, status: "partial" });
  });

  it("verifies phone numbers in E.164 format via SMS", async () => {
    await ctx.service.startPhoneVerification(CREATOR, "+234 (801) 234-5678");
    expect(ctx.sms).toEqual([{ to: "+2348012345678", code: "123456" }]);
    const owner = await ctx.service.confirmPhoneVerification(CREATOR, "123456");
    expect(owner.steps[1]).toMatchObject({ step: "phone", status: "verified", maskedTarget: "+•••5678" });
  });

  it("limits wrong code attempts and expires codes", async () => {
    await ctx.service.startEmailVerification(CREATOR, "creator@example.org");
    for (let attempt = 1; attempt < VERIFICATION_CODE_MAX_ATTEMPTS; attempt += 1) {
      await expectError(ctx.service.confirmEmailVerification(CREATOR, "000000"), "INVALID_CODE");
    }
    await expectError(ctx.service.confirmEmailVerification(CREATOR, "000000"), "TOO_MANY_ATTEMPTS");
    // Even the correct code is refused once attempts are exhausted.
    await expectError(ctx.service.confirmEmailVerification(CREATOR, "123456"), "TOO_MANY_ATTEMPTS");

    ctx.advance(VERIFICATION_CODE_RESEND_COOLDOWN_MS);
    await ctx.service.startEmailVerification(CREATOR, "creator@example.org");
    ctx.advance(VERIFICATION_CODE_TTL_MS + 1);
    await expectError(ctx.service.confirmEmailVerification(CREATOR, "123456"), "CHALLENGE_EXPIRED");
    expect(ctx.service.getOwnerStatus(CREATOR).steps[0].status).toBe("not_started");
  });

  it("rate limits resends and requires a pending challenge before confirming", async () => {
    await expectError(ctx.service.confirmEmailVerification(CREATOR, "123456"), "NO_PENDING_CHALLENGE");
    await ctx.service.startEmailVerification(CREATOR, "creator@example.org");
    await expectError(ctx.service.startEmailVerification(CREATOR, "creator@example.org"), "RATE_LIMITED");
    ctx.advance(VERIFICATION_CODE_RESEND_COOLDOWN_MS);
    ctx.setCode("654321");
    await ctx.service.startEmailVerification(CREATOR, "creator@example.org");
    // The superseded code no longer works.
    await expectError(ctx.service.confirmEmailVerification(CREATOR, "123456"), "INVALID_CODE");
    await ctx.service.confirmEmailVerification(CREATOR, "654321");
    await expectError(ctx.service.startEmailVerification(CREATOR, "creator@example.org"), "INVALID_STATE");
  });

  it("surfaces delivery failures without creating a pending challenge", async () => {
    const service = new CreatorIdentityVerificationService({ sendEmailCode: async () => false, exposeDevCodes: false });
    await expectError(service.startEmailVerification(CREATOR, "creator@example.org"), "DELIVERY_FAILED");
    expect(service.getOwnerStatus(CREATOR).steps[0].status).toBe("not_started");
  });

  it("only echoes development codes when explicitly enabled", async () => {
    const service = new CreatorIdentityVerificationService({
      generateCode: () => "111222",
      sendEmailCode: async () => true,
      exposeDevCodes: true,
    });
    expect((await service.startEmailVerification(CREATOR, "creator@example.org")).devCode).toBe("111222");
  });

  it("requires a reviewer to approve the government ID and validates submissions", async () => {
    await expectError(
      ctx.service.submitGovernmentId(CREATOR, { documentType: "library_card", issuingCountry: "NG", documentReference: DOC_KEY }),
      "INVALID_INPUT",
    );
    await expectError(
      ctx.service.submitGovernmentId(CREATOR, { documentType: "passport", issuingCountry: "Nigeria", documentReference: DOC_KEY }),
      "INVALID_INPUT",
    );
    // References outside the creator's private identity prefix are refused.
    await expectError(
      ctx.service.submitGovernmentId(CREATOR, { documentType: "passport", issuingCountry: "NG", documentReference: "evidence/1/2/x.jpg" }),
      "INVALID_INPUT",
    );
    const other = Keypair.random().publicKey();
    await expectError(
      ctx.service.submitGovernmentId(CREATOR, {
        documentType: "passport",
        issuingCountry: "NG",
        documentReference: `creator-identity/${other}/x.jpg`,
      }),
      "INVALID_INPUT",
    );

    const pending = await ctx.service.submitGovernmentId(CREATOR, { documentType: "national_id", issuingCountry: "ng", documentReference: DOC_KEY });
    expect(pending.steps[2]).toMatchObject({ status: "pending", documentType: "national_id", issuingCountry: "NG" });
    expect(pending.summary.governmentIdVerified).toBe(false);
    await expectError(
      ctx.service.submitGovernmentId(CREATOR, { documentType: "passport", issuingCountry: "NG", documentReference: DOC_KEY }),
      "INVALID_STATE",
    );
    expect(ctx.service.listPendingGovernmentIdReviews()).toEqual([
      expect.objectContaining({ creator: CREATOR, documentType: "national_id", documentReference: DOC_KEY }),
    ]);
    // The public view never exposes the document or pending state.
    const publicStatus = ctx.service.getPublicStatus(CREATOR);
    expect(publicStatus.steps[2].status).toBe("not_started");
    expect(JSON.stringify(publicStatus)).not.toContain(DOC_KEY);

    await expectError(ctx.service.reviewGovernmentId(CREATOR, { decision: "reject", reviewer: "admin" }), "INVALID_INPUT");
    const rejected = await ctx.service.reviewGovernmentId(CREATOR, { decision: "reject", reviewer: "admin", reason: "Document is blurry" });
    expect(rejected.steps[2]).toMatchObject({ status: "rejected", rejectionReason: "Document is blurry" });
    await expectError(ctx.service.reviewGovernmentId(CREATOR, { decision: "approve", reviewer: "admin" }), "NOT_FOUND");

    // Creator may resubmit after a rejection.
    await ctx.service.submitGovernmentId(CREATOR, { documentType: "passport", issuingCountry: "NG", documentReference: DOC_KEY });
    const approved = await ctx.service.reviewGovernmentId(CREATOR, { decision: "approve", reviewer: "admin" });
    expect(approved.steps[2].status).toBe("verified");
    expect(ctx.service.listPendingGovernmentIdReviews()).toEqual([]);
  });

  it("earns the Verified Creator badge after all three steps and can be withdrawn", async () => {
    const owner = await verifyAll(ctx);
    expect(owner.summary).toMatchObject({ status: "verified", isVerified: true, verifiedCount: 3 });
    expect(owner.summary.verifiedAt).toBeDefined();
    expect(ctx.service.getSummary(CREATOR).isVerified).toBe(true);
    expect(ctx.changes.at(-1)).toEqual({ creator: CREATOR, status: "verified" });

    const withdrawn = await ctx.service.withdraw(CREATOR);
    expect(withdrawn.summary.status).toBe("unverified");
    expect(ctx.service.hasRecord(CREATOR)).toBe(false);
    expect(ctx.changes.at(-1)).toEqual({ creator: CREATOR, status: "unverified" });
  });

  it("drops the badge when a creator changes to an unverified email", async () => {
    await verifyAll(ctx);
    ctx.advance(VERIFICATION_CODE_RESEND_COOLDOWN_MS);
    await ctx.service.startEmailVerification(CREATOR, "new@example.org");
    expect(ctx.service.getSummary(CREATOR).status).toBe("partial");
    expect(ctx.changes.at(-1)).toEqual({ creator: CREATOR, status: "partial" });
  });

  describe("wallet sessions", () => {
    it("issues a session for a valid raw ed25519 signature of the challenge", () => {
      const challenge = ctx.service.issueSessionChallenge(CREATOR);
      expect(challenge.message).toContain(CREATOR);
      const signature = creatorKeys.sign(Buffer.from(challenge.message, "utf8")).toString("base64");
      const session = ctx.service.verifySessionChallenge({ address: CREATOR, nonce: challenge.nonce, signature });
      expect(session).not.toBeNull();
      expect(ctx.service.resolveSession(session!.token)).toBe(CREATOR);
      // Challenges are single-use.
      expect(ctx.service.verifySessionChallenge({ address: CREATOR, nonce: challenge.nonce, signature })).toBeNull();
    });

    it("accepts SEP-53 wallet message signatures", () => {
      const challenge = ctx.service.issueSessionChallenge(CREATOR);
      const digest = createHash("sha256")
        .update(Buffer.concat([Buffer.from("Stellar Signed Message:\n", "utf8"), Buffer.from(challenge.message, "utf8")]))
        .digest();
      const signature = creatorKeys.sign(digest).toString("base64");
      expect(ctx.service.verifySessionChallenge({ address: CREATOR, nonce: challenge.nonce, signature })).not.toBeNull();
    });

    it("rejects signatures from another key and expired sessions", () => {
      const challenge = ctx.service.issueSessionChallenge(CREATOR);
      const forged = Keypair.random().sign(Buffer.from(challenge.message, "utf8")).toString("base64");
      expect(ctx.service.verifySessionChallenge({ address: CREATOR, nonce: challenge.nonce, signature: forged })).toBeNull();

      const second = ctx.service.issueSessionChallenge(CREATOR);
      const signature = creatorKeys.sign(Buffer.from(second.message, "utf8")).toString("base64");
      const session = ctx.service.verifySessionChallenge({ address: CREATOR, nonce: second.nonce, signature })!;
      ctx.advance(60 * 60 * 1000 + 1);
      expect(ctx.service.resolveSession(session.token)).toBeNull();
      expect(ctx.service.resolveSession(undefined)).toBeNull();
    });
  });
});

describe("campaign synchronisation", () => {
  it("copies the summary onto every campaign owned by the creator", async () => {
    const source = new InMemoryCampaignDataSource(async () => {});
    await createCampaign({ id: "mine-1", creator: CREATOR, name: "Mine 1", goalAmount: "100" }, source);
    await createCampaign({ id: "mine-2", creator: CREATOR, name: "Mine 2", goalAmount: "100" }, source);
    await createCampaign({ id: "theirs", creator: "someone-else", name: "Theirs", goalAmount: "100" }, source);
    const summary = summarizeCreatorVerification({ emailVerified: true, phoneVerified: true, governmentIdVerified: true });

    expect(await syncCreatorVerificationToCampaigns(CREATOR, summary, source)).toBe(2);
    const byId = new Map((await source.getCampaigns()).map((campaign) => [campaign.id, campaign]));
    expect(byId.get("mine-1")?.creatorVerification?.isVerified).toBe(true);
    expect(byId.get("mine-2")?.creatorVerification?.isVerified).toBe(true);
    expect(byId.get("theirs")?.creatorVerification).toBeUndefined();
  });

  it("overlays live verification data at read time", async () => {
    const ctx = setup();
    await verifyAll(ctx);
    const enriched = withCreatorVerification({ id: "x", creator: CREATOR }, ctx.service);
    expect(enriched.creatorVerification.isVerified).toBe(true);
    const untouched = withCreatorVerification({ id: "y", creator: "unknown" }, ctx.service);
    expect(untouched.creatorVerification.status).toBe("unverified");
  });
});
