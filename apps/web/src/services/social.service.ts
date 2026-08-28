export const STROOPS_PER_XLM = 10_000_000n;
export const REFERRAL_BONUS_XLM = 5;
export const REFERRAL_REWARD_STROOPS = 50_000_000n; // 5 XLM bonus (50,000,000 stroops)
export const MONTHLY_REFERRAL_CAP = 10;

export type TeamMember = {
  address: string;
  role: "owner" | "member";
  joinedAt: string;
};

export type SponsorTeam = {
  id: string;
  name: string;
  owner: string;
  members: TeamMember[];
  sponsoredTrees: string[];
  totalImpact: number;
  createdAt: string;
};

export type ReferralReward = {
  referrer: string;
  referredSponsor: string;
  rewardStroops: string;
  month: string;
  createdAt: string;
};

export interface SocialStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface PlanterReferralStats {
  totalReferrals: number;
  totalRewardsStroops: string;
  totalBonusXlm: number;
  monthlyCount: number;
  monthlyCap: number;
  rewards: ReferralReward[];
}

const TEAMS_KEY = "fundable:sponsor-teams";
const REWARDS_KEY = "fundable:referral-rewards";

const browserStore: SocialStore = {
  getItem: (key) => (typeof window === "undefined" ? null : window.localStorage.getItem(key)),
  setItem: (key, value) => {
    if (typeof window !== "undefined") window.localStorage.setItem(key, value);
  },
};

function read<T>(store: SocialStore, key: string, fallback: T): T {
  try {
    const raw = store.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(store: SocialStore, key: string, value: T): void {
  store.setItem(key, JSON.stringify(value));
}

export function monthKey(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Generate a planter's unique referral link with address query parameter */
export function getPlanterReferralUrl(address: string, baseUrl?: string): string {
  if (!address) return "";
  const origin =
    baseUrl ||
    (typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://fundable.network");
  return `${origin}/?ref=${encodeURIComponent(address)}`;
}

export function listSponsorTeams(store: SocialStore = browserStore): SponsorTeam[] {
  return read<SponsorTeam[]>(store, TEAMS_KEY, []);
}

export function createSponsorTeam(
  owner: string,
  name: string,
  store: SocialStore = browserStore,
  now = new Date(),
): SponsorTeam {
  const trimmedName = name.trim();
  if (!owner || !trimmedName) throw new Error("Team owner and name are required");
  const team: SponsorTeam = {
    id: `team_${now.getTime()}_${Math.random().toString(36).slice(2, 8)}`,
    name: trimmedName,
    owner,
    members: [{ address: owner, role: "owner", joinedAt: now.toISOString() }],
    sponsoredTrees: [],
    totalImpact: 0,
    createdAt: now.toISOString(),
  };
  write(store, TEAMS_KEY, [...listSponsorTeams(store), team]);
  return team;
}

export function inviteSponsorToTeam(
  teamId: string,
  owner: string,
  memberAddress: string,
  store: SocialStore = browserStore,
  now = new Date(),
): SponsorTeam {
  const teams = listSponsorTeams(store);
  const team = teams.find((candidate) => candidate.id === teamId);
  if (!team) throw new Error("Team not found");
  if (team.owner !== owner) throw new Error("Only the team owner can invite sponsors");
  if (!memberAddress || team.members.some((member) => member.address === memberAddress)) return team;
  team.members.push({ address: memberAddress, role: "member", joinedAt: now.toISOString() });
  write(store, TEAMS_KEY, teams);
  return team;
}

export function recordTeamTreeSponsorship(
  teamId: string,
  sponsorAddress: string,
  treeId: string,
  impact = 1,
  store: SocialStore = browserStore,
): SponsorTeam {
  const teams = listSponsorTeams(store);
  const team = teams.find((candidate) => candidate.id === teamId);
  if (!team) throw new Error("Team not found");
  if (!team.members.some((member) => member.address === sponsorAddress)) throw new Error("Sponsor is not a team member");
  if (!treeId || team.sponsoredTrees.includes(treeId)) return team;
  team.sponsoredTrees.push(treeId);
  team.totalImpact += Math.max(0, impact);
  write(store, TEAMS_KEY, teams);
  return team;
}

export function listReferralRewards(store: SocialStore = browserStore): ReferralReward[] {
  return read<ReferralReward[]>(store, REWARDS_KEY, []);
}

/** Calculate aggregated referral metrics for a specific planter address */
export function getPlanterReferralStats(
  planterAddress: string,
  store: SocialStore = browserStore,
  now = new Date(),
): PlanterReferralStats {
  if (!planterAddress) {
    return {
      totalReferrals: 0,
      totalRewardsStroops: "0",
      totalBonusXlm: 0,
      monthlyCount: 0,
      monthlyCap: MONTHLY_REFERRAL_CAP,
      rewards: [],
    };
  }

  const currentMonth = monthKey(now);
  const allRewards = listReferralRewards(store);
  const planterRewards = allRewards.filter((reward) => reward.referrer === planterAddress);
  const monthlyRewards = planterRewards.filter((reward) => reward.month === currentMonth);

  const totalStroops = planterRewards.reduce((sum, r) => sum + BigInt(r.rewardStroops || 0), 0n);
  const bonusXlm = Number(totalStroops) / Number(STROOPS_PER_XLM);

  return {
    totalReferrals: planterRewards.length,
    totalRewardsStroops: totalStroops.toString(),
    totalBonusXlm: bonusXlm,
    monthlyCount: monthlyRewards.length,
    monthlyCap: MONTHLY_REFERRAL_CAP,
    rewards: planterRewards.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    ),
  };
}

/** Record the first completed tree for a referred sponsor, capped at 10 rewards/month. */
export function recordReferralCompletion(
  referrer: string,
  referredSponsor: string,
  completedTreeId: string,
  store: SocialStore = browserStore,
  now = new Date(),
): ReferralReward | null {
  if (!referrer || !referredSponsor || !completedTreeId || referrer === referredSponsor) return null;
  const month = monthKey(now);
  const rewards = listReferralRewards(store);
  if (rewards.some((reward) => reward.referredSponsor === referredSponsor)) return null;
  if (rewards.filter((reward) => reward.referrer === referrer && reward.month === month).length >= MONTHLY_REFERRAL_CAP) return null;
  const reward: ReferralReward = {
    referrer,
    referredSponsor,
    rewardStroops: REFERRAL_REWARD_STROOPS.toString(),
    month,
    createdAt: now.toISOString(),
  };
  write(store, REWARDS_KEY, [...rewards, reward]);
  return reward;
}
