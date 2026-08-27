// Centralized fee configuration for offramp operations
// Extracted to its own module to avoid circular dependency between
// offramp.service.ts (imports from offramp.mock.ts) and offramp.mock.ts
// (needs fee calculation helpers).
//
// Ensures fee calculation is consistent across quote preview and actual creation.
// The fee is a percentage of the fiat-equivalent amount.

/** The fee rate applied to offramp operations. 1.0% fee. */
export const OFFRAMP_FEE_RATE = 0.01;

/**
 * Calculate the fee amount in fiat currency for a given offramp operation.
 * @param amount - The crypto amount being offramped
 * @param rate - The exchange rate (fiat per crypto)
 * @returns The fee amount in fiat currency
 */
export function calculateOfframpFee(amount: number, rate: number): number {
    return amount * rate * OFFRAMP_FEE_RATE;
}

/**
 * Calculate the fiat amount the user will receive after fees.
 * @param amount - The crypto amount being offramped
 * @param rate - The exchange rate (fiat per crypto)
 * @returns The fiat amount after fee deduction
 */
export function calculateOfframpFiatAmount(amount: number, rate: number): number {
    return amount * rate * (1 - OFFRAMP_FEE_RATE);
}
