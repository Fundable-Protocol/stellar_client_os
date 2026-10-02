import { beforeEach, describe, expect, it } from "vitest";
import {
  GrantProgramService,
  applyAutomaticGrantMatches,
  campaignTags,
  getGrantProgramService,
  resetGrantProgramService,
  seedGrantPrograms,
  type GrantAllocation,
  type GrantProgram,
} from "./grant-program.service";
import {
  InMemoryCampaignDataSource,
  createCampaign,
  recordCampaignContribution,
  type CampaignRecord,
} from "./campaign.service";

async function fixtureCampaign(source: InMemoryCampaignDataSource, overrides: Partial<CampaignRecord> = {}) {
  const campaign = await createCampaign(
    { id: "grant-camp", creator: "creator-ke", name: "Mangrove restoration", location: "Kenya", goalAmount: "10000" },
    source,
  );
  return { ...campaign, raisedAmount: "5000", ...overrides };
}

describe("grant program service", () => {
  let source: InMemoryCampaignDataSource;
  let service: GrantProgramService;
  let campaign: CampaignRecord;

  beforeEach(async () => {
    resetGrantProgramService();
    source = new InMemoryCampaignDataSource();
    campaign = await fixtureCampaign(source);
    service = new GrantProgramService(source, true);
  });

  it("creates an open grant program with a default 10% match", async () => {
    const program = await service.createProgram({
      name: "Global South Creators Fund",
      description: "Match first 10% for south-global creators",
      totalPool: "100000",
      eligibilityCriteria: ["REGION_SOUTH_GLOBAL"],
    });
    expect(program).toMatchObject({
      name: "Global South Creators Fund",
      matchPercentage: 10,
      perCampaignCap: "0",
      allocated: "0",
      status: "OPEN",
    });
    expect(await service.listPrograms()).toHaveLength(1);
  });

  it("validates program input", async () => {
    await expect(
      service.createProgram({ name: "", totalPool: "1000", eligibilityCriteria: ["REGION_SOUTH_GLOBAL"] }),
    ).rejects.toThrow("name is required");
    await expect(
      service.createProgram({ name: "X", totalPool: "1000", eligibilityCriteria: [] }),
    ).rejects.toThrow("at least one eligibility criterion");
    await expect(
      service.createProgram({ name: "X", totalPool: "1000", matchPercentage: 99, eligibilityCriteria: ["REGION_SOUTH_GLOBAL"] }),
    ).rejects.toThrow("matchPercentage must be between 1 and 50");
    await expect(
      service.createProgram({ name: "X", totalPool: "not-a-number", eligibilityCriteria: ["REGION_SOUTH_GLOBAL"] }),
    ).rejects.toThrow("non-negative integer");
  });

  it("derives underrepresented tags from campaign location", () => {
    expect(campaignTags(campaign)).toContain("REGION_SOUTH_GLOBAL");
    expect(campaignTags({ ...campaign, location: "Ontario" })).toEqual([]);
  });

  it("matches the first 10% of a campaign's funds", async () => {
    const program = await service.createProgram({
      name: "Match Fund",
      totalPool: "100000",
      eligibilityCriteria: ["REGION_SOUTH_GLOBAL"],
    });
    const allocation = await service.computeMatch(program.id, campaign.id, "5000", "platform");
    expect(allocation?.matchedAmount).toBe("500");
    expect(allocation?.baseContribution).toBe("5000");

    const summary = await service.getProgramSummary(program.id, campaign.id);
    expect(summary?.program.allocated).toBe("500");
    expect(summary?.matchedForCampaign).toBe("500");
    expect(summary?.remainingPool).toBe("99500");
    expect(summary?.eligible).toBe(true);
  });

  it("caps the match per campaign", async () => {
    const program = await service.createProgram({
      name: "Capped Fund",
      totalPool: "100000",
      perCampaignCap: "300",
      eligibilityCriteria: ["REGION_SOUTH_GLOBAL"],
    });
    const allocation = await service.computeMatch(program.id, campaign.id, "5000", "platform");
    expect(allocation?.matchedAmount).toBe("300");
  });

  it("does not exceed the remaining pool", async () => {
    const program = await service.createProgram({
      name: "Tiny Fund",
      totalPool: "10",
      eligibilityCriteria: ["REGION_SOUTH_GLOBAL"],
    });
    const allocation = await service.computeMatch(program.id, campaign.id, "5000", "platform");
    expect(allocation?.matchedAmount).toBe("10");
  });

  it("stops matching once the campaign is fully matched", async () => {
    const program = await service.createProgram({
      name: "Once Only",
      totalPool: "100000",
      perCampaignCap: "500",
      eligibilityCriteria: ["REGION_SOUTH_GLOBAL"],
    });
    await service.computeMatch(program.id, campaign.id, "5000", "platform");
    await expect(service.computeMatch(program.id, campaign.id, "5000", "platform")).rejects.toThrow(
      "No matching funds remaining",
    );
  });

  it("rejects ineligible campaigns and closed programs", async () => {
    const program = await service.createProgram({
      name: "Eligibility",
      totalPool: "100000",
      eligibilityCriteria: ["INDIGENOUS"],
    });
    await expect(service.computeMatch(program.id, campaign.id, "5000", "platform")).rejects.toThrow(
      "does not meet the grant program's eligibility criteria",
    );

    const matchProgram = await service.createProgram({
      name: "Pause Me",
      totalPool: "100000",
      eligibilityCriteria: ["REGION_SOUTH_GLOBAL"],
    });
    await service.setProgramStatus(matchProgram.id, "CLOSED");
    await expect(service.computeMatch(matchProgram.id, campaign.id, "5000", "platform")).rejects.toThrow("is closed");
  });

  it("lists allocations for a campaign", async () => {
    const program = await service.createProgram({
      name: "History",
      totalPool: "100000",
      eligibilityCriteria: ["REGION_SOUTH_GLOBAL"],
    });
    await service.computeMatch(program.id, campaign.id, "5000", "platform");
    const allocations = await service.getCampaignAllocations(campaign.id);
    expect(allocations).toHaveLength(1);
    expect(allocations[0].matchedAmount).toBe("500");
  });

  it("merges creator-declared tags with the location heuristic", () => {
    expect(
      campaignTags({ ...campaign, underrepresentedTags: ["GENDER_MARGINALIZED", "gender-marginalized"] }),
    ).toEqual(["GENDER_MARGINALIZED", "REGION_SOUTH_GLOBAL"]);
    expect(
      campaignTags({ ...campaign, location: "Ontario", underrepresentedTags: ["INDIGENOUS"] }),
    ).toEqual(["INDIGENOUS"]);
    expect(
      campaignTags({ ...campaign, underrepresentedTags: ["not-a-criteria"] }),
    ).toEqual(["REGION_SOUTH_GLOBAL"]);
  });

  it("automatically matches contributions for eligible campaigns", async () => {
    seedGrantPrograms([
      {
        id: "grant_auto",
        name: "Auto Match Fund",
        matchPercentage: 10,
        perCampaignCap: "0",
        totalPool: "100000",
        allocated: "0",
        eligibilityCriteria: ["REGION_SOUTH_GLOBAL"],
        status: "OPEN",
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    const allocations = await applyAutomaticGrantMatches(campaign.id, "5000", "platform", source);
    expect(allocations).toHaveLength(1);
    expect(allocations[0].matchedAmount).toBe("500");
  });

  it("matches across every eligible open program", async () => {
    seedGrantPrograms([
      { id: "grant_a", name: "Fund A", matchPercentage: 10, perCampaignCap: "0", totalPool: "10000", allocated: "0", eligibilityCriteria: ["REGION_SOUTH_GLOBAL"], status: "OPEN", createdAt: 1, updatedAt: 1 },
      { id: "grant_b", name: "Fund B", matchPercentage: 10, perCampaignCap: "0", totalPool: "10000", allocated: "0", eligibilityCriteria: ["REGION_SOUTH_GLOBAL"], status: "OPEN", createdAt: 2, updatedAt: 2 },
    ]);
    const allocations = await applyAutomaticGrantMatches(campaign.id, "2000", "platform", source);
    expect(allocations).toHaveLength(2);
    expect(allocations.map((a) => a.matchedAmount)).toEqual(["200", "200"]);
  });

  it("qualifies a campaign through declared tags alone", async () => {
    await createCampaign(
      { id: "tagged-camp", creator: "creator-x", name: "Tagged", location: "Ontario", underrepresentedTags: ["GENDER_MARGINALIZED"], goalAmount: "1000" },
      source,
    );
    seedGrantPrograms([
      { id: "grant_gm", name: "Marginalized Creators Fund", matchPercentage: 10, perCampaignCap: "0", totalPool: "10000", allocated: "0", eligibilityCriteria: ["GENDER_MARGINALIZED"], status: "OPEN", createdAt: 1, updatedAt: 1 },
    ]);
    const allocations = await applyAutomaticGrantMatches("tagged-camp", "1000", "platform", source);
    expect(allocations).toHaveLength(1);
    expect(allocations[0].matchedAmount).toBe("100");
  });

  it("returns no allocations when no program matches the campaign", async () => {
    const allocations = await applyAutomaticGrantMatches(campaign.id, "5000", "platform", source);
    expect(allocations).toEqual([]);
  });

  it("matches automatically when a contribution is recorded", async () => {
    seedGrantPrograms([
      { id: "grant_auto2", name: "Auto Fund", matchPercentage: 10, perCampaignCap: "0", totalPool: "10000", allocated: "0", eligibilityCriteria: ["REGION_SOUTH_GLOBAL"], status: "OPEN", createdAt: 1, updatedAt: 1 },
    ]);
    const result = await recordCampaignContribution(campaign.id, "5000", source);
    expect(result?.campaign.raisedAmount).toBe("5000");

    const allocations = await getGrantProgramService(source).getCampaignAllocations(campaign.id);
    expect(allocations).toHaveLength(1);
    expect(allocations[0].matchedAmount).toBe("500");
    expect(allocations[0].allocatedBy).toBe("platform");
  });
});

describe("grant program seeding", () => {
  it("seedGrantPrograms replaces the default service state", async () => {
    resetGrantProgramService();
    const source = new InMemoryCampaignDataSource();
    await createCampaign({ id: "seed-camp", creator: "creator", name: "Seed", location: "Nigeria", goalAmount: "100", raisedAmount: "50" }, source);
    const program: GrantProgram = {
      id: "grant_1",
      name: "Seeded Fund",
      matchPercentage: 10,
      perCampaignCap: "0",
      totalPool: "1000",
      allocated: "0",
      eligibilityCriteria: ["REGION_SOUTH_GLOBAL"],
      status: "OPEN",
      createdAt: 1,
      updatedAt: 1,
    };
    const allocation: GrantAllocation = {
      id: "grant_alloc_1",
      programId: "grant_1",
      campaignId: "seed-camp",
      baseContribution: "50",
      matchedAmount: "5",
      allocatedBy: "platform",
      allocatedAt: 2,
    };
    seedGrantPrograms([program], [allocation]);
    const service = getGrantProgramService(source);
    const summary = await service.getProgramSummary("grant_1", "seed-camp");
    expect(summary?.matchedForCampaign).toBe("5");
  });
});