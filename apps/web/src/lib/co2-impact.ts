import { getCampaignCreditMultiplierBps, getCampaignSeason } from "./campaign-rules";

export interface TreeSpecies {
  id: string;
  label: string;
  co2PerTreePerYearKg: number;
}

export const TREE_SPECIES: TreeSpecies[] = [
  { id: "oak", label: "Oak", co2PerTreePerYearKg: 21 },
  { id: "maple", label: "Maple", co2PerTreePerYearKg: 12 },
  { id: "pine", label: "Pine", co2PerTreePerYearKg: 18 },
  { id: "teak", label: "Teak", co2PerTreePerYearKg: 24 },
  { id: "eucalyptus", label: "Eucalyptus", co2PerTreePerYearKg: 34 },
  { id: "mango", label: "Mango", co2PerTreePerYearKg: 28 },
  { id: "neem", label: "Neem", co2PerTreePerYearKg: 27 },
  { id: "cedar", label: "Cedar", co2PerTreePerYearKg: 20 },
];

export const DEFAULT_SPECIES_ID = TREE_SPECIES[0].id;

const CAR_CO2_KG_PER_KM = 0.12;

export function getTreeSpecies(id: string): TreeSpecies {
  return TREE_SPECIES.find((s) => s.id === id) ?? TREE_SPECIES[0];
}

export interface Co2ImpactResult {
  speciesId: string;
  speciesLabel: string;
  co2PerTreePerYearKg: number;
  quantity: number;
  co2Multiplier: number;
  season: ReturnType<typeof getCampaignSeason>;
  co2PerYearKg: number;
  co2PerYearTonnes: number;
  co2Over10YearsKg: number;
  co2Over10YearsTonnes: number;
  carKmEquivalentPerYear: number;
}

/**
 * Return whether a date/timestamp falls within the rainy season (May–October UTC).
 */
export function isRainySeason(dateOrTimestamp?: Date | number): boolean {
  const date = dateOrTimestamp === undefined
    ? new Date()
    : typeof dateOrTimestamp === "number"
      ? new Date(dateOrTimestamp * 1000)
      : dateOrTimestamp;
  return getCampaignSeason(date) === "rainy-season";
  if (dateOrTimestamp === undefined) return false;
  const date =
    typeof dateOrTimestamp === "number"
      ? new Date(dateOrTimestamp * 1000)
      : dateOrTimestamp;
  const month = date.getMonth() + 1; // 1-indexed (1=Jan, 5=May, 10=Oct)
  return month >= 5 && month <= 10;
}

/**
 * Compute projected CO2 offset using the campaign's seasonal credit multiplier.
 *
 * @param speciesId - selected tree species id
 * @param quantity - number of trees (>= 0)
 * @returns the projected annual and 10- year CO2 offset plus a rough
 *          car-km equivalence for the annual figure
 */
export function calculateCo2Offset(
  speciesId: string,
  quantity: number,
  dateOrTimestamp?: Date | number,
  growthRateMultiplier: number = 1.0,
): Co2ImpactResult {
  const species = getTreeSpecies(speciesId);
  const qty = Math.max(0, Math.floor(quantity) || 0);

  const date = dateOrTimestamp === undefined ? new Date() : dateOrTimestamp;
  const multiplierBps = getCampaignCreditMultiplierBps(date);
  const co2Multiplier = multiplierBps / 10_000;
  const rainySeason = isRainySeason(dateOrTimestamp);
  // The rainy-season bonus is a property of a known planting date. Callers
  // without one (projection calculators, growth-stage models) must get a
  // deterministic baseline rather than a multiplier that silently changes
  // with the current calendar month (issue #907).
  const rainySeason = dateOrTimestamp !== undefined && isRainySeason(dateOrTimestamp);
  const co2Multiplier = (rainySeason ? 2 : 1) * growthRateMultiplier;

  const baseCo2PerYearKg = qty * species.co2PerTreePerYearKg;
  const co2PerYearKg = baseCo2PerYearKg * co2Multiplier;
  const co2Over10YearsKg = co2PerYearKg * 10;

  return {
    speciesId: species.id,
    speciesLabel: species.label,
    co2PerTreePerYearKg: species.co2PerTreePerYearKg,
    quantity: qty,
    co2Multiplier,
    season: getCampaignSeason(date),
    co2PerYearKg,
    co2PerYearTonnes: co2PerYearKg / 1000,
    co2Over10YearsKg,
    co2Over10YearsTonnes: co2Over10YearsKg / 1000,
    carKmEquivalentPerYear: Math.round(co2PerYearKg / CAR_CO2_KG_PER_KM),
  };
}
