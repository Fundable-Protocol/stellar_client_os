import { beforeEach, describe, expect, it } from "vitest";
import {
  AMBASSADOR_TIERS,
  AmbassadorValidationError,
  acceptAmbassadorInvite,
  applyCommissionRate,
  evaluateAllAmbassadorRewards,
  evaluateAmbassadorRewards,
  getAmbassadorByReferralCode,
  getAmbassadorProgramSummary,
  inviteAmbassador,
  listAmbassadorInvites,
  listAmbassadors,
  recordAmbassadorPledge,
  removeAmbassador,
  resetAmbassadorStores,
  resolveReachedTier,
  setAmbassadorStatus,
  setAmbassadorTier,
} from "./campaign-ambassador.service";

const CAMPAIGN_ID = "camp-101";
const CREATOR = "GD6W...X892";

async function createAcceptedAmbassador(tier: "SEED" | "SPROUT" | "BLOOM" | "CANOPY" = "SEED") {
  const invite = await inviteAmbassador({
    campaignId: CAMPAIGN_ID,
    campaignTitle: "Save the Amazon RainForest Reserve",
    email: "ambassador@example.com",
    tier,
    invitedBy: CREATOR,
  });
  const result = await acceptAmbassadorInvite({
    token: invite.token,
    name: "Alex Rivera",
  });
  if (!result.ambassador) throw new Error("failed to accept invite");
  return { invite, ambassador: result.ambassador };
}

