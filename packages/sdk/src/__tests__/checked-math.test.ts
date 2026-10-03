import { describe, it, expect } from 'vitest';
import { CheckedMath } from '../utils/checked-math';

describe('CheckedMath', () => {
  it('validates positive amounts within int128 bounds', () => {
    expect(CheckedMath.validatePositive(100)).toBe(true);
    expect(CheckedMath.validatePositive(0)).toBe(false);
    expect(CheckedMath.validatePositive(-5)).toBe(false);
  });

  it('performs safe addition and detects overflow', () => {
    expect(CheckedMath.add(BigInt(100), BigInt(200))).toBe(BigInt(300));
    expect(() => CheckedMath.add(CheckedMath.MAX_INT128, BigInt(1))).toThrow('Arithmetic overflow');
  });

  it('performs safe subtraction and detects underflow', () => {
    expect(CheckedMath.sub(BigInt(500), BigInt(200))).toBe(BigInt(300));
    expect(() => CheckedMath.sub(BigInt(100), BigInt(200))).toThrow('Arithmetic underflow');
  });

  it('calculates basis points safely without loss', () => {
    expect(CheckedMath.mulBps(BigInt(10000), 500)).toBe(BigInt(500)); // 5%
    expect(CheckedMath.mulBps(BigInt(25000), 100)).toBe(BigInt(250)); // 1%
  });
});
