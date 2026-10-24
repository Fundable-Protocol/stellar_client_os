/**
 * Backer ROI projections for revenue-sharing / equity campaigns (#1244).
 *
 * Model: backers collectively receive `revenueSharePercent` of the campaign's
 * revenue for `termYears`. A backer's slice of that pool is their pledge as a
 * fraction of the funding goal (i.e. assuming the campaign is fully funded,
 * which is the conservative case — under-funded campaigns spread the same pool
 * across fewer backers). Revenue grows by `annualGrowthPercent` each year.
 *
 * These are illustrative estimates only; the UI must always show a disclaimer.
 */

export const INVESTMENT_MODELS = ["revenue_share", "equity"] as const;
export type InvestmentModel = (typeof INVESTMENT_MODELS)[number];

export const MAX_TERM_YEARS = 30;

export interface CampaignInvestmentTerms {
  model: InvestmentModel;
  /** Percentage of revenue distributed to backers (0–100]. */
  revenueSharePercent: number;
  /** Creator-projected revenue for the first year, in `currency`. */
  projectedAnnualRevenue: number;
  /** Total amount being raised from backers, in `currency`. */
  fundingGoal: number;
  /** Number of years revenue is shared (whole years, 1–30). */
  termYears: number;
  /** Expected year-on-year revenue growth; 0 means flat revenue. */
  annualGrowthPercent: number;
  currency: string;
  minPledge?: number;
  maxPledge?: number;
}

export interface RoiYear {
  year: number;
  projectedRevenue: number;
  payout: number;
  cumulativePayout: number;
}