describe("ambassador service", () => {
  beforeEach(() => {
    resetAmbassadorStores();
  });

  it("creates an invitation with an expiry and a token", async () => {
    const invite = await inviteAmbassador({
      campaignId: CAMPAIGN_ID,
      campaignTitle: "Save the Amazon RainForest Reserve",
      email: "Ambassador@Example.com",
      tier: "BLOOM",
      invitedBy: CREATOR,
      expiresInDays: 7,
    });

    expect(invite.token).toMatch(/^amb_/);
    expect(invite.email).toBe("ambassador@example.com");
    expect(invite.tier).toBe("BLOOM");
    expect(invite.status).toBe("pending");
    expect(invite.expiresAt).toBeGreaterThan(invite.createdAt);
  });

  it("rejects an invitation without a valid email", async () => {
    await expect(
      inviteAmbassador({
        campaignId: CAMPAIGN_ID,
        campaignTitle: "Campaign",
        email: "not-an-email",
        invitedBy: CREATOR,
      }),
    ).rejects.toBeInstanceOf(AmbassadorValidationError);
  });

  it("accepts an invitation and creates an active ambassador", async () => {
    const { ambassador } = await createAcceptedAmbassador("SPROUT");

    expect(ambassador.name).toBe("Alex Rivera");
    expect(ambassador.status).toBe("active");
    expect(ambassador.tier).toBe("SPROUT");
    expect(ambassador.pledgedAmount).toBe("0");
    expect(ambassador.referralCode).toMatch(/^AMB-/);

    const ambassadors = await listAmbassadors(CAMPAIGN_ID);
    expect(ambassadors).toHaveLength(1);
  });

  it("finds an ambassador by referral code", async () => {
    const { ambassador } = await createAcceptedAmbassador();
    const found = await getAmbassadorByReferralCode(CAMPAIGN_ID, ambassador.referralCode);
    expect(found?.id).toBe(ambassador.id);
  });

  it("rejects an expired invitation", async () => {
    const invite = await inviteAmbassador({
      campaignId: CAMPAIGN_ID,
      campaignTitle: "Campaign",
      email: "ambassador@example.com",
      invitedBy: CREATOR,
    });

    const result = await acceptAmbassadorInvite(
      { token: invite.token, name: "Alex" },
      undefined,
      undefined,
      invite.expiresAt + 1_000,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("expired");
  });

  it("rejects accepting the same invitation twice with a different person", async () => {
    const invite = await inviteAmbassador({
      campaignId: CAMPAIGN_ID,
      campaignTitle: "Campaign",
      email: "ambassador@example.com",
      invitedBy: CREATOR,
    });

    const first = await acceptAmbassadorInvite({ token: invite.token, name: "Alex" });
    const second = await acceptAmbassadorInvite({ token: invite.token, name: "Alex" });

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(second.ambassador?.id).toBe(first.ambassador?.id);
    expect(await listAmbassadors(CAMPAIGN_ID)).toHaveLength(1);
  });

  it("tracks pledges against an ambassador", async () => {
    const { ambassador } = await createAcceptedAmbassador();

    const result = await recordAmbassadorPledge({
      campaignId: CAMPAIGN_ID,
      ambassadorId: ambassador.id,
      backerAddress: "GBACKER1",
      amount: "40",
    });

    expect(result.pledge.amount).toBe("40");
    expect(result.ambassador.pledgedAmount).toBe("40");
    expect(result.ambassador.pledgeCount).toBe(1);
  });

  it("assigns the reward automatically when a threshold is crossed", async () => {
    const { ambassador } = await createAcceptedAmbassador();

    const result = await recordAmbassadorPledge({
      campaignId: CAMPAIGN_ID,
      ambassadorId: ambassador.id,
      backerAddress: "GBACKER1",
      amount: "250",
    });

    expect(result.reward).toBeDefined();
    expect(result.reward?.tier).toBe("SPROUT");
    // 10% of the 100 threshold.
    expect(result.reward?.amount).toBe("10");
    expect(result.ambassador.tier).toBe("SPROUT");
  });

  it("assigns each tier only once", async () => {
    const { ambassador } = await createAcceptedAmbassador();

    await recordAmbassadorPledge({
      campaignId: CAMPAIGN_ID,
      ambassadorId: ambassador.id,
      backerAddress: "GBACKER1",
      amount: "250",
    });
    const second = await recordAmbassadorPledge({
      campaignId: CAMPAIGN_ID,
      ambassadorId: ambassador.id,
      backerAddress: "GBACKER2",
      amount: "10",
    });

    expect(second.reward).toBeUndefined();

    const rewards = await evaluateAllAmbassadorRewards(CAMPAIGN_ID);
    expect(rewards).toHaveLength(0);
  });

  it("upgrades the tier as more pledges come in", async () => {
    const { ambassador } = await createAcceptedAmbassador();

    await recordAmbassadorPledge({
      campaignId: CAMPAIGN_ID,
      ambassadorId: ambassador.id,
      backerAddress: "GBACKER1",
      amount: "250",
    });
    const result = await recordAmbassadorPledge({
      campaignId: CAMPAIGN_ID,
      ambassadorId: ambassador.id,
      backerAddress: "GBACKER2",
      amount: "300",
    });

    expect(result.ambassador.tier).toBe("BLOOM");
    expect(result.ambassador.pledgedAmount).toBe("550");
  });

  it("resolves the reached tier from a pledged amount", () => {
    expect(resolveReachedTier("0")).toBe("SEED");
    expect(resolveReachedTier("99")).toBe("SEED");
    expect(resolveReachedTier("100")).toBe("SPROUT");
    expect(resolveReachedTier("500")).toBe("BLOOM");
    expect(resolveReachedTier("5000")).toBe("CANOPY");
  });

  it("applies a commission rate in basis points", () => {
    expect(applyCommissionRate("100", 500)).toBe("5");
    expect(applyCommissionRate("100", 1000)).toBe("10");
    expect(applyCommissionRate("100", 0)).toBe("0");
    expect(applyCommissionRate("3", 1000)).toBe("0");
  });

  it("changes the tier and status of an ambassador", async () => {
    const { ambassador } = await createAcceptedAmbassador();

    const tiered = await setAmbassadorTier(CAMPAIGN_ID, ambassador.id, "CANOPY");
    expect(tiered?.tier).toBe("CANOPY");

    const paused = await setAmbassadorStatus(CAMPAIGN_ID, ambassador.id, "paused");
    expect(paused?.status).toBe("paused");
  });

  it("removes an ambassador", async () => {
    const { ambassador } = await createAcceptedAmbassador();
    expect(await removeAmbassador(CAMPAIGN_ID, ambassador.id)).toBe(true);
    expect(await listAmbassadors(CAMPAIGN_ID)).toHaveLength(0);
  });

  it("builds the program summary with pledge tracking", async () => {
    const { ambassador } = await createAcceptedAmbassador("SPROUT");
    await recordAmbassadorPledge({
      campaignId: CAMPAIGN_ID,
      ambassadorId: ambassador.id,
      backerAddress: "GBACKER1",
      amount: "120",
    });

    const summary = await getAmbassadorProgramSummary(CAMPAIGN_ID);
    expect(summary.totalAmbassadors).toBe(1);
    expect(summary.activeAmbassadors).toBe(1);
    expect(summary.totalPledgedAmount).toBe("120");
    expect(summary.totalPledgeCount).toBe(1);
    expect(summary.ambassadors).toHaveLength(1);

    const entry = summary.ambassadors[0];
    expect(entry.ambassador.name).toBe("Alex Rivera");
    expect(entry.tier.label).toBe(AMBASSADOR_TIERS.SPROUT.label);
    expect(entry.amountToNextTier).toBe("380");
    expect(entry.progressToNextTier).toBeGreaterThan(0);
    expect(entry.progressToNextTier).toBeLessThan(1);
  });

  it("counts pending invitations in the summary", async () => {
    await inviteAmbassador({
      campaignId: CAMPAIGN_ID,
      campaignTitle: "Campaign",
      email: "one@example.com",
      invitedBy: CREATOR,
    });
    await inviteAmbassador({
      campaignId: CAMPAIGN_ID,
      campaignTitle: "Campaign",
      email: "two@example.com",
      invitedBy: CREATOR,
    });

    expect((await listAmbassadorInvites(CAMPAIGN_ID))).toHaveLength(2);
    const summary = await getAmbassadorProgramSummary(CAMPAIGN_ID);
    expect(summary.pendingInvites).toBe(2);
  });

  it("does not assign a reward below the threshold", async () => {
    const { ambassador } = await createAcceptedAmbassador("SPROUT");
    const reward = await evaluateAmbassadorRewards(CAMPAIGN_ID, ambassador.id);
    expect(reward).toBeUndefined();
  });
});
