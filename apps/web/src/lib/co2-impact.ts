export interface TreeSpecies {
  id: string;
  label: string;
  co2PerTreePerYearKg: number;
  annualGrowthRate: number;
  annualMortalityRate: number;
  climateFactor: number;
}

export const TREE_SPECIES: TreeSpecies[] = [
  { id: "oak", label: "Oak", co2PerTreePerYearKg: 21, annualGrowthRate: 0.12, annualMortalityRate: 0.02, climateFactor: 0.95 },
  { id: "maple", label: "Maple", co2PerTreePerYearKg: 12, annualGrowthRate: 0.13, annualMortalityRate: 0.025, climateFactor: 1 },
  { id: "pine", label: "Pine", co2PerTreePerYearKg: 18, annualGrowthRate: 0.15, annualMortalityRate: 0.03, climateFactor: 0.9 },
  { id: "teak", label: "Teak", co2PerTreePerYearKg: 24, annualGrowthRate: 0.1, annualMortalityRate: 0.025, climateFactor: 1.05 },
  { id: "eucalyptus", label: "Eucalyptus", co2PerTreePerYearKg: 34, annualGrowthRate: 0.18, annualMortalityRate: 0.04, climateFactor: 1.1 },
  { id: "mango", label: "Mango", co2PerTreePerYearKg: 28, annualGrowthRate: 0.14, annualMortalityRate: 0.03, climateFactor: 1 },
  { id: "neem", label: "Neem", co2PerTreePerYearKg: 27, annualGrowthRate: 0.12, annualMortalityRate: 0.025, climateFactor: 0.95 },
  { id: "cedar", label: "Cedar", co2PerTreePerYearKg: 20, annualGrowthRate: 0.1, annualMortalityRate: 0.02, climateFactor: 0.9 },
];

export const DEFAULT_SPECIES_ID = TREE_SPECIES[0].id;
export const FORECAST_HORIZON_YEARS = 20;

const CAR_CO2_KG_PER_KM = 0.12;
const CONFIDENCE_Z_95 = 1.96;
const GROWTH_RATE_STANDARD_DEVIATION = 0.015;
const MORTALITY_RATE_STANDARD_DEVIATION = 0.005;
const CLIMATE_FACTOR_STANDARD_DEVIATION = 0.08;

function normalizeTreeQuantity(quantity: number): number {
  return Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : 0;
}

export interface Co2ForecastYear {
  year: number;
  expectedCumulativeKg: number;
  lower95Kg: number;
  upper95Kg: number;
}

function cumulativeSequestration(
  species: TreeSpecies,
  quantity: number,
  growthRate: number,
  mortalityRate: number,
  climateFactor: number,
  horizonYears: number,
): number {
  let cumulative = 0;
  for (let year = 1; year <= horizonYears; year += 1) {
    const growth = 1 - Math.exp(-Math.max(0, growthRate) * year);
    const survival = (1 - Math.min(1, Math.max(0, mortalityRate))) ** year;
    cumulative +=
      quantity *
      species.co2PerTreePerYearKg *
      growth *
      survival *
      Math.max(0, climateFactor);
  }
  return cumulative;
}

/**
 * Model cumulative sequestration as mature annual uptake × a species growth
 * curve × expected surviving trees × a species/climate adjustment. The
 * confidence interval uses a first-order uncertainty propagation with
 * independent normal inputs; rates and climate factors are planning
 * assumptions, not site-verified carbon accounting.
 */
export function calculateCo2Forecast(
  speciesId: string,
  quantity: number,
): Co2ForecastYear[] {
  const species = getTreeSpecies(speciesId);
  const treeCount = normalizeTreeQuantity(quantity);
  const forecast: Co2ForecastYear[] = [];

  for (let year = 1; year <= FORECAST_HORIZON_YEARS; year += 1) {
    const expectedCumulativeKg = cumulativeSequestration(
      species,
      treeCount,
      species.annualGrowthRate,
      species.annualMortalityRate,
      species.climateFactor,
      year,
    );
    const growthSensitivity =
      (cumulativeSequestration(
        species,
        treeCount,
        species.annualGrowthRate + GROWTH_RATE_STANDARD_DEVIATION,
        species.annualMortalityRate,
        species.climateFactor,
        year,
      ) -
        cumulativeSequestration(
          species,
          treeCount,
          species.annualGrowthRate - GROWTH_RATE_STANDARD_DEVIATION,
          species.annualMortalityRate,
          species.climateFactor,
          year,
        )) /
      2;
    const mortalitySensitivity =
      (cumulativeSequestration(
        species,
        treeCount,
        species.annualGrowthRate,
        species.annualMortalityRate + MORTALITY_RATE_STANDARD_DEVIATION,
        species.climateFactor,
        year,
      ) -
        cumulativeSequestration(
          species,
          treeCount,
          species.annualGrowthRate,
          species.annualMortalityRate - MORTALITY_RATE_STANDARD_DEVIATION,
          species.climateFactor,
          year,
        )) /
      2;
    const climateSensitivity =
      (cumulativeSequestration(
        species,
        treeCount,
        species.annualGrowthRate,
        species.annualMortalityRate,
        species.climateFactor + CLIMATE_FACTOR_STANDARD_DEVIATION,
        year,
      ) -
        cumulativeSequestration(
          species,
          treeCount,
          species.annualGrowthRate,
          species.annualMortalityRate,
          species.climateFactor - CLIMATE_FACTOR_STANDARD_DEVIATION,
          year,
        )) /
      2;
    const standardDeviation = Math.sqrt(
      growthSensitivity ** 2 +
        mortalitySensitivity ** 2 +
        climateSensitivity ** 2,
    );
    const margin = CONFIDENCE_Z_95 * standardDeviation;
    forecast.push({
      year,
      expectedCumulativeKg,
      lower95Kg: Math.max(0, expectedCumulativeKg - margin),
      upper95Kg: expectedCumulativeKg + margin,
    });
  }

  return forecast;
}

export function getTreeSpecies(id: string): TreeSpecies {
  return TREE_SPECIES.find((s) => s.id === id) ?? TREE_SPECIES[0];
}

export interface Co2ImpactResult {
  speciesId: string;
  speciesLabel: string;
  co2PerTreePerYearKg: number;
  quantity: number;
  co2Multiplier: number;
  co2PerYearKg: number;
  co2PerYearTonnes: number;
  co2Over10YearsKg: number;
  co2Over10YearsTonnes: number;
  carKmEquivalentPerYear: number;
}

/**
 * Helper to determine if a given date/timestamp falls within rainy season (May - October).
 * (issue #714)
 */
export function isRainySeason(dateOrTimestamp?: Date | number): boolean {
  const date = dateOrTimestamp
    ? typeof dateOrTimestamp === "number"
      ? new Date(dateOrTimestamp * 1000)
      : dateOrTimestamp
    : new Date();
  const month = date.getMonth() + 1; // 1-indexed (1=Jan, 5=May, 10=Oct)
  return month >= 5 && month <= 10;
}

/**
 * Compute the projected CO2 offset for a campaign, applying a 2x bonus multiplier
 * for campaigns created during the rainy season (May-October). (issue #714)
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
  const qty = normalizeTreeQuantity(quantity);

  const rainySeason = isRainySeason(dateOrTimestamp);
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
    co2PerYearKg,
    co2PerYearTonnes: co2PerYearKg / 1000,
    co2Over10YearsKg,
    co2Over10YearsTonnes: co2Over10YearsKg / 1000,
    carKmEquivalentPerYear: Math.round(co2PerYearKg / CAR_CO2_KG_PER_KM),
  };
}
