/**
 * Checked Math Library for Financial Calculations
 *
 * Implements audited overflow-safe arithmetic for campaign financial calculations (Issue #850).
 */

export class CheckedMath {
  static readonly MAX_UINT256 = (BigInt(1) << BigInt(256)) - BigInt(1);
  static readonly MAX_INT128 = (BigInt(1) << BigInt(127)) - BigInt(1);

  static validatePositive(amount: bigint | number): boolean {
    const val = BigInt(amount);
    return val > BigInt(0) && val <= this.MAX_INT128;
  }

  static add(a: bigint, b: bigint): bigint {
    const res = a + b;
    if (res > this.MAX_INT128) {
      throw new Error('Arithmetic overflow in addition');
    }
    return res;
  }

  static sub(a: bigint, b: bigint): bigint {
    if (b > a) {
      throw new Error('Arithmetic underflow in subtraction');
    }
    return a - b;
  }

  static mul(a: bigint, b: bigint): bigint {
    const res = a * b;
    if (res > this.MAX_INT128) {
      throw new Error('Arithmetic overflow in multiplication');
    }
    return res;
  }

  static div(a: bigint, b: bigint): bigint {
    if (b === BigInt(0)) {
      throw new Error('Division by zero');
    }
    return a / b;
  }

  static mulBps(amount: bigint, bps: number): bigint {
    if (bps < 0 || bps > 10000) {
      throw new Error('Basis points must be between 0 and 10000');
    }
    const numerator = amount * BigInt(bps);
    return numerator / BigInt(10000);
  }
}
