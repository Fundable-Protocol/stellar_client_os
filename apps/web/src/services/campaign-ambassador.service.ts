/**
 * Ambassador & Influencer Program Service
 *
 * Manages the ambassador program of a campaign:
 *
 *   - **Recruit** — invite ambassadors by email and let them accept the
 *     invitation from a unique link.
 *   - **Track** — record the pledges each ambassador brings in and expose a
 *     per-ambassador dashboard.
 *   - **Reward** — assign a perk or commission automatically as soon as the
 *     ambassador crosses the threshold of their tier.
 *
 * Backed by in-memory data sources with `set*` seams, matching the other
 * campaign services in this codebase.
 */

import {
  AMBASSADOR_TIERS,
  type Ambassador,
  type AmbassadorInvite,
  type AmbassadorPledge,
  type AmbassadorPledgeSource,
  type AmbassadorPledgeSummary,
  type AmbassadorProgramSummary,
  type AmbassadorReward,
  type AmbassadorStatus,
  type AmbassadorTier,
  type AmbassadorTierConfig,
} from "@/types/ambassador";

export type {
  Ambassador,
  AmbassadorInvite,
  AmbassadorPledge,
  AmbassadorPledgeSummary,
  AmbassadorProgramSummary,
  AmbassadorReward,
  AmbassadorStatus,
  AmbassadorTier,
  AmbassadorTierConfig,
} from "@/types/ambassador";

// ── Tier configuration ─────────────────────────────────────────────────────────

/**
 * The reward ladder of the ambassador program.
 *
 * `minPledgeAmount` is the total amount an ambassador must bring in before
 * the tier is unlocked; `commissionRateBps` is the share of the pledged
 * amount paid back to the ambassador once the tier is reached.
 */
export const AMBASSADOR_TIERS: Record<AmbassadorTier, AmbassadorTierConfig> = {
  SEED: {
    tier: "SEED",
    label: "Seed",
    minPledgeAmount: "0",
    perks: ["Campaign updates newsletter", "Public thank-you listing"],
    commissionRateBps: 0,
  },
  SPROUT: {
    tier: "SPROUT",
    label: "Sprout",
    minPledgeAmount: "100",
    perks: ["All Seed perks", "Early access to campaign rewards", "10% referral reward tier"],
    commissionRateBps: 1000,
  },
  BLOOM: {
    tier: "BLOOM",
    label: "Bloom",
    minPledgeAmount: "500",
    perks: ["All Sprout perks", "Name listed on the campaign page", "15% referral reward tier"],
    commissionRateBps: 1500,
  },
  CANOPY: {
    tier: "CANOPY",
    label: "Canopy",
    minPledgeAmount: "2000",
    perks: [
      "All Bloom perks",
      "Featured ambassador spotlight",
      "20% referral reward tier",
    ],
    commissionRateBps: 2000,
  },
};

/** Tiers ordered from the lowest to the highest threshold. */
export const AMBASSADOR_TIER_ORDER: AmbassadorTier[] = ["SEED", "SPROUT", "BLOOM", "CANOPY"];

export function getAmbassadorTier(tier: AmbassadorTier): AmbassadorTierConfig {
  return AMBASSADOR_TIERS[tier];
}

/** The tier whose threshold is met by `pledgedAmount`. */
export function resolveReachedTier(pledgedAmount: string): AmbassadorTier {
  const pledged = parseAmount(pledgedAmount);
  let reached: AmbassadorTier = "SEED";
  for (const tier of AMBASSADOR_TIER_ORDER) {
    if (pledged >= parseAmount(AMBASSADOR_TIERS[tier].minPledgeAmount)) {
      reached = tier;
    }
  }
  return reached;
}

/** The next tier above `tier`, if any. */
export function getNextTier(tier: AmbassadorTier): AmbassadorTierConfig | undefined {
  const index = AMBASSADOR_TIER_ORDER.indexOf(tier);
  if (index === -1 || index === AMBASSADOR_TIER_ORDER.length - 1) return undefined;
  return AMBASSADOR_TIERS[AMBASSADOR_TIER_ORDER[index + 1]];
}

// ── Amount helpers ─────────────────────────────────────────────────────────────

