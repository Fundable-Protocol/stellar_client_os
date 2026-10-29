/**
 * Fixed-point helpers for Stellar asset amounts (7 decimal places).
 *
 * Amounts cross the API as decimal strings and are computed as bigint minor
 * units so premiums, payouts and trade totals never pick up float rounding.
 */

export const AMOUNT_DECIMALS = 7;
const SCALE = 10n ** BigInt(AMOUNT_DECIMALS);
const AMOUNT_PATTERN = /^\d{1,15}(\.\d{1,7})?$/;

export function isAmountString(value: string): boolean {
  return AMOUNT_PATTERN.test(value);
}

/** Parses a non-negative decimal string into minor units. Throws on bad input. */
export function parseAmount(value: string): bigint {
  if (!isAmountString(value)) {
    throw new RangeError(`Invalid amount "${value}"`);
  }
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(AMOUNT_DECIMALS, "0"));
}

/** Formats minor units back into a decimal string without trailing zeros. */
export function formatAmount(units: bigint): string {
  const negative = units < 0n;
  const abs = negative ? -units : units;
  const whole = abs / SCALE;
  const fraction = (abs % SCALE).toString().padStart(AMOUNT_DECIMALS, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

/** `units * bps / 10_000`, rounded down. */
export function applyBps(units: bigint, bps: number): bigint {
  return (units * BigInt(bps)) / 10_000n;
}

/**
 * Multiplies two decimal strings (an amount and a conversion rate) and rounds
 * the product to 7 decimals using bigint minor units, so the quote, pledge and
 * receipt all agree on the converted amount.
 *
 * Both inputs are parsed as minor units; their product is scaled back down by
 * `SCALE` with round-half-up on the discarded remainder.
 */
export function convertAmount(amount: string, rate: string): string {
  const amountUnits = parseAmount(amount);
  const rateUnits = parseAmount(rate);
  const product = amountUnits * rateUnits;
  const quotient = product / SCALE;
  const remainder = product % SCALE;
  const rounded = remainder * 2n >= SCALE ? quotient + 1n : quotient;
  return formatAmount(rounded);
}

/**
 * Formats a conversion rate for display, trimming trailing zeros while
 * keeping at least `minDecimals` (default 2) and at most 7 decimals.
 */
export function formatRate(rate: string, minDecimals = 2): string {
  const units = parseAmount(rate);
  const formatted = formatAmount(units);
  const [whole, fraction = ""] = formatted.split(".");
  const padded = fraction.padEnd(minDecimals, "0").slice(0, AMOUNT_DECIMALS);
  return `${whole}${padded ? `.${padded}` : ""}`;
}