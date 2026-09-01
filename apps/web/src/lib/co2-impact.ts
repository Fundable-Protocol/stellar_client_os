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

export function calculateCo2Offset(speciesId: string, quantity: number) {
  const safeQuantity = Number.isFinite(quantity) ? Math.max(0, quantity) : 0;
  const species = getTreeSpecies(speciesId);
  const co2PerYearKg = safeQuantity * species.co2PerTreePerYearKg;
  const co2Over10YearsKg = co2PerYearKg * 10;

  return {
    speciesId: species.id,
    speciesLabel: species.label,
    quantity: safeQuantity,
    co2PerTreePerYearKg: co2PerYearKg,
    co2PerYearTonnes: co2PerYearKg / 1000,
    co2Over10YearsKg,
    co2Over10YearsTonnes: co2Over10YearsKg / 1000,
    carKmEquivalentPerYear: Math.round(co2PerYearKg / CAR_CO2_KG_PER_KM),
    co2PerTreePerYearKg: species.co2PerTreePerYearKg,
  };
}
