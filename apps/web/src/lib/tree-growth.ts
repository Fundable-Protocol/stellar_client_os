import { calculateCo2Offset } from "./co2-impact";

export type TreeGrowthTimeline = "baseline" | "5yr" | "10yr" | "20yr";

export interface TreeGrowthStageMetrics {
  timeline: TreeGrowthTimeline;
  years: number;
  label: string;
  stageName: string;
  heightMeters: number;
  canopyDiameterMeters: number;
  trunkCaliperCm: number;
  cumulativeCo2Kg: number;
  cumulativeCo2Tonnes: number;
  oxygenProducedKg: number;
  waterFilteredLiters: number;
  description: string;
  visualScale: number;
  foliageDensity: number;
  branchLayers: number;
  barkColor: string;
  foliageColor: string;
  foliageHighlightColor: string;
}

export interface TreeSpeciesProfile {
  name: string;
  scientificName: string;
  nativeRegion: string;
  maxMaturityHeightMeters: number;
  maxCanopyDiameterMeters: number;
  growthRate: "fast" | "moderate" | "slow";
  barkColor: string;
  foliageColor: string;
  foliageHighlightColor: string;
  canopyShape: "rounded" | "conical" | "umbrella" | "spreading" | "weeping";
  co2SpeciesId: string;
}

export const SPECIES_PROFILES: Record<string, TreeSpeciesProfile> = {
  Oak: {
    name: "White Oak",
    scientificName: "Quercus alba",
    nativeRegion: "North America & Temperate Europe",
    maxMaturityHeightMeters: 22,
    maxCanopyDiameterMeters: 18,
    growthRate: "moderate",
    barkColor: "#5c4033",
    foliageColor: "#2e7d32",
    foliageHighlightColor: "#66bb6a",
    canopyShape: "rounded",
    co2SpeciesId: "oak",
  },
  Pine: {
    name: "Scots Pine",
    scientificName: "Pinus sylvestris",
    nativeRegion: "Northern Hemisphere & Montane Forests",
    maxMaturityHeightMeters: 25,
    maxCanopyDiameterMeters: 10,
    growthRate: "fast",
    barkColor: "#4e3629",
    foliageColor: "#1b5e20",
    foliageHighlightColor: "#43a047",
    canopyShape: "conical",
    co2SpeciesId: "pine",
  },
  Mangrove: {
    name: "Red Mangrove",
    scientificName: "Rhizophora mangle",
    nativeRegion: "Tropical & Subtropical Coastal Estuaries",
    maxMaturityHeightMeters: 12,
    maxCanopyDiameterMeters: 9,
    growthRate: "fast",
    barkColor: "#3e2723",
    foliageColor: "#004d40",
    foliageHighlightColor: "#26a69a",
    canopyShape: "spreading",
    co2SpeciesId: "teak", // mangrove has heavy blue carbon density
  },
  Acacia: {
    name: "Acacia Tortilis",
    scientificName: "Vachellia tortilis",
    nativeRegion: "African Savanna & Arid Woodlands",
    maxMaturityHeightMeters: 16,
    maxCanopyDiameterMeters: 14,
    growthRate: "moderate",
    barkColor: "#4a3b32",
    foliageColor: "#33691e",
    foliageHighlightColor: "#7cb342",
    canopyShape: "umbrella",
    co2SpeciesId: "neem",
  },
  Cedar: {
    name: "Atlas Cedar",
    scientificName: "Cedrus atlantica",
    nativeRegion: "Atlas Mountains & Mediterranean",
    maxMaturityHeightMeters: 24,
    maxCanopyDiameterMeters: 12,
    growthRate: "moderate",
    barkColor: "#3e3835",
    foliageColor: "#006064",
    foliageHighlightColor: "#00acc1",
    canopyShape: "conical",
    co2SpeciesId: "cedar",
  },
  "Fruit Tree": {
    name: "Wild Mango / Orchard Fruit",
    scientificName: "Mangifera indica",
    nativeRegion: "Tropical Rain Corridors & Agroforestry",
    maxMaturityHeightMeters: 15,
    maxCanopyDiameterMeters: 12,
    growthRate: "fast",
    barkColor: "#503828",
    foliageColor: "#388e3c",
    foliageHighlightColor: "#ffb300",
    canopyShape: "rounded",
    co2SpeciesId: "mango",
  },
  Baobab: {
    name: "African Baobab",
    scientificName: "Adansonia digitata",
    nativeRegion: "Sub-Saharan Africa & Madagascar",
    maxMaturityHeightMeters: 18,
    maxCanopyDiameterMeters: 15,
    growthRate: "slow",
    barkColor: "#616161",
    foliageColor: "#2e7d32",
    foliageHighlightColor: "#81c784",
    canopyShape: "spreading",
    co2SpeciesId: "oak",
  },
  Redwood: {
    name: "Coast Redwood",
    scientificName: "Sequoia sempervirens",
    nativeRegion: "Pacific Temperate Rainforest",
    maxMaturityHeightMeters: 38,
    maxCanopyDiameterMeters: 12,
    growthRate: "fast",
    barkColor: "#5d4037",
    foliageColor: "#1b5e20",
    foliageHighlightColor: "#388e3c",
    canopyShape: "conical",
    co2SpeciesId: "eucalyptus",
  },
  Birch: {
    name: "Silver Birch",
    scientificName: "Betula pendula",
    nativeRegion: "Boreal & Temperate Eurasia",
    maxMaturityHeightMeters: 18,
    maxCanopyDiameterMeters: 8,
    growthRate: "fast",
    barkColor: "#d7ccc8",
    foliageColor: "#558b2f",
    foliageHighlightColor: "#9ccc65",
    canopyShape: "weeping",
    co2SpeciesId: "maple",
  },
};