export interface RoiProjection {
  pledgeAmount: number;
  /** Fraction (0–1) of the backer pool this pledge represents. */
  poolShare: number;
  years: RoiYear[];
  firstYearPayout: number;
  totalReturn: number;
  netProfit: number;
  /** Net profit as a percentage of the pledge. */
  roiPercent: number;
  /** Total return divided by pledge. */
  returnMultiple: number;
  /** First year in which cumulative payouts cover the pledge, or null. */
  paybackYear: number | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function calculateBackerRoi(terms: CampaignInvestmentTerms, pledgeAmount: number): RoiProjection {
  const pledge = Number.isFinite(pledgeAmount) ? Math.max(0, pledgeAmount) : 0;
  const poolShare = terms.fundingGoal > 0 ? Math.min(pledge / terms.fundingGoal, 1) : 0;
  const growth = 1 + terms.annualGrowthPercent / 100;
  const termYears = Math.min(Math.max(Math.floor(terms.termYears), 0), MAX_TERM_YEARS);

  const years: RoiYear[] = [];
  let cumulative = 0;
  let paybackYear: number | null = null;
  for (let year = 1; year <= termYears; year++) {
    const projectedRevenue = terms.projectedAnnualRevenue * Math.pow(growth, year - 1);
    const payout = projectedRevenue * (terms.revenueSharePercent / 100) * poolShare;
    cumulative += payout;
    if (paybackYear === null && pledge > 0 && cumulative >= pledge) paybackYear = year;
    years.push({
      year,
      projectedRevenue: round2(projectedRevenue),
      payout: round2(payout),
      cumulativePayout: round2(cumulative),
    });
  }

  const totalReturn = round2(cumulative);
  const netProfit = round2(cumulative - pledge);
  return {
    pledgeAmount: pledge,
    poolShare,
    years,
    firstYearPayout: years[0]?.payout ?? 0,
    totalReturn,
    netProfit,
    roiPercent: pledge > 0 ? round2((netProfit / pledge) * 100) : 0,
    returnMultiple: pledge > 0 ? round2(cumulative / pledge) : 0,
    paybackYear,
  };
}

export type InvestmentTermsValidation =
  | { ok: true; value: CampaignInvestmentTerms }
  | { ok: false; errors: Partial<Record<keyof CampaignInvestmentTerms, string>> };

const toNumber = (value: unknown): number =>
  typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;

/** Validate creator-supplied terms from an API body or form. */
export function validateInvestmentTerms(input: Record<string, unknown>): InvestmentTermsValidation {
  const errors: Partial<Record<keyof CampaignInvestmentTerms, string>> = {};

  const model = input.model ?? "revenue_share";
  if (!INVESTMENT_MODELS.includes(model as InvestmentModel)) {
    errors.model = `model must be one of ${INVESTMENT_MODELS.join(", ")}`;
  }

  const revenueSharePercent = toNumber(input.revenueSharePercent);
  if (!Number.isFinite(revenueSharePercent) || revenueSharePercent <= 0 || revenueSharePercent > 100) {
    errors.revenueSharePercent = "revenueSharePercent must be greater than 0 and at most 100";
  }

  const projectedAnnualRevenue = toNumber(input.projectedAnnualRevenue);
  if (!Number.isFinite(projectedAnnualRevenue) || projectedAnnualRevenue <= 0) {
    errors.projectedAnnualRevenue = "projectedAnnualRevenue must be a positive number";
  }

  const fundingGoal = toNumber(input.fundingGoal);
  if (!Number.isFinite(fundingGoal) || fundingGoal <= 0) {
    errors.fundingGoal = "fundingGoal must be a positive number";
  }

  const termYears = toNumber(input.termYears);
  if (!Number.isInteger(termYears) || termYears < 1 || termYears > MAX_TERM_YEARS) {
    errors.termYears = `termYears must be a whole number from 1 to ${MAX_TERM_YEARS}`;
  }

  const annualGrowthPercent = input.annualGrowthPercent === undefined || input.annualGrowthPercent === "" ? 0 : toNumber(input.annualGrowthPercent);
  if (!Number.isFinite(annualGrowthPercent) || annualGrowthPercent <= -100 || annualGrowthPercent > 1000) {
    errors.annualGrowthPercent = "annualGrowthPercent must be greater than -100 and at most 1000";
  }

  const currency = typeof input.currency === "string" && input.currency.trim() ? input.currency.trim().toUpperCase() : "USDC";
  if (!/^[A-Z0-9]{1,12}$/.test(currency)) {
    errors.currency = "currency must be a 1–12 character asset code";
  }

  const minPledge = input.minPledge === undefined || input.minPledge === "" ? undefined : toNumber(input.minPledge);
  if (minPledge !== undefined && (!Number.isFinite(minPledge) || minPledge <= 0)) {
    errors.minPledge = "minPledge must be a positive number";
  }
  const maxPledge = input.maxPledge === undefined || input.maxPledge === "" ? undefined : toNumber(input.maxPledge);
  if (maxPledge !== undefined && (!Number.isFinite(maxPledge) || maxPledge <= 0)) {
    errors.maxPledge = "maxPledge must be a positive number";
  } else if (maxPledge !== undefined && minPledge !== undefined && maxPledge < minPledge) {
    errors.maxPledge = "maxPledge must be at least minPledge";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      model: model as InvestmentModel,
      revenueSharePercent,
      projectedAnnualRevenue,
      fundingGoal,
      termYears,
      annualGrowthPercent,
      currency,
      ...(minPledge !== undefined && { minPledge }),
      ...(maxPledge !== undefined && { maxPledge }),
    },
  };
}

/** Slider bounds for the calculator: creator limits, else 1 → the funding goal. */
export function getPledgeSliderRange(terms: CampaignInvestmentTerms): { min: number; max: number; step: number } {
  const min = terms.minPledge ?? 1;
  const max = Math.max(terms.maxPledge ?? terms.fundingGoal, min);
  const span = max - min;
  const magnitude = span > 0 ? Math.pow(10, Math.floor(Math.log10(span)) - 2) : 1;
  return { min, max, step: Math.max(magnitude, 0.01) };
}
