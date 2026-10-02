import { describe, expect, it } from "vitest";
import {
  createSponsorTeam,
  getPlanterReferralStats,
  getPlanterReferralUrl,
  inviteSponsorToTeam,
  listReferralRewards,
  recordReferralCompletion,
  recordTeamTreeSponsorship,
  REFERRAL_BONUS_XLM,
  REFERRAL_REWARD_STROOPS,
  type SocialStore,
} from "./social.service";

function memoryStore(): SocialStore {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

describe("team sponsorship and referrals", () => {
  it("creates a team, invites members, and aggregates unique tree impact", () => {
    const store = memoryStore();
    const now = new Date("2026-08-27T12:00:00Z");
    const team = createSponsorTeam("GOWNER", "Green Friends", store, now);
    inviteSponsorToTeam(team.id, "GOWNER", "GMEMBER", store, now);
    recordTeamTreeSponsorship(team.id, "GMEMBER", "tree-1", 3, store);
    const updated = recordTeamTreeSponsorship(team.id, "GOWNER", "tree-2", 2, store);
    const duplicate = recordTeamTreeSponsorship(team.id, "GOWNER", "tree-2", 20, store);

    expect(updated.members).toHaveLength(2);
    expect(updated.sponsoredTrees).toEqual(["tree-1", "tree-2"]);
    expect(updated.totalImpact).toBe(5);
    expect(duplicate.totalImpact).toBe(5);
  });

  it("rejects invitations from non-owners", () => {
    const store = memoryStore();
    const team = createSponsorTeam("GOWNER", "Green Friends", store);
    expect(() => inviteSponsorToTeam(team.id, "GMEMBER", "GOTHER", store)).toThrow(/owner/i);
  });

  it("awards 5 XLM (50,000,000 stroops) bonus for a referred sponsor’s first completed tree and caps monthly rewards at 10", () => {
    const store = memoryStore();
    const now = new Date("2026-08-27T12:00:00Z");
    expect(REFERRAL_BONUS_XLM).toBe(5);
    expect(REFERRAL_REWARD_STROOPS).toBe(50_000_000n);

    const firstReward = recordReferralCompletion("GREFERRER", "GREFERRED", "tree-1", store, now);
    expect(firstReward?.rewardStroops).toBe("50000000");
    expect(recordReferralCompletion("GREFERRER", "GREFERRED", "tree-2", store, now)).toBeNull();
    for (let i = 0; i < 9; i += 1) {
      expect(recordReferralCompletion("GREFERRER", `GREFERRED-${i}`, `tree-${i + 3}`, store, now)).not.toBeNull();
    }
    expect(recordReferralCompletion("GREFERRER", "GREFERRED-10", "tree-13", store, now)).toBeNull();
    expect(listReferralRewards(store)).toHaveLength(10);
  });

  it("generates correct planter referral URLs", () => {
    expect(getPlanterReferralUrl("GPLANTER123", "https://fundable.network")).toBe(
      "https://fundable.network/?ref=GPLANTER123"
    );
    expect(getPlanterReferralUrl("")).toBe("");
  });

  it("calculates accurate planter referral metrics and bonus totals", () => {
    const store = memoryStore();
    const now = new Date("2026-08-27T12:00:00Z");

    const emptyStats = getPlanterReferralStats("GPLANTER1", store, now);
    expect(emptyStats.totalReferrals).toBe(0);
    expect(emptyStats.totalBonusXlm).toBe(0);
    expect(emptyStats.monthlyCount).toBe(0);

    recordReferralCompletion("GPLANTER1", "GSPONSOR1", "tree-1", store, now);
    recordReferralCompletion("GPLANTER1", "GSPONSOR2", "tree-2", store, now);

    const stats = getPlanterReferralStats("GPLANTER1", store, now);
    expect(stats.totalReferrals).toBe(2);
    expect(stats.totalBonusXlm).toBe(10); // 2 * 5 XLM = 10 XLM
    expect(stats.monthlyCount).toBe(2);
    expect(stats.monthlyCap).toBe(10);
    expect(stats.rewards).toHaveLength(2);
  });
});
