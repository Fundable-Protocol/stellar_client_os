import { describe, expect, it } from "vitest";
import { calculateSustainabilityScore } from "../sustainability-score";

describe("sustainability-score calculation engine", () => {
  it("calculates a score strictly between 0 and 100", () => {
    const score = calculateSustainabilityScore({
      treeType: "Oak",
      location: "Amazon Basin, Brazil",
      treesPlanted: 1500,
    });

    expect(score.totalScore).toBeGreaterThanOrEqual(0);
    expect(score.totalScore).toBeLessThanOrEqual(100);
  });

  it("verifies that the sum of the 4 pillar scores equals the total score", () => {
    const score = calculateSustainabilityScore({
      speciesList: ["Oak", "Pine", "Cedar"],
      location: "Temperate Valley",
      treesPlanted: 500,
    });

    const pillarSum =
      score.pillars.speciesDiversity.score +
      score.pillars.climateImpact.score +
      score.pillars.soilHealth.score +
      score.pillars.biodiversityPotential.score;

    expect(score.totalScore).toBe(pillarSum);
  });

  it("rewards species diversity with higher diversity subscores", () => {
    const monoculture = calculateSustainabilityScore({
      speciesList: ["Pine"],
      location: "Rocky Ridge",
    });

    const twoSpecies = calculateSustainabilityScore({
      speciesList: ["Pine", "Oak"],
      location: "Rocky Ridge",
    });

    const threeSpecies = calculateSustainabilityScore({
      speciesList: ["Pine", "Oak", "Cedar"],
      location: "Rocky Ridge",
    });

    const polyculture = calculateSustainabilityScore({
      speciesList: ["Pine", "Oak", "Cedar", "Acacia", "Fruit Tree"],
      location: "Rocky Ridge",
    });

    expect(monoculture.pillars.speciesDiversity.score).toBeLessThan(
      twoSpecies.pillars.speciesDiversity.score
    );
    expect(twoSpecies.pillars.speciesDiversity.score).toBeLessThan(
      threeSpecies.pillars.speciesDiversity.score
    );
    expect(threeSpecies.pillars.speciesDiversity.score).toBeLessThanOrEqual(
      polyculture.pillars.speciesDiversity.score
    );
    expect(polyculture.pillars.speciesDiversity.score).toBe(25);
  });

  it("evaluates regional climate impact correctly", () => {
    const amazon = calculateSustainabilityScore({
      treeType: "Oak",
      location: "Amazon Rainforest, Brazil",
    });

    const boreal = calculateSustainabilityScore({
      treeType: "Pine",
      location: "Boreal Forest, Canada",
    });

    expect(amazon.pillars.climateImpact.score).toBeGreaterThan(
      boreal.pillars.climateImpact.score
    );
  });

  it("assigns appropriate tiers based on total score thresholds", () => {
    const optimal = calculateSustainabilityScore({
      speciesList: ["Mangrove", "Cedar", "Fruit Tree", "Oak"],
      location: "Amazon Coastal Estuary",
      treesPlanted: 2000,
    });
    expect(optimal.totalScore).toBeGreaterThanOrEqual(90);
    expect(optimal.tier).toBe("Optimal");

    const single = calculateSustainabilityScore({
      speciesList: ["Pine"],
      location: "Cold Boreal Subarctic",
      treesPlanted: 50,
    });
    expect(single.totalScore).toBeLessThan(75);
    expect(single.tier).toBe("Moderate");
  });

  it("provides transparent rationales and highlights for every pillar", () => {
    const score = calculateSustainabilityScore({
      treeType: "Mangrove",
      location: "Coastal Mangrove Wetland",
      treesPlanted: 1200,
    });

    expect(score.pillars.speciesDiversity.rationale).toBeTruthy();
    expect(score.pillars.climateImpact.rationale).toBeTruthy();
    expect(score.pillars.soilHealth.rationale).toBeTruthy();
    expect(score.pillars.biodiversityPotential.rationale).toBeTruthy();

    expect(score.pillars.speciesDiversity.highlights.length).toBeGreaterThan(0);
    expect(score.pillars.climateImpact.highlights.length).toBeGreaterThan(0);
    expect(score.pillars.soilHealth.highlights.length).toBeGreaterThan(0);
    expect(score.pillars.biodiversityPotential.highlights.length).toBeGreaterThan(0);

    expect(score.recommendations.length).toBeGreaterThan(0);
  });
});
