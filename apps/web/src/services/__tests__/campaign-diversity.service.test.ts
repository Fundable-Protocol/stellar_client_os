import { describe, expect, it } from "vitest";
import {
  CARBON_CREDIT_MIN_SCORE,
  CARBON_CREDIT_MIN_TREES,
  MAX_DIVERSITY_SPECIES,
  MAX_SCORE,
  TIER_HIGH_MIN,
  TIER_MEDIUM_MIN,
  computeDiversityScore,
  describeDiversityScore,
  diversityScoreFromPlantings,
  diversityScorePercent,
  isCarbonCreditEligible,
  speciesCoverageBps,
  speciesEvennessBps,
  tierForScore,
  type DiversityPlantingRecord,
} from "../campaign-diversity.service";

/** Build a list of `{ treeCount }` entries from a flat list of counts. */
const species = (...treeCounts: number[]) => treeCounts.map((treeCount) => ({ treeCount }));

/** Twelve species, the point at which the coverage factor saturates. */
const TWELVE = species(100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100);

const planting = (
  overrides: Partial<DiversityPlantingRecord> = {}
): DiversityPlantingRecord => ({
  campaignId: "campaign-1",
  plantingId: 1,
  speciesCode: "aa".repeat(32),
  speciesName: "Oak",
  treeCount: 100,
  reporter: "GPLANTER",
  recordedAt: 1_000,
  verifiedAt: 0,
  rejectedAt: 0,
  status: "pending",
  ...overrides,
});

describe("species coverage factor", () => {
  it("ramps linearly to full marks at twelve species", () => {
    expect(speciesCoverageBps(0)).toBe(0);
    expect(speciesCoverageBps(1)).toBe(833);
    expect(speciesCoverageBps(2)).toBe(1_666);
    expect(speciesCoverageBps(6)).toBe(5_000);
    expect(speciesCoverageBps(MAX_DIVERSITY_SPECIES)).toBe(MAX_SCORE);
  });

  it("saturates beyond twelve species", () => {
    expect(speciesCoverageBps(13)).toBe(MAX_SCORE);
    expect(speciesCoverageBps(64)).toBe(MAX_SCORE);
  });

  it("ignores negative counts", () => {
    expect(speciesCoverageBps(-1)).toBe(0);
  });
});

describe("species evenness factor", () => {
  it("scores a monoculture as zero", () => {
    expect(speciesEvennessBps([10_000])).toBe(0);
  });

  it("scores fewer than two trees as zero", () => {
    expect(speciesEvennessBps([])).toBe(0);
    expect(speciesEvennessBps([1])).toBe(0);
  });

  it("scores an even split as full marks", () => {
    expect(speciesEvennessBps([50, 50])).toBe(MAX_SCORE);
    expect(speciesEvennessBps([100, 100, 100, 100])).toBe(MAX_SCORE);
  });

  it("penalises an uneven split", () => {
    // A 3:1 split is Simpson diversity 0.375, normalised by (1 - 1/2) = 0.5.
    expect(speciesEvennessBps([300, 100])).toBe(7_518);
  });

  it("never exceeds full marks for a perfectly even planting", () => {
    const evenness = speciesEvennessBps(TWELVE.map((s) => s.treeCount));
    expect(evenness).toBe(MAX_SCORE);
  });

  it("drops as the planting becomes more concentrated", () => {
    const balanced = speciesEvennessBps([10, 10, 10, 10]);
    const skewed = speciesEvennessBps([37, 1, 1, 1]);
    expect(skewed).toBeLessThan(balanced);
  });

  it("ignores zero and non-finite counts", () => {
    expect(speciesEvennessBps([50, 50, 0, Number.NaN])).toBe(MAX_SCORE);
  });
});

