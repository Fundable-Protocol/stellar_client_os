/**
 * Creator Grant Program Service
 *
 * Platform-funded matching programs that boost campaigns from
 * underrepresented creators. Matching is funded by a slice of platform
 * profits (the program's `totalPool`).
 *
 * A program matches a percentage of a qualifying campaign's first funds
 * (default 10% – "match the first 10%"). Each campaign is matched up to an
 * optional per-campaign cap, and the whole program up to its total pool.
 *
 * Example:
 *   - campaign raises 5,000 XLM
 *   - program matchPercentage = 10, per-campaign cap = 1,000
 *   - matched amount = min(500, 1,000, pool remaining) = 500
 */

import {
  getCampaign,
  getCampaignDataSource,
  type CampaignDataSource,
  type CampaignRecord,
} from "./campaign.service";

export type UnderrepresentedCriteria =
  | "REGION_SOUTH_GLOBAL"
  | "GENDER_MARGINALIZED"
  | "DISABILITY"
  | "INDIGENOUS"
  | "LGBTQ"
  | "RACIAL_ETHNIC_MINORITY";

export const UNDERREPRESENTED_CRITERIA: readonly UnderrepresentedCriteria[] = [
  "REGION_SOUTH_GLOBAL",
  "GENDER_MARGINALIZED",
  "DISABILITY",
  "INDIGENOUS",
  "LGBTQ",
  "RACIAL_ETHNIC_MINORITY",
];

export const DEFAULT_MATCH_PERCENTAGE = 10;

export type GrantProgramStatus = "OPEN" | "PAUSED" | "CLOSED";

export interface GrantProgram {
  id: string;
  name: string;
  description?: string;
  /** Percentage of a campaign's first funds that gets matched (10 = 10%). */
  matchPercentage: number;
  /** Per-campaign matching cap, in stroops. */
  perCampaignCap: string;
  /** Total pool reserved as XLM-equivalent stroops, funded by platform profits. */
  totalPool: string;
  allocated: string;
  eligibilityCriteria: UnderrepresentedCriteria[];
  status: GrantProgramStatus;
  createdAt: number;
  updatedAt: number;
}

export interface GrantAllocation {
  id: string;
  programId: string;
  campaignId: string;
  /** Base contribution observed at match time (stroops). */
  baseContribution: string;
  /** Platform-matched amount (stroops). */
  matchedAmount: string;
  allocatedBy: string;
  allocatedAt: number;
}

export interface GrantProgramSummary {
  program: GrantProgram;
  remainingPool: string;
  eligible: boolean;
  matchedForCampaign: string;
  nextMatchAmount: string;
}

interface GrantState {
  programs: GrantProgram[];
  allocations: GrantAllocation[];
}

let defaultState: GrantState = { programs: [], allocations: [] };

function parseAmount(amount: string): bigint {
  if (!/^\d+$/.test(amount)) throw new Error("amount must be a non-negative integer string");
  return BigInt(amount);
}

function maxOfBigInt(values: bigint[]): bigint {
  return values.reduce((max, value) => (value > max ? value : max), 0n);
}

export class GrantProgramService {
  private readonly state: GrantState;
  private readonly dataSource?: CampaignDataSource;

  constructor(dataSource?: CampaignDataSource, isolated = false) {
    this.state = isolated ? { programs: [], allocations: [] } : defaultState;
    this.dataSource = dataSource;
  }

  private campaignSource(): CampaignDataSource {
    return this.dataSource ?? getCampaignDataSource();
  }

