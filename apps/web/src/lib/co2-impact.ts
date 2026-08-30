export interface TreeSpecies {
  id: string;
  label: string;
  /** Estimated CO2 absorbed (kg) per mature tree per year. */
  co2PerTreePerYearKg: number;
}

/**
 * Species-level CO2 uptake estimates. Values are indicative figures for a
 * mature tree (kg CO2 absorbed per year) and are used to project campaign
 * impact. Real uptake varies with age, soil, climate, and management.
 */
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

/** Average CO2 emitted by a passenger car, kg per km (approx. 120 g/km). */
const CAR_CO2_KG_PER_KM = 0.12;

export function getTreeSpecies(id: string): TreeSpecies {
  return TREE_SPECIES.find((species) => species.id === id) ?? TREE_SPECIES[0];
}

export interface Co2ImpactResult {
  speciesId: string;
  speciesLabel: string;
  co2PerTreePerYearKg: number;
  quantity: number;
  co2PerYearKg: number;
  co2PerYearTonnes: number;
  co2Over10YearsKg: number;
  co2Over10YearsTonnes: number;
  carKmEquivalentPerYear: number;
}

/**
 * Compute the projected CO2 offset for a campaign.
 *
 * @param speciesId - selected tree species id
 * @param quantity - number of trees (>= 0)
 * @returns the projected annual and 10-year CO2 offset plus a rough
 *          car-km equivalence for the annual figure
 */
export function calculateCo2Offset(
  speciesId: string,
  quantity: number,
): Co2ImpactResult {
  const species = getTreeSpecies(speciesId);
  const qty = Math.max(0, Math.floor(quantity) || 0);

  const co2PerYearKg = qty * species.co2PerTreePerYearKg;
  const co2Over10YearsKg = co2PerYearKg * 10;

  return {
    speciesId: species.id,
    speciesLabel: species.label,
    co2PerTreePerYearKg: species.co2PerTreePerYearKg,
    quantity: qty,
    co2PerYearKg,
    co2PerYearTonnes: co2PerYearKg / 1000,
    co2Over10YearsKg,
    co2Over10YearsTonnes: co2Over10YearsKg / 1000,
    carKmEquivalentPerYear: Math.round(co2PerYearKg / CAR_CO2_KG_PER_KM),
  };
}
