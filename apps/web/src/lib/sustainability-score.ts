import type {
  CampaignSustainabilityScore,
  SustainabilityPillarScore,
  SustainabilityTier,
} from "@/types/campaign";

export interface SustainabilityCalculationParams {
  treeType?: string;
  speciesList?: string[];
  treesPlanted?: number | string;
  location?: string;
  description?: string;
  category?: string;
}

const ECOLOGICAL_REGIONS: Record<
  string,
  {
    climateScore: number;
    climateRationale: string;
    soilScore: number;
    soilRationale: string;
    biodiversityScore: number;
    biodiversityRationale: string;
  }
> = {
  amazon: {
    climateScore: 24,
    climateRationale:
      "Critical equatorial carbon sink. High atmospheric moisture recycling and massive carbon density buffer.",
    soilScore: 23,
    soilRationale:
      "Prevents severe tropical topsoil leaching and stabilizes vulnerable rainforest clay horizons.",
    biodiversityScore: 25,
    biodiversityRationale:
      "World's highest terrestrial biodiversity hotspot, directly securing critical wildlife and avian corridors.",
  },
  mangrove: {
    climateScore: 25,
    climateRationale:
      "Top-tier coastal blue carbon density with exceptional long-term sediment carbon storage capacity.",
    soilScore: 25,
    soilRationale:
      "Dense stilt root networks anchor estuarine mudflats, dissipating tidal energy and halting coastal erosion.",
    biodiversityScore: 24,
    biodiversityRationale:
      "Vital marine and avian nursery habitat protecting juvenile fish, crustaceans, and migratory shorebirds.",
  },
  savanna: {
    climateScore: 22,
    climateRationale:
      "Vital arid green wall mitigating semi-arid desertification and moderating extreme surface heat.",
    soilScore: 22,
    soilRationale:
      "Extensive lateral root systems bind sandy topsoils, dramatically increasing rainwater retention.",
    biodiversityScore: 22,
    biodiversityRationale:
      "Key dryland canopy shade and seasonal forage for savanna herbivores, raptors, and wild pollinators.",
  },
  temperate: {
    climateScore: 20,
    climateRationale:
      "Stable long-term biomass carbon sequestration with robust seasonal carbon retention.",
    soilScore: 21,
    soilRationale:
      "Rich humus leaf litter turnover actively builds topsoil depth and feeds soil mycorrhizae.",
    biodiversityScore: 20,
    biodiversityRationale:
      "Multi-layered canopy nesting sites supporting native temperate songbirds and small mammals.",
  },
  boreal: {
    climateScore: 19,
    climateRationale:
      "Large-scale northern hemisphere carbon storage in dense coniferous biomass.",
    soilScore: 18,
    soilRationale:
      "Cold-climate soil organic stabilization, though with slower nutrient decomposition rates.",
    biodiversityScore: 18,
    biodiversityRationale:
      "Critical winter cover and nesting habitat for boreal owls, ungulates, and boreal insects.",
  },
};

function detectRegion(location = "", description = ""): keyof typeof ECOLOGICAL_REGIONS {
  const text = `${location} ${description}`.toLowerCase();
  if (text.includes("amazon") || text.includes("rainforest") || text.includes("tropical") || text.includes("brazil")) {
    return "amazon";
  }
  if (text.includes("mangrove") || text.includes("coastal") || text.includes("estuary") || text.includes("wetland")) {
    return "mangrove";
  }
  if (text.includes("savanna") || text.includes("sahel") || text.includes("africa") || text.includes("arid") || text.includes("desert")) {
    return "savanna";
  }
  if (text.includes("boreal") || text.includes("conifer") || text.includes("pine") || text.includes("subarctic")) {
    return "boreal";
  }
  return "temperate";
}