export class AmbassadorValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AmbassadorValidationError";
  }
}

/** Parse a non-negative integer token amount. */
export function parseAmount(amount: string): bigint {
  if (!/^\d+$/.test(String(amount ?? "").trim())) {
    throw new AmbassadorValidationError("amount must be a non-negative integer string");
  }
  return BigInt(String(amount).trim());
}

function addAmounts(a: string, b: string): string {
  return (parseAmount(a) + parseAmount(b)).toString();
}

function subtractClamped(a: string, b: string): string {
  const left = parseAmount(a);
  const right = parseAmount(b);
  return (left > right ? left - right : 0n).toString();
}

/** Apply a basis-point rate to an amount, rounding down. */
export function applyCommissionRate(amount: string, rateBps: number): string {
  if (!Number.isFinite(rateBps) || rateBps <= 0) return "0";
  return ((parseAmount(amount) * BigInt(Math.trunc(rateBps))) / 10_000n).toString();
}

// ── Data sources ───────────────────────────────────────────────────────────────

export interface AmbassadorDataSource {
  list(campaignId: string): Promise<Ambassador[]>;
  get(campaignId: string, ambassadorId: string): Promise<Ambassador | null>;
  getByReferralCode(campaignId: string, code: string): Promise<Ambassador | null>;
  save(ambassador: Ambassador): Promise<Ambassador>;
  delete(campaignId: string, ambassadorId: string): Promise<boolean>;
}

export interface AmbassadorInviteDataSource {
  list(campaignId: string): Promise<AmbassadorInvite[]>;
  getByToken(token: string): Promise<AmbassadorInvite | null>;
  save(invite: AmbassadorInvite): Promise<AmbassadorInvite>;
}

export interface AmbassadorPledgeDataSource {
  list(campaignId: string): Promise<AmbassadorPledge[]>;
  getForAmbassador(campaignId: string, ambassadorId: string): Promise<AmbassadorPledge[]>;
  save(pledge: AmbassadorPledge): Promise<AmbassadorPledge>;
}

export interface AmbassadorRewardDataSource {
  list(campaignId: string): Promise<AmbassadorReward[]>;
  getForAmbassador(campaignId: string, ambassadorId: string): Promise<AmbassadorReward[]>;
  save(reward: AmbassadorReward): Promise<AmbassadorReward>;
}

const normalize = (value: string) => value.trim().toLowerCase();

export class InMemoryAmbassadorDataSource implements AmbassadorDataSource {
  private records = new Map<string, Ambassador>();

  async list(campaignId: string): Promise<Ambassador[]> {
    const campaign = normalize(campaignId);
    return Array.from(this.records.values())
      .filter((record) => normalize(record.campaignId) === campaign)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  async get(campaignId: string, ambassadorId: string): Promise<Ambassador | null> {
    return this.records.get(`${normalize(campaignId)}::${ambassadorId}`) ?? null;
  }

  async getByReferralCode(campaignId: string, code: string): Promise<Ambassador | null> {
    const wanted = normalize(code);
    for (const record of this.records.values()) {
      if (normalize(record.campaignId) !== normalize(campaignId)) continue;
      if (normalize(record.referralCode) === wanted) return record;
    }
    return null;
  }

  async save(ambassador: Ambassador): Promise<Ambassador> {
    this.records.set(`${normalize(ambassador.campaignId)}::${ambassador.id}`, ambassador);
    return ambassador;
  }

  async delete(campaignId: string, ambassadorId: string): Promise<boolean> {
    return this.records.delete(`${normalize(campaignId)}::${ambassadorId}`);
  }
}

export class InMemoryAmbassadorInviteDataSource implements AmbassadorInviteDataSource {
  private records = new Map<string, AmbassadorInvite>();

  async list(campaignId: string): Promise<AmbassadorInvite[]> {
    const campaign = normalize(campaignId);
    return Array.from(this.records.values())
      .filter((record) => normalize(record.campaignId) === campaign)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async getByToken(token: string): Promise<AmbassadorInvite | null> {
    return this.records.get(token) ?? null;
  }

  async save(invite: AmbassadorInvite): Promise<AmbassadorInvite> {
    this.records.set(invite.token, invite);
    return invite;
  }
}

export class InMemoryAmbassadorPledgeDataSource implements AmbassadorPledgeDataSource {
  private records = new Map<string, AmbassadorPledge>();