  async createProgram(input: {
    name: string;
    description?: string;
    matchPercentage?: number;
    perCampaignCap?: string;
    totalPool: string;
    eligibilityCriteria: UnderrepresentedCriteria[];
  }): Promise<GrantProgram> {
    if (!input.name?.trim()) throw new Error("Grant program name is required");
    if (!input.eligibilityCriteria.length) {
      throw new Error("Grant program must declare at least one eligibility criterion");
    }
    for (const criteria of input.eligibilityCriteria) {
      if (!UNDERREPRESENTED_CRITERIA.includes(criteria)) {
        throw new Error(`Unknown eligibility criterion: ${criteria}`);
      }
    }
    const matchPercentage =
      input.matchPercentage ?? DEFAULT_MATCH_PERCENTAGE;
    if (!Number.isFinite(matchPercentage) || matchPercentage <= 0 || matchPercentage > 50) {
      throw new Error("matchPercentage must be between 1 and 50");
    }
    parseAmount(input.totalPool);

    const now = Date.now();
    const program: GrantProgram = {
      id: `grant_${crypto.randomUUID()}`,
      name: input.name.trim(),
      description: input.description,
      matchPercentage,
      perCampaignCap: input.perCampaignCap ?? "0",
      totalPool: input.totalPool,
      allocated: "0",
      eligibilityCriteria: [...input.eligibilityCriteria],
      status: "OPEN",
      createdAt: now,
      updatedAt: now,
    };
    this.state.programs.push(program);
    return program;
  }

  async listPrograms(): Promise<GrantProgram[]> {
    return [...this.state.programs].sort((a, b) => b.createdAt - a.createdAt);
  }

  async getProgram(programId: string): Promise<GrantProgram | null> {
    return this.state.programs.find((program) => program.id === programId) ?? null;
  }

  async setProgramStatus(programId: string, status: GrantProgramStatus): Promise<GrantProgram | null> {
    const program = await this.getProgram(programId);
    if (!program) return null;
    program.status = status;
    program.updatedAt = Date.now();
    return program;
  }

  async getEligiblePrograms(campaign: CampaignRecord): Promise<GrantProgram[]> {
    const tags = campaignTags(campaign);
    const programs = await this.listPrograms();
    return programs.filter(
      (program) =>
        program.status === "OPEN" &&
        program.eligibilityCriteria.some((criteria) => tags.includes(criteria)),
    );
  }

  /**
   * Computes the platform match for a fresh contribution. The match applies
   * to the FIRST `matchPercentage`% of a campaign's funds, is capped per
   * campaign and by the pool's remaining balance.
   */
  async computeMatch(
    programId: string,
    campaignId: string,
    baseContribution: string,
    allocatedBy: string,
  ): Promise<GrantAllocation | null> {
    const program = await this.getProgram(programId);
    if (!program) throw new Error(`Grant program ${programId} not found`);
    if (program.status !== "OPEN") throw new Error(`Grant program ${program.name} is ${program.status.toLowerCase()}`);
    if (!allocatedBy?.trim()) throw new Error("allocatedBy is required");

    const campaign = await getCampaign(campaignId, this.campaignSource());
    if (!campaign) throw new Error(`Campaign ${campaignId} not found`);

    const tags = campaignTags(campaign);
    if (!program.eligibilityCriteria.some((criteria) => tags.includes(criteria))) {
      throw new Error("Campaign does not meet the grant program's eligibility criteria");
    }

    const contribution = parseAmount(baseContribution);
    if (contribution <= 0n) throw new Error("baseContribution must be positive");

    const alreadyAllocated = this.allocationsForCampaign(programId, campaignId)
      .reduce((sum, allocation) => sum + parseAmount(allocation.matchedAmount), 0n);
    const raised = maxOfBigInt([parseAmount(campaign.raisedAmount), contribution]);
    const poolRemaining = maxOfBigInt([
      parseAmount(program.totalPool) - parseAmount(program.allocated),
      0n,
    ]);

    // Match the first `matchPercentage`% of total funds, but never beyond the
    // per-campaign cap or the remaining pool.
    const cap = parseAmount(program.perCampaignCap);
    const matchBudget = (raised * BigInt(program.matchPercentage)) / 100n;
    const uncapped = cap > 0n ? (matchBudget > cap ? cap : matchBudget) : matchBudget;
    const alreadyMatchedCap = maxOfBigInt([uncapped - alreadyAllocated, 0n]);
    const matchedAmount = alreadyMatchedCap > poolRemaining ? poolRemaining : alreadyMatchedCap;

    if (matchedAmount <= 0n) {
      throw new Error("No matching funds remaining for this campaign");
    }

    const allocation: GrantAllocation = {
      id: `grant_alloc_${crypto.randomUUID()}`,
      programId,
      campaignId,
      baseContribution: contribution.toString(),
      matchedAmount: matchedAmount.toString(),
      allocatedBy,
      allocatedAt: Date.now(),
    };
    this.state.allocations.push(allocation);
    program.allocated = (parseAmount(program.allocated) + matchedAmount).toString();
    program.updatedAt = Date.now();
    return allocation;
  }

