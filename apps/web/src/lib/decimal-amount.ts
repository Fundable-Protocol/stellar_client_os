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
