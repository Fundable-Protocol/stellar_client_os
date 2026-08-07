/**
 * Tests for token symbol resolution
 * **Issue #426: Resolve contract addresses to friendly ticker symbols**
 * **Validates: getTokenSymbol maps contract IDs to human-readable asset symbols**
 */

import { describe, it, expect } from 'vitest';
import { getTokenSymbol, SUPPORTED_TOKENS } from '../validations';

// Collect known values and addresses for parameterized tests
const knownTokenValues = SUPPORTED_TOKENS.map((t) => t.value);
const knownTokenAddresses = SUPPORTED_TOKENS.map((t) => t.address);

describe('getTokenSymbol', () => {
  // --- Success path: resolve by value ---

  it('should resolve "USDC" by value', () => {
    expect(getTokenSymbol('USDC')).toBe('USDC');
  });

  it('should resolve "XLM" by value', () => {
    expect(getTokenSymbol('XLM')).toBe('XLM');
  });

  it('should resolve "AQUA" by value', () => {
    expect(getTokenSymbol('AQUA')).toBe('AQUA');
  });

  it('should resolve all known token values to themselves', () => {
    for (const value of knownTokenValues) {
      expect(getTokenSymbol(value)).toBe(value);
    }
  });

  // --- Success path: resolve by contract address ---

  it('should resolve USDC contract address to "USDC"', () => {
    expect(
      getTokenSymbol(
        'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',
      ),
    ).toBe('USDC');
  });

  it('should resolve XLM native address to "XLM"', () => {
    expect(getTokenSymbol('native')).toBe('XLM');
  });

  it('should resolve AQUA contract address to "AQUA"', () => {
    expect(
      getTokenSymbol(
        'CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSDF4Y',
      ),
    ).toBe('AQUA');
  });

  it('should resolve all known contract addresses to their ticker symbols', () => {
    const expected = ['USDC', 'XLM', 'AQUA'];
    for (let i = 0; i < knownTokenAddresses.length; i++) {
      expect(getTokenSymbol(knownTokenAddresses[i])).toBe(expected[i]);
    }
  });

  // --- Fallback / edge cases ---

  it('should return the input unchanged for an unrecognised token value', () => {
    expect(getTokenSymbol('ETH')).toBe('ETH');
    expect(getTokenSymbol('BTC')).toBe('BTC');
    expect(getTokenSymbol('SOL')).toBe('SOL');
  });

  it('should return the input unchanged for a random string', () => {
    expect(getTokenSymbol('SomeRandomTokenName')).toBe(
      'SomeRandomTokenName',
    );
  });

  it('should return empty string when given an empty string', () => {
    expect(getTokenSymbol('')).toBe('');
  });

  it('should handle whitespace values (no trimming — exact match)', () => {
    // Whitespace doesn't match any known value, so it falls through
    expect(getTokenSymbol(' USDC')).toBe(' USDC');
    expect(getTokenSymbol('USDC ')).toBe('USDC ');
  });

  it('should be case-sensitive: lowercase values do not match', () => {
    // SUPPORTED_TOKENS stores uppercase values
    expect(getTokenSymbol('usdc')).toBe('usdc');
    expect(getTokenSymbol('usdc')).not.toBe('USDC');
  });

  it('should be case-sensitive: lowercase addresses do not match', () => {
    const usdcAddr = 'cBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA'.toLowerCase();
    expect(getTokenSymbol(usdcAddr)).toBe(usdcAddr);
  });

  // --- Consistency properties ---

  it('should be consistent: resolving a symbol twice gives the same result', () => {
    for (const value of knownTokenValues) {
      expect(getTokenSymbol(value)).toBe(getTokenSymbol(value));
    }
    for (const address of knownTokenAddresses) {
      expect(getTokenSymbol(address)).toBe(getTokenSymbol(address));
    }
  });

  it('should produce the same output for a value and its matching address', () => {
    for (const token of SUPPORTED_TOKENS) {
      const byValue = getTokenSymbol(token.value);
      const byAddress = getTokenSymbol(token.address);
      expect(byValue).toBe(byAddress);
    }
  });
});