describe("computeDiversityScore", () => {
  it("scores a monoculture as zero regardless of volume", () => {
    expect(computeDiversityScore(species(10_000))).toBe(0);
  });

  it("scores an empty planting as zero", () => {
    expect(computeDiversityScore([])).toBe(0);
  });

  it("scores twelve evenly planted species at full marks", () => {
    expect(computeDiversityScore(TWELVE)).toBe(MAX_SCORE);
  });

  it("saturates beyond twelve evenly planted species", () => {
    expect(computeDiversityScore(species(...Array<number>(20).fill(100)))).toBe(MAX_SCORE);
  });

  it("combines coverage and evenness", () => {
    // 2/12 coverage, perfect evenness.
    expect(computeDiversityScore(species(50, 50))).toBe(1_666);
    // 2/12 coverage, 7_518 evenness.
    expect(computeDiversityScore(species(300, 100))).toBe(1_252);
  });

  it("penalises a dominant species even at full coverage", () => {
    // Twelve species, 110 of the 121 trees oak.
    const dominated = species(110, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1);
    expect(computeDiversityScore(dominated)).toBe(1_900);
    expect(computeDiversityScore(dominated)).toBeLessThan(
      computeDiversityScore(TWELVE)
    );
  });

  it("rises monotonically as equal-proportion species are added", () => {
    const scores = TWELVE.map((_, index) =>
      computeDiversityScore(species(...Array<number>(index + 1).fill(100)))
    );
    for (let i = 1; i < scores.length; i += 1) {
      expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1]);
    }
    expect(scores[scores.length - 1]).toBe(MAX_SCORE);
  });
});

describe("diversityScoreFromPlantings", () => {
  it("counts only verified batches", () => {
    const verified = planting({ status: "verified", treeCount: 50 });
    const pending = planting({ plantingId: 2, status: "pending", treeCount: 50 });
    const rejected = planting({ plantingId: 3, status: "rejected", treeCount: 50 });

    expect(
      diversityScoreFromPlantings([verified, pending, rejected])
    ).toBe(0);
  });

  it("aggregates repeated batches of the same species", () => {
    const first = planting({
      plantingId: 1,
      speciesCode: "aa".repeat(32),
      status: "verified",
      treeCount: 50,
    });
    const second = planting({
      plantingId: 2,
      speciesCode: "aa".repeat(32),
      status: "verified",
      treeCount: 50,
    });
    const other = planting({
      plantingId: 3,
      speciesCode: "bb".repeat(32),
      status: "verified",
      treeCount: 100,
    });

    // oak 100 (two batches) + pine 100 = two species in equal proportion.
    expect(diversityScoreFromPlantings([first, second, other])).toBe(1_666);
  });

  it("returns zero when nothing is verified", () => {
    expect(diversityScoreFromPlantings([planting()])).toBe(0);
  });
});

describe("tierForScore", () => {
  it("treats the band lower bounds as inclusive", () => {
    expect(tierForScore(0)).toBe("Low");
    expect(tierForScore(TIER_MEDIUM_MIN - 1)).toBe("Low");
    expect(tierForScore(TIER_MEDIUM_MIN)).toBe("Medium");
    expect(tierForScore(TIER_HIGH_MIN - 1)).toBe("Medium");
    expect(tierForScore(TIER_HIGH_MIN)).toBe("High");
    expect(tierForScore(MAX_SCORE)).toBe("High");
  });
});

describe("isCarbonCreditEligible", () => {
  it("requires both the tree floor and the score floor", () => {
    expect(isCarbonCreditEligible(0, MAX_SCORE)).toBe(false);
    expect(isCarbonCreditEligible(CARBON_CREDIT_MIN_TREES, 0)).toBe(false);
    expect(
      isCarbonCreditEligible(
        CARBON_CREDIT_MIN_TREES,
        CARBON_CREDIT_MIN_SCORE
      )
    ).toBe(true);
  });

  it("rejects a large monoculture", () => {
    expect(isCarbonCreditEligible(500_000, 0)).toBe(false);
  });
});

describe("presentation helpers", () => {
  it("converts basis points to a bounded percentage", () => {
    expect(diversityScorePercent(0)).toBe(0);
    expect(diversityScorePercent(-5)).toBe(0);
    expect(diversityScorePercent(5_000)).toBe(50);
    expect(diversityScorePercent(MAX_SCORE)).toBe(100);
    expect(diversityScorePercent(MAX_SCORE * 2)).toBe(100);
  });

  it("explains a monoculture and an empty planting", () => {
    expect(describeDiversityScore(0, 0)).toBe("No verified plantings yet.");
    expect(describeDiversityScore(1, 0)).toContain("monoculture");
  });

  it("explains a mixed planting", () => {
    const score = computeDiversityScore(species(300, 100));
    const description = describeDiversityScore(
      2,
      score,
      speciesEvennessBps([300, 100])
    );
    expect(description).toContain("13% diversity value");
    expect(description).toContain("partial species coverage");
    expect(description).toContain("75% species balance");
  });

  it("reports full coverage once twelve species are verified", () => {
    expect(describeDiversityScore(12, MAX_SCORE, MAX_SCORE)).toContain(
      "full species coverage"
    );
  });
});
