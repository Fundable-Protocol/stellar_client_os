import { PlanterClient, PlanterInfo, ReferralInfo } from "@fundable/sdk";

/**
 * Service for interacting with the Planter referral system.
 */
export class SocialService {
  private planterClient: PlanterClient | null = null;

  /**
   * Initialize the social service with the planter contract client.
   * @param contractId The deployed planter contract ID
   * @param networkPassphrase The network passphrase
   * @param rpcUrl The RPC URL for Soroban
   */
  initialize(
    contractId: string,
    networkPassphrase: string,
    rpcUrl: string
  ) {
    this.planterClient = new PlanterClient({
      contractId,
      networkPassphrase,
      rpcUrl,
    });
  }

  /**
   * Register a new planter with an optional referrer.
   * @param planterAddress The planter's address
   * @param referrerAddress Optional referrer's address
   */
  async registerPlanter(
    planterAddress: string,
    referrerAddress?: string
  ): Promise<void> {
    if (!this.planterClient) {
      throw new Error("SocialService not initialized");
    }

    const tx = await this.planterClient.registerPlanter({
      planter: planterAddress,
      referrer: referrerAddress,
    });

    // Sign and send the transaction (implementation depends on wallet integration)
    // This is a placeholder - actual signing would be done by the wallet
    await tx.signAndSend();
  }

  /**
   * Record a job completion for a planter.
   * @param planterAddress The planter's address
   */
  async completeJob(planterAddress: string): Promise<void> {
    if (!this.planterClient) {
      throw new Error("SocialService not initialized");
    }

    const tx = await this.planterClient.completeJob({
      planter: planterAddress,
    });

    await tx.signAndSend();
  }

  /**
   * Claim referral reward for a referred planter's first job completion.
   * @param referrerAddress The referrer's address
   * @param referredPlanterAddress The referred planter's address
   */
  async claimReferralReward(
    referrerAddress: string,
    referredPlanterAddress: string
  ): Promise<void> {
    if (!this.planterClient) {
      throw new Error("SocialService not initialized");
    }

    const tx = await this.planterClient.claimReferralReward({
      referrer: referrerAddress,
      referredPlanter: referredPlanterAddress,
    });

    await tx.signAndSend();
  }

  /**
   * Get planter information.
   * @param planterAddress The planter's address
   * @returns Planter information
   */
  async getPlanter(planterAddress: string): Promise<PlanterInfo> {
    if (!this.planterClient) {
      throw new Error("SocialService not initialized");
    }

    return await this.planterClient.getPlanter({
      planter: planterAddress,
    });
  }

  /**
   * Get referral information for a referrer.
   * @param referrerAddress The referrer's address
   * @returns Referral information
   */
  async getReferralInfo(referrerAddress: string): Promise<ReferralInfo> {
    if (!this.planterClient) {
      throw new Error("SocialService not initialized");
    }

    return await this.planterClient.getReferralInfo({
      referrer: referrerAddress,
    });
  }

  /**
   * Get current reward amount.
   * @returns Current reward amount in stroops
   */
  async getRewardAmount(): Promise<bigint> {
    if (!this.planterClient) {
      throw new Error("SocialService not initialized");
    }

    return await this.planterClient.getRewardAmount();
  }

  /**
   * Update reward amount (admin only).
   * @param newAmount New reward amount in stroops
   */
  async setRewardAmount(newAmount: bigint): Promise<void> {
    if (!this.planterClient) {
      throw new Error("SocialService not initialized");
    }

    const tx = await this.planterClient.setRewardAmount({
      newAmount,
    });

    await tx.signAndSend();
  }
}

// Export singleton instance
export const socialService = new SocialService();
export const REFERRAL_REWARD_STROOPS = 10_000_000n; // 1 XLM
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

function monthKey(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
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