function getGrade(score: number, maxScore: number): "Optimal" | "High" | "Moderate" | "Developing" {
  const ratio = score / maxScore;
  if (ratio >= 0.9) return "Optimal";
  if (ratio >= 0.75) return "High";
  if (ratio >= 0.55) return "Moderate";
  return "Developing";
}

export function calculateSustainabilityScore(
  params: SustainabilityCalculationParams = {}
): CampaignSustainabilityScore {
  const treeType = params.treeType || "Oak";
  const speciesList = params.speciesList?.length ? params.speciesList : [treeType];
  const uniqueSpecies = Array.from(new Set(speciesList.map((s) => s.trim()))).filter(Boolean);
  const speciesCount = Math.max(1, uniqueSpecies.length);

  const regionKey = detectRegion(params.location, params.description);
  const regionProfile = ECOLOGICAL_REGIONS[regionKey];

  // 1. Tree Species Diversity Score (0 - 25)
  let diversityScore = 10; // Baseline for single species
  let diversityRationale = `Single species planting (${uniqueSpecies.join(", ")}). Monocultures possess lower resilience against specialized pests and climate shocks.`;
  const diversityHighlights = [
    `Current species count: ${speciesCount}`,
    speciesCount === 1 ? "Vulnerable to single-species blight" : "Polyculture provides ecological insurance",
  ];

  if (speciesCount === 2) {
    diversityScore = 18;
    diversityRationale = `Polyculture with 2 complementary species (${uniqueSpecies.join(", ")}). Moderate disease barrier and layered canopy distribution.`;
    diversityHighlights.push("Complementary canopy stratification");
  } else if (speciesCount === 3) {
    diversityScore = 22;
    diversityRationale = `Diverse 3-species polyculture (${uniqueSpecies.join(", ")}). Strong ecological resilience with balanced root architecture.`;
    diversityHighlights.push("High resistance to pest outbreaks");
    diversityHighlights.push("Multi-tiered root water uptake");
  } else if (speciesCount >= 4) {
    diversityScore = 25;
    diversityRationale = `Exceptional ecological guild featuring ${speciesCount} native species (${uniqueSpecies.slice(0, 4).join(", ")}${speciesCount > 4 ? "..." : ""}). Maximizes natural forest succession.`;
    diversityHighlights.push("Full ecological guild dynamics");
    diversityHighlights.push("Maximum micro-ecosystem stability");
  }

  // 2. Regional Climate Impact Score (0 - 25)
  let climateScore = regionProfile.climateScore;
  const climateHighlights = [
    `Target ecoregion: ${regionKey.toUpperCase()}`,
    regionKey === "amazon" || regionKey === "mangrove"
      ? "High carbon density priority zone"
      : "Active microclimate stabilization",
  ];

  // Bonus for larger scale plantings
  const rawCount = typeof params.treesPlanted === "number"
    ? params.treesPlanted
    : parseInt(String(params.treesPlanted || "").replace(/,/g, ""), 10) || 0;

  if (rawCount >= 1000) {
    climateScore = Math.min(25, climateScore + 1);
    climateHighlights.push("High scale landscape impact (>1,000 trees)");
  }

  // 3. Soil Health Improvement Score (0 - 25)
  let soilScore = regionProfile.soilScore;
  const soilHighlights = [
    "Erosion prevention and watershed preservation",
    "Microbial and mycorrhizal network nourishment",
  ];

  // Deep taproot / wetland specialists boost soil score
  const isSoilSpecialist = uniqueSpecies.some((s) => {
    const lower = s.toLowerCase();
    return lower.includes("mangrove") || lower.includes("acacia") || lower.includes("oak") || lower.includes("cedar");
  });

  if (isSoilSpecialist) {
    soilScore = Math.min(25, soilScore + 1);
    soilHighlights.push("Deep-rooting or coastal stabilizing root architecture");
  }

  // 4. Biodiversity Potential Score (0 - 25)
  let biodiversityScore = regionProfile.biodiversityScore;
  const biodiversityHighlights = [
    "Native wildlife habitat and avian nesting potential",
    "Pollinator forage and wildlife food mast",
  ];

  // Monoculture penalty for biodiversity
  if (speciesCount === 1) {
    biodiversityScore = Math.max(12, biodiversityScore - 2);
    biodiversityHighlights.push("Limited to single habitat niche");
  } else {
    biodiversityHighlights.push("Diverse forage layers support varied wildlife species");
  }

  // Total Score (0 - 100)
  const totalScore = Math.min(
    100,
    Math.max(0, diversityScore + climateScore + soilScore + biodiversityScore)
  );

  let tier: SustainabilityTier = "Developing";
  let tierDescription = "Early-stage single-layer planting; recommended to transition toward polyculture.";
  if (totalScore >= 90) {
    tier = "Optimal";
    tierDescription = "Exceptional ecological polyculture with peak carbon absorption, deep soil stabilization, and thriving biodiversity.";
  } else if (totalScore >= 75) {
    tier = "High Impact";
    tierDescription = "Resilient multi-species restoration with substantial environmental returns and ecosystem stability.";
  } else if (totalScore >= 55) {
    tier = "Moderate";
    tierDescription = "Solid conservation baseline with clear opportunities to diversify species mix and expand habitat layers.";
  }

  // Actionable Creator Recommendations
  const recommendations: string[] = [];
  if (speciesCount < 3) {
    recommendations.push(
      "Introduce 1-2 native understory or nitrogen-fixing species (e.g., Acacia or wild fruit trees) to boost species diversity score by up to +7 points."
    );
  }
  if (speciesCount === 1) {
    recommendations.push(
      "Transition from single-species monoculture to an ecological guild to safeguard against regional tree disease and blight."
    );
  }
  if (regionKey !== "mangrove" && regionKey !== "amazon") {
    recommendations.push(
      "Integrate deep-taproot varieties alongside surface root species to maximize groundwater filtration and prevent topsoil runoff."
    );
  }
  if (recommendations.length < 2) {
    recommendations.push(
      "Establish native pollinator borders and flowering companion shrubs around planting perimeter to accelerate biodiversity corridors."
    );
  }

  const speciesDiversityPillar: SustainabilityPillarScore = {
    score: diversityScore,
    maxScore: 25,
    percentage: Math.round((diversityScore / 25) * 100),
    grade: getGrade(diversityScore, 25),
    title: "Tree Species Diversity",
    rationale: diversityRationale,
    highlights: diversityHighlights,
  };

  const climateImpactPillar: SustainabilityPillarScore = {
    score: climateScore,
    maxScore: 25,
    percentage: Math.round((climateScore / 25) * 100),
    grade: getGrade(climateScore, 25),
    title: "Regional Climate Impact",
    rationale: regionProfile.climateRationale,
    highlights: climateHighlights,
  };

  const soilHealthPillar: SustainabilityPillarScore = {
    score: soilScore,
    maxScore: 25,
    percentage: Math.round((soilScore / 25) * 100),
    grade: getGrade(soilScore, 25),
    title: "Soil Health Improvement",
    rationale: regionProfile.soilRationale,
    highlights: soilHighlights,
  };

  const biodiversityPotentialPillar: SustainabilityPillarScore = {
    score: biodiversityScore,
    maxScore: 25,
    percentage: Math.round((biodiversityScore / 25) * 100),
    grade: getGrade(biodiversityScore, 25),
    title: "Biodiversity Potential",
    rationale: regionProfile.biodiversityRationale,
    highlights: biodiversityHighlights,
  };

  return {
    totalScore,
    tier,
    tierDescription,
    pillars: {
      speciesDiversity: speciesDiversityPillar,
      climateImpact: climateImpactPillar,
      soilHealth: soilHealthPillar,
      biodiversityPotential: biodiversityPotentialPillar,
    },
    recommendations,
  };
}