  async getProgramSummary(
    programId: string,
    campaignId: string,
  ): Promise<GrantProgramSummary | null> {
    const program = await this.getProgram(programId);
    if (!program) return null;
    const campaign = await getCampaign(campaignId, this.campaignSource());
    const tags = campaign ? campaignTags(campaign) : [];
    const eligible =
      campaign !== null &&
      program.status === "OPEN" &&
      program.eligibilityCriteria.some((criteria) => tags.includes(criteria));
    const matchedForCampaign = this.allocationsForCampaign(programId, campaignId)
      .reduce((sum, allocation) => sum + parseAmount(allocation.matchedAmount), 0n);

    const poolRemaining = maxOfBigInt([
      parseAmount(program.totalPool) - parseAmount(program.allocated),
      0n,
    ]);
    const raised = campaign ? maxOfBigInt([parseAmount(campaign.raisedAmount), 0n]) : 0n;
    const cap = parseAmount(program.perCampaignCap);
    const matchBudget = (raised * BigInt(program.matchPercentage)) / 100n;
    const uncapped = cap > 0n ? (matchBudget > cap ? cap : matchBudget) : matchBudget;
    const nextMatch = maxOfBigInt([
      maxOfBigInt([uncapped - matchedForCampaign, 0n]) > poolRemaining
        ? poolRemaining
        : maxOfBigInt([uncapped - matchedForCampaign, 0n]),
      0n,
    ]);

    return {
      program: { ...program },
      remainingPool: poolRemaining.toString(),
      eligible,
      matchedForCampaign: matchedForCampaign.toString(),
      nextMatchAmount: eligible ? nextMatch.toString() : "0",
    };
  }

  async getCampaignAllocations(campaignId: string): Promise<GrantAllocation[]> {
    return this.state.allocations
      .filter((allocation) => allocation.campaignId === campaignId)
      .sort((a, b) => a.allocatedAt - b.allocatedAt);
  }

  private allocationsForCampaign(programId: string, campaignId: string): GrantAllocation[] {
    return this.state.allocations.filter(
      (allocation) => allocation.programId === programId && allocation.campaignId === campaignId,
    );
  }
}

/**
 * Derives underrepresented-community tags from the fields available on the
 * campaign indexer. Extend as richer creator metadata lands on-chain.
 */
export function campaignTags(campaign: CampaignRecord): UnderrepresentedCriteria[] {
  const tags = new Set<UnderrepresentedCriteria>();
  if (campaign.location) {
    const location = campaign.location.trim().toUpperCase();
    // Heuristic: common "Global South" regions declared on the gtl section.
    const globalSouth = ["NG", "GH", "KE", "TZ", "ZA", "IN", "BR", "MX", "ID", "VN", "BD", "NGN", "GHA", "KEN", "IND", "BRA", "MEX", "AFRICA", "NIGERIA", "KENYA", "GHANA", "TANZANIA", "SOUTH AFRICA", "INDIA", "BRAZIL", "MEXICO", "INDONESIA", "VIETNAM", "BANGLADESH", "PAKISTAN", "ETHIOPIA", "DRC", "CONGO", "COLOMBIA", "PERU"];
    if (globalSouth.some((code) => location.includes(code))) tags.add("REGION_SOUTH_GLOBAL");
  }
  return Array.from(tags);
}

let defaultService: GrantProgramService | null = null;

export function getGrantProgramService(dataSource?: CampaignDataSource): GrantProgramService {
  if (dataSource) return new GrantProgramService(dataSource);
  if (!defaultService) defaultService = new GrantProgramService();
  return defaultService;
}
export function resetGrantProgramService(seed?: GrantState): void {
  defaultState = seed ? { programs: [...seed.programs], allocations: [...seed.allocations] } : { programs: [], allocations: [] };
  defaultService = null;
}

export function seedGrantPrograms(programs: GrantProgram[], allocations: GrantAllocation[] = []): void {
  resetGrantProgramService({ programs, allocations });
}