const DEFAULT_PROFILE = SPECIES_PROFILES.Oak;

export function getTreeProfile(treeType?: string): TreeSpeciesProfile {
  if (!treeType) return DEFAULT_PROFILE;
  return SPECIES_PROFILES[treeType] ?? DEFAULT_PROFILE;
}

const TIMELINE_FACTORS: Record<
  TreeGrowthTimeline,
  {
    years: number;
    label: string;
    stageName: string;
    heightPct: number;
    canopyPct: number;
    caliperCm: number;
    visualScale: number;
    foliageDensity: number;
    branchLayers: number;
    description: (species: TreeSpeciesProfile) => string;
  }
> = {
  baseline: {
    years: 0,
    label: "Day 1",
    stageName: "Nursery Sapling",
    heightPct: 0.04, // ~0.5m - 0.8m
    canopyPct: 0.04,
    caliperCm: 2.5,
    visualScale: 0.28,
    foliageDensity: 0.35,
    branchLayers: 2,
    description: (sp) =>
      `A newly planted ${sp.name} sapling. Root network establishing into native mycorrhizal soil.`,
  },
  "5yr": {
    years: 5,
    label: "5 Years",
    stageName: "Young Juvenile Tree",
    heightPct: 0.28, // ~3.5m - 6m
    canopyPct: 0.25,
    caliperCm: 14,
    visualScale: 0.52,
    foliageDensity: 0.65,
    branchLayers: 3,
    description: (sp) =>
      `5-year juvenile ${sp.name}. Well-anchored root zone, producing active canopy shading and resilient bark.`,
  },
  "10yr": {
    years: 10,
    label: "10 Years",
    stageName: "Established Canopy Tree",
    heightPct: 0.58, // ~7m - 14m
    canopyPct: 0.6,
    caliperCm: 32,
    visualScale: 0.78,
    foliageDensity: 0.85,
    branchLayers: 4,
    description: (sp) =>
      `10-year established ${sp.name}. Thriving forest crown creating localized microclimate and habitat for native fauna.`,
  },
  "20yr": {
    years: 20,
    label: "20 Years",
    stageName: "Mature Climax Forest Pillar",
    heightPct: 0.95, // ~12m - 24m+
    canopyPct: 0.95,
    caliperCm: 68,
    visualScale: 1.0,
    foliageDensity: 1.0,
    branchLayers: 5,
    description: (sp) =>
      `Fully mature 20-year ${sp.name}. Heavy structural canopy sequestering peak atmospheric carbon and stabilizing surrounding soil.`,
  },
};

/**
 * Calculates accurate physical and ecological metrics for a tree at a specific timeline stage.
 */
export function getTreeGrowthStageData(
  treeType: string | undefined,
  timeline: TreeGrowthTimeline,
  treeCount: number = 1
): TreeGrowthStageMetrics {
  const profile = getTreeProfile(treeType);
  const factor = TIMELINE_FACTORS[timeline];
  const safeCount = Math.max(1, treeCount);

  // Height and canopy spread
  const heightMeters = Number(
    Math.max(0.5, profile.maxMaturityHeightMeters * factor.heightPct).toFixed(1)
  );
  const canopyDiameterMeters = Number(
    Math.max(0.4, profile.maxCanopyDiameterMeters * factor.canopyPct).toFixed(1)
  );

  // CO2 calculation based on species annual uptake rate
  const co2Data = calculateCo2Offset(profile.co2SpeciesId, safeCount);
  const annualKg = co2Data.co2PerYearKg;

  // Cumulative CO2 over the timeline horizon (accounting for juvenile exponential curve)
  let cumulativeCo2Kg = 0;
  if (factor.years === 0) {
    cumulativeCo2Kg = Math.round(annualKg * 0.05); // Initial seedbed footprint
  } else if (factor.years === 5) {
    // 5 years cumulative (averaging ~50% mature rate over years 0-5)
    cumulativeCo2Kg = Math.round(annualKg * 2.8);
  } else if (factor.years === 10) {
    // 10 years cumulative
    cumulativeCo2Kg = Math.round(annualKg * 7.5);
  } else {
    // 20 years cumulative
    cumulativeCo2Kg = Math.round(annualKg * 18.2);
  }

  // Oxygen production: roughly 1.07 kg O2 per kg CO2 sequestered by photosynthesis
  const oxygenProducedKg = Math.round(cumulativeCo2Kg * 1.07);

  // Stormwater filtration: approximately 3,500 liters per mature tree per year
  const waterFilteredLiters = Math.round(
    factor.years * 3200 * factor.canopyPct * safeCount
  );

  return {
    timeline,
    years: factor.years,
    label: factor.label,
    stageName: factor.stageName,
    heightMeters,
    canopyDiameterMeters,
    trunkCaliperCm: factor.caliperCm,
    cumulativeCo2Kg,
    cumulativeCo2Tonnes: Number((cumulativeCo2Kg / 1000).toFixed(2)),
    oxygenProducedKg,
    waterFilteredLiters,
    description: factor.description(profile),
    visualScale: factor.visualScale,
    foliageDensity: factor.foliageDensity,
    branchLayers: factor.branchLayers,
    barkColor: profile.barkColor,
    foliageColor: profile.foliageColor,
    foliageHighlightColor: profile.foliageHighlightColor,
  };
}

export const TIMELINE_OPTIONS: { id: TreeGrowthTimeline; label: string; badge: string }[] = [
  { id: "baseline", label: "Day 1", badge: "Planted" },
  { id: "5yr", label: "5 Years", badge: "Sapling" },
  { id: "10yr", label: "10 Years", badge: "Canopy" },
  { id: "20yr", label: "20 Years", badge: "Mature" },
];