  async list(campaignId: string): Promise<AmbassadorPledge[]> {
    const campaign = normalize(campaignId);
    return Array.from(this.records.values())
      .filter((record) => normalize(record.campaignId) === campaign)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  async getForAmbassador(campaignId: string, ambassadorId: string): Promise<AmbassadorPledge[]> {
    return (await this.list(campaignId)).filter((record) => record.ambassadorId === ambassadorId);
  }

  async save(pledge: AmbassadorPledge): Promise<AmbassadorPledge> {
    this.records.set(pledge.id, pledge);
    return pledge;
  }
}

export class InMemoryAmbassadorRewardDataSource implements AmbassadorRewardDataSource {
  private records = new Map<string, AmbassadorReward>();

  async list(campaignId: string): Promise<AmbassadorReward[]> {
    const campaign = normalize(campaignId);
    return Array.from(this.records.values())
      .filter((record) => normalize(record.campaignId) === campaign)
      .sort((a, b) => a.assignedAt - b.assignedAt);
  }

  async getForAmbassador(campaignId: string, ambassadorId: string): Promise<AmbassadorReward[]> {
    return (await this.list(campaignId)).filter((record) => record.ambassadorId === ambassadorId);
  }

  async save(reward: AmbassadorReward): Promise<AmbassadorReward> {
    this.records.set(reward.id, reward);
    return reward;
  }
}

let defaultAmbassadors: AmbassadorDataSource | undefined;
let defaultInvites: AmbassadorInviteDataSource | undefined;
let defaultPledges: AmbassadorPledgeDataSource | undefined;
let defaultRewards: AmbassadorRewardDataSource | undefined;

export function getAmbassadorDataSource(): AmbassadorDataSource {
  return (defaultAmbassadors ??= new InMemoryAmbassadorDataSource());
}

export function setAmbassadorDataSource(dataSource: AmbassadorDataSource): void {
  defaultAmbassadors = dataSource;
}

export function getAmbassadorInviteDataSource(): AmbassadorInviteDataSource {
  return (defaultInvites ??= new InMemoryAmbassadorInviteDataSource());
}

export function setAmbassadorInviteDataSource(dataSource: AmbassadorInviteDataSource): void {
  defaultInvites = dataSource;
}

export function getAmbassadorPledgeDataSource(): AmbassadorPledgeDataSource {
  return (defaultPledges ??= new InMemoryAmbassadorPledgeDataSource());
}

export function setAmbassadorPledgeDataSource(dataSource: AmbassadorPledgeDataSource): void {
  defaultPledges = dataSource;
}

export function getAmbassadorRewardDataSource(): AmbassadorRewardDataSource {
  return (defaultRewards ??= new InMemoryAmbassadorRewardDataSource());
}

export function setAmbassadorRewardDataSource(dataSource: AmbassadorRewardDataSource): void {
  defaultRewards = dataSource;
}

/** Reset every ambassador store. Used by tests to isolate state. */
export function resetAmbassadorStores(): void {
  defaultAmbassadors = new InMemoryAmbassadorDataSource();
  defaultInvites = new InMemoryAmbassadorInviteDataSource();
  defaultPledges = new InMemoryAmbassadorPledgeDataSource();
  defaultRewards = new InMemoryAmbassadorRewardDataSource();
}

// ── Invitations ────────────────────────────────────────────────────────────────

export interface InviteAmbassadorInput {
  campaignId: string;
  campaignTitle: string;
  email: string;
  /** Display name of the ambassador (optional at invite time). */
  name?: string;
  tier?: AmbassadorTier;
  invitedBy: string;
  invitedByName?: string;
  expiresInDays?: number;
}

const EMAIL_PATTERN = /^[^\s,@]+@[^\s,@]+\.[^\s,@]+$/;

function makeToken(): string {
  return `amb_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function makeReferralCode(campaignId: string): string {
  const seed = `${campaignId}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
  return `AMB-${seed.replace(/[^A-Z0-9]/g, "").slice(0, 10)}`;
}

/** Create an invitation for an ambassador. */
export async function inviteAmbassador(
  input: InviteAmbassadorInput,
  invites = getAmbassadorInviteDataSource(),
  now = Date.now(),
): Promise<AmbassadorInvite> {
  if (!input.campaignId?.trim()) {
    throw new AmbassadorValidationError("campaignId is required");
  }
  if (!input.email?.trim() || !EMAIL_PATTERN.test(input.email.trim())) {
    throw new AmbassadorValidationError("A valid email address is required");
  }
  if (!input.invitedBy?.trim()) {
    throw new AmbassadorValidationError("invitedBy is required");
  }

  const days = input.expiresInDays ?? 14;
  const invite: AmbassadorInvite = {
    token: makeToken(),
    campaignId: input.campaignId.trim(),
    campaignTitle: input.campaignTitle?.trim() || "the campaign",
    email: input.email.trim().toLowerCase(),
    name: input.name?.trim() || undefined,
    tier: input.tier ?? "SEED",
    invitedBy: input.invitedBy.trim(),
    invitedByName: input.invitedByName?.trim() || "The campaign team",
    createdAt: now,
    expiresAt: now + days * 86_400_000,
    status: "pending",
  };

  return invites.save(invite);
}

/** Fetch a pending invitation by token. Expired invites resolve to `null`. */
export async function getAmbassadorInvite(
  token: string,
  invites = getAmbassadorInviteDataSource(),
  now = Date.now(),
): Promise<AmbassadorInvite | null> {
  const invite = await invites.getByToken(token);
  if (!invite) return null;
  if (invite.status === "pending" && invite.expiresAt < now) {
    await invites.save({ ...invite, status: "expired" });
    return null;
  }
  return invite;
}

/** List the invitations of a campaign. */
export async function listAmbassadorInvites(
  campaignId: string,
  invites = getAmbassadorInviteDataSource(),
): Promise<AmbassadorInvite[]> {
  return invites.list(campaignId);
}

/** Revoke a pending invitation. */
export async function revokeAmbassadorInvite(
  token: string,
  invites = getAmbassadorInviteDataSource(),
): Promise<boolean> {
  const invite = await invites.getByToken(token);
  if (!invite || invite.status !== "pending") return false;
  await invites.save({ ...invite, status: "revoked" });
  return true;
}

export interface AcceptAmbassadorInviteInput {
  token: string;
  name: string;
  email?: string;
  stellarAddress?: string;
}

/**
 * Accept an invitation and create the ambassador.
 *
 * The ambassador starts on the tier the invitation was sent with, so a creator
 * can recruit somebody straight into the tier they expect them to reach.
 */
export async function acceptAmbassadorInvite(
  input: AcceptAmbassadorInviteInput,
  ambassadors = getAmbassadorDataSource(),
  invites = getAmbassadorInviteDataSource(),
  now = Date.now(),
): Promise<{ success: boolean; ambassador?: Ambassador; error?: string }> {
  const invite = await getAmbassadorInvite(input.token, invites, now);
  if (!invite) {
    return { success: false, error: "This invitation is invalid or has expired." };
  }
  if (invite.status === "revoked") {
    return { success: false, error: "This invitation has been revoked." };
  }
  if (invite.status === "accepted" && invite.ambassadorId) {
    const existing = await ambassadors.get(invite.campaignId, invite.ambassadorId);
    if (existing) return { success: true, ambassador: existing };
  }

  const name = input.name?.trim() || invite.name;
  if (!name) {
    return { success: false, error: "Please provide your name." };
  }

  const ambassador: Ambassador = {
    id: `amb_${crypto.randomUUID()}`,
    campaignId: invite.campaignId,
    name,
    email: (input.email?.trim() || invite.email).toLowerCase(),
    stellarAddress: input.stellarAddress?.trim() || undefined,
    tier: invite.tier,
    status: "active",
    referralCode: makeReferralCode(invite.campaignId),
    invitedBy: invite.invitedBy,
    invitedByName: invite.invitedByName,
    createdAt: now,
    joinedAt: now,
    pledgedAmount: "0",
    pledgeCount: 0,
  };

  await ambassadors.save(ambassador);
  await invites.save({
    ...invite,
    status: "accepted",
    ambassadorId: ambassador.id,
    acceptedAt: now,
  });

  return { success: true, ambassador };
}

// ── Ambassador management ──────────────────────────────────────────────────────

/** List the ambassadors of a campaign. */
export async function listAmbassadors(
  campaignId: string,
  ambassadors = getAmbassadorDataSource(),
): Promise<Ambassador[]> {
  return ambassadors.list(campaignId);
}

/** Fetch a single ambassador. */
export async function getAmbassador(
  campaignId: string,
  ambassadorId: string,
  ambassadors = getAmbassadorDataSource(),
): Promise<Ambassador | null> {
  return ambassadors.get(campaignId, ambassadorId);
}

/** Look an ambassador up by the referral code they share. */
export async function getAmbassadorByReferralCode(
  campaignId: string,
  referralCode: string,
  ambassadors = getAmbassadorDataSource(),
): Promise<Ambassador | null> {
  return ambassadors.getByReferralCode(campaignId, referralCode);
}

/** Change the tier of an ambassador. */
export async function setAmbassadorTier(
  campaignId: string,
  ambassadorId: string,
  tier: AmbassadorTier,
  ambassadors = getAmbassadorDataSource(),
  now = Date.now(),
): Promise<Ambassador | null> {
  const ambassador = await ambassadors.get(campaignId, ambassadorId);
  if (!ambassador) return null;
  const updated: Ambassador = { ...ambassador, tier };
  void now;
  return ambassadors.save(updated);
}

/** Change the status of an ambassador. */
export async function setAmbassadorStatus(
  campaignId: string,
  ambassadorId: string,
  status: AmbassadorStatus,
  ambassadors = getAmbassadorDataSource(),
): Promise<Ambassador | null> {
  const ambassador = await ambassadors.get(campaignId, ambassadorId);
  if (!ambassador) return null;
  return ambassadors.save({ ...ambassador, status });
}

/** Remove an ambassador from the program. */
export async function removeAmbassador(
  campaignId: string,
  ambassadorId: string,
  ambassadors = getAmbassadorDataSource(),
): Promise<boolean> {
  return ambassadors.delete(campaignId, ambassadorId);
}

// ── Pledges ────────────────────────────────────────────────────────────────────

export interface RecordAmbassadorPledgeInput {
  campaignId: string;
  ambassadorId: string;
  backerAddress: string;
  amount: string;
  token?: string;
  source?: AmbassadorPledgeSource;
}

export interface RecordAmbassadorPledgeResult {
  pledge: AmbassadorPledge;
  ambassador: Ambassador;
  /** Reward assigned as a result of this pledge, if any. */
  reward?: AmbassadorReward;
}

/**
 * Record a pledge brought in by an ambassador.
 *
 * The ambassador's running total is updated and the reward thresholds are
 * re-evaluated, so a pledge that crosses a threshold assigns the reward
 * immediately.
 */
export async function recordAmbassadorPledge(
  input: RecordAmbassadorPledgeInput,
  ambassadors = getAmbassadorDataSource(),
  pledges = getAmbassadorPledgeDataSource(),
  rewards = getAmbassadorRewardDataSource(),
  now = Date.now(),
): Promise<RecordAmbassadorPledgeResult> {
  const ambassador = await ambassadors.get(input.campaignId, input.ambassadorId);
  if (!ambassador) {
    throw new AmbassadorValidationError("Ambassador not found");
  }
  if (!input.backerAddress?.trim()) {
    throw new AmbassadorValidationError("backerAddress is required");
  }
  const amount = parseAmount(input.amount);
  if (amount <= 0n) {
    throw new AmbassadorValidationError("amount must be greater than zero");
  }

  const pledge: AmbassadorPledge = {
    id: `plg_${crypto.randomUUID()}`,
    campaignId: input.campaignId,
    ambassadorId: input.ambassadorId,
    backerAddress: input.backerAddress.trim(),
    amount: amount.toString(),
    token: input.token?.trim() || "XLM",
    source: input.source ?? "referral_link",
    createdAt: now,
  };
  await pledges.save(pledge);

  const updated: Ambassador = {
    ...ambassador,
    pledgedAmount: addAmounts(ambassador.pledgedAmount, pledge.amount),
    pledgeCount: ambassador.pledgeCount + 1,
  };
  await ambassadors.save(updated);

  const reward = await evaluateAmbassadorRewards(
    input.campaignId,
    input.ambassadorId,
    ambassadors,
    pledges,
    rewards,
    now,
  );

  const finalAmbassador = (await ambassadors.get(input.campaignId, input.ambassadorId)) ?? updated;

  return { pledge, ambassador: finalAmbassador, reward };
}

/** List the pledges of an ambassador. */
export async function listAmbassadorPledges(
  campaignId: string,
  ambassadorId: string,
  pledges = getAmbassadorPledgeDataSource(),
): Promise<AmbassadorPledge[]> {
  return pledges.getForAmbassador(campaignId, ambassadorId);
}

/** List every pledge of a campaign. */
export async function listCampaignAmbassadorPledges(
  campaignId: string,
  pledges = getAmbassadorPledgeDataSource(),
): Promise<AmbassadorPledge[]> {
  return pledges.list(campaignId);
}

// ── Reward assignment ──────────────────────────────────────────────────────────

/**
 * Assign the rewards an ambassador has earned.
 *
 * For every tier whose threshold the ambassador has crossed but for which no
 * reward exists yet, a reward is created. The commission is calculated on the
 * slice of the pledged amount that falls inside the tier's band — the amount
 * between the previous tier's threshold and this tier's threshold — so the
 * tiers stack without paying the same pledge twice.
 *
 * The entry tier (`SEED`) has no threshold and therefore never awards a
 * reward: its perks are granted from the moment the ambassador joins.
 */
export async function evaluateAmbassadorRewards(
  campaignId: string,
  ambassadorId: string,
  ambassadors = getAmbassadorDataSource(),
  pledges = getAmbassadorPledgeDataSource(),
  rewards = getAmbassadorRewardDataSource(),
  now = Date.now(),
): Promise<AmbassadorReward | undefined> {
  const ambassador = await ambassadors.get(campaignId, ambassadorId);
  if (!ambassador) return undefined;

  const pledged = parseAmount(ambassador.pledgedAmount);
  const existing = await rewards.getForAmbassador(campaignId, ambassadorId);
  const assignedTiers = new Set(existing.map((reward) => reward.tier));

  let latestReward: AmbassadorReward | undefined;
  let highestTier: AmbassadorTier = ambassador.tier;

  for (const [index, tier] of AMBASSADOR_TIER_ORDER.entries()) {
    const config = AMBASSADOR_TIERS[tier];
    const threshold = parseAmount(config.minPledgeAmount);
    if (threshold === 0n) continue; // entry tier, no threshold to cross
    if (pledged < threshold) continue;
    if (assignedTiers.has(tier)) continue;

    // The band of this tier: everything between the previous threshold and
    // this one, capped by the amount actually pledged.
    const previousThreshold =
      index === 0 ? 0n : parseAmount(AMBASSADOR_TIERS[AMBASSADOR_TIER_ORDER[index - 1]].minPledgeAmount);
    const bandTop = pledged < threshold ? pledged : threshold;
    const bandAmount = bandTop > previousThreshold ? bandTop - previousThreshold : 0n;

    const reward: AmbassadorReward = {
      id: `rwd_${crypto.randomUUID()}`,
      campaignId,
      ambassadorId,
      type: "commission",
      tier,
      amount: applyCommissionRate(bandAmount.toString(), config.commissionRateBps),
      description: `${config.label} tier unlocked — ${config.perks.join(", ")}`,
      status: "assigned",
      thresholdAmount: config.minPledgeAmount,
      assignedAt: now,
    };
    await rewards.save(reward);
    latestReward = reward;
    if (AMBASSADOR_TIER_ORDER.indexOf(tier) > AMBASSADOR_TIER_ORDER.indexOf(highestTier)) {
      highestTier = tier;
    }
  }

  if (highestTier !== ambassador.tier || latestReward) {
    await ambassadors.save({
      ...ambassador,
      tier: highestTier,
      rewardId: latestReward?.id ?? ambassador.rewardId,
    });
  }

  void pledges;
  return latestReward;
}

/** Run the reward evaluation for every ambassador of a campaign. */
export async function evaluateAllAmbassadorRewards(
  campaignId: string,
  ambassadors = getAmbassadorDataSource(),
  pledges = getAmbassadorPledgeDataSource(),
  rewards = getAmbassadorRewardDataSource(),
  now = Date.now(),
): Promise<AmbassadorReward[]> {
  const list = await ambassadors.list(campaignId);
  const assigned: AmbassadorReward[] = [];
  for (const ambassador of list) {
    const reward = await evaluateAmbassadorRewards(
      campaignId,
      ambassador.id,
      ambassadors,
      pledges,
      rewards,
      now,
    );
    if (reward) assigned.push(reward);
  }
  return assigned;
}

// ── Dashboard ──────────────────────────────────────────────────────────────────

/** Build the per-ambassador pledge tracking view. */
export async function getAmbassadorPledgeSummary(
  ambassador: Ambassador,
  rewards: AmbassadorReward[],
): Promise<AmbassadorPledgeSummary> {
  const tier = AMBASSADOR_TIERS[ambassador.tier] ?? AMBASSADOR_TIERS.SEED;
  const pledged = parseAmount(ambassador.pledgedAmount);
  const nextTier = getNextTier(ambassador.tier);

  let progressToNextTier = 1;
  let amountToNextTier = "0";
  if (nextTier) {
    const nextThreshold = parseAmount(nextTier.minPledgeAmount);
    const currentThreshold = parseAmount(tier.minPledgeAmount);
    const span = nextThreshold > currentThreshold ? nextThreshold - currentThreshold : 0n;
    const progress = span > 0n ? pledged - currentThreshold : 0n;
    const clamped = progress > 0n ? progress : 0n;
    progressToNextTier = span > 0n ? Number((clamped * 10_000n) / span) / 10_000 : 0;
    amountToNextTier = subtractClamped(nextTier.minPledgeAmount, ambassador.pledgedAmount);
  }

  return {
    ambassador,
    tier,
    pledgedAmount: ambassador.pledgedAmount,
    pledgeCount: ambassador.pledgeCount,
    progressToNextTier: Math.min(1, Math.max(0, progressToNextTier)),
    nextTier,
    amountToNextTier,
    rewards,
    thresholdMet: pledged >= parseAmount(tier.minPledgeAmount),
  };
}

/** Aggregate dashboard of the whole ambassador program. */
export async function getAmbassadorProgramSummary(
  campaignId: string,
  ambassadors = getAmbassadorDataSource(),
  invites = getAmbassadorInviteDataSource(),
  rewards = getAmbassadorRewardDataSource(),
): Promise<AmbassadorProgramSummary> {
  const list = await ambassadors.list(campaignId);
  const allRewards = await rewards.list(campaignId);
  const allInvites = await invites.list(campaignId);

  const summaries: AmbassadorPledgeSummary[] = [];
  let totalPledgedAmount = "0";
  let totalPledgeCount = 0;
  let totalCommissionOwed = "0";

  for (const ambassador of list) {
    const ambassadorRewards = allRewards.filter((reward) => reward.ambassadorId === ambassador.id);
    summaries.push(await getAmbassadorPledgeSummary(ambassador, ambassadorRewards));
    totalPledgedAmount = addAmounts(totalPledgedAmount, ambassador.pledgedAmount);
    totalPledgeCount += ambassador.pledgeCount;
    for (const reward of ambassadorRewards) {
      if (reward.status === "revoked") continue;
      totalCommissionOwed = addAmounts(totalCommissionOwed, reward.amount);
    }
  }

  return {
    campaignId,
    totalAmbassadors: list.length,
    activeAmbassadors: list.filter((ambassador) => ambassador.status === "active").length,
    pendingInvites: allInvites.filter((invite) => invite.status === "pending").length,
    totalPledgedAmount,
    totalPledgeCount,
    totalRewardsAssigned: allRewards.filter((reward) => reward.status !== "revoked").length,
    totalCommissionOwed,
    ambassadors: summaries.sort((a, b) => {
      const left = parseAmount(a.pledgedAmount);
      const right = parseAmount(b.pledgedAmount);
      if (left !== right) return left > right ? -1 : 1;
      return b.pledgeCount - a.pledgeCount;
    }),
  };
}
