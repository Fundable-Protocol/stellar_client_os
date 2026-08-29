import { describe, expect, it } from "vitest";
import {
  createSponsorTeam,
  inviteSponsorToTeam,
  listReferralRewards,
  recordReferralCompletion,
  recordTeamTreeSponsorship,
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

  it("awards one XLM for a referred sponsor’s first completed tree and caps monthly rewards", () => {
    const store = memoryStore();
    const now = new Date("2026-08-27T12:00:00Z");
    expect(recordReferralCompletion("GREFERRER", "GREFERRED", "tree-1", store, now)?.rewardStroops).toBe("10000000");
    expect(recordReferralCompletion("GREFERRER", "GREFERRED", "tree-2", store, now)).toBeNull();
    for (let i = 0; i < 9; i += 1) {
      expect(recordReferralCompletion("GREFERRER", `GREFERRED-${i}`, `tree-${i + 3}`, store, now)).not.toBeNull();
    }
    expect(recordReferralCompletion("GREFERRER", "GREFERRED-10", "tree-13", store, now)).toBeNull();
    expect(listReferralRewards(store)).toHaveLength(10);
  });
});
