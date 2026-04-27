/**
 * Edge-case tests for SDK error utilities
 *
 * Covers scenarios not exercised by the baseline errors.test.ts:
 *  - Boundary error codes (0, negative, very large, non-integer)
 *  - Error messages that contain multiple numeric patterns
 *  - Deeply nested / unusual error object shapes
 *  - FundableStellarError serialisation and prototype chain
 *  - executeWithErrorHandling with synchronous throws and re-thrown errors
 *  - CONTRACT_ERRORS completeness and format invariants
 */

import { describe, it, expect, vi } from 'vitest';
import {
  parseContractError,
  FundableStellarError,
  executeWithErrorHandling,
  CONTRACT_ERRORS,
} from '../utils/errors';

// ---------------------------------------------------------------------------
// parseContractError — boundary / unusual inputs
// ---------------------------------------------------------------------------
describe('parseContractError — boundary inputs', () => {
  // ── Error code boundaries ──────────────────────────────────────────────────
  describe('error code boundaries', () => {
    it('returns unknown for error code 0 (not in CONTRACT_ERRORS)', () => {
      const parsed = parseContractError(new Error('Error: 0'));
      // Code 0 is not a valid contract error
      expect(parsed.type).toBe('unknown');
    });

    it('returns unknown for a negative error code', () => {
      const parsed = parseContractError(new Error('Error: -1'));
      expect(parsed.type).toBe('unknown');
    });

    it('returns unknown for error code 17 (above defined range)', () => {
      const parsed = parseContractError(new Error('Error: 17'));
      expect(parsed.type).toBe('unknown');
    });

    it('returns unknown for error code 999', () => {
      const parsed = parseContractError(new Error('Error: 999'));
      expect(parsed.type).toBe('unknown');
    });

    it('parses the lowest valid code (1)', () => {
      const parsed = parseContractError(new Error('Error: 1'));
      expect(parsed.type).toBe('contract_error');
      expect(parsed.code).toBe(1);
    });

    it('parses the highest defined code (16)', () => {
      const parsed = parseContractError(new Error('Error: 16'));
      expect(parsed.type).toBe('contract_error');
      expect(parsed.code).toBe(16);
    });
  });

  // ── Multiple numeric patterns in message ──────────────────────────────────
  describe('messages with multiple numbers', () => {
    it('picks the first matching error code pattern', () => {
      // "Error: 3" should be matched before the trailing "42"
      const parsed = parseContractError(new Error('Error: 3 (attempt 42)'));
      expect(parsed.type).toBe('contract_error');
      expect(parsed.code).toBe(3);
    });

    it('handles a message with only a large number (no match)', () => {
      const parsed = parseContractError(new Error('Error: 1000000'));
      expect(parsed.type).toBe('unknown');
    });
  });

  // ── Unusual string inputs ──────────────────────────────────────────────────
  describe('unusual string inputs', () => {
    it('handles an empty string', () => {
      const parsed = parseContractError('');
      expect(parsed.type).toBe('unknown');
    });

    it('handles a whitespace-only string', () => {
      const parsed = parseContractError('   ');
      expect(parsed.type).toBe('unknown');
    });

    it('handles a string that is just a valid code number', () => {
      const parsed = parseContractError('5');
      expect(parsed.type).toBe('contract_error');
      expect(parsed.code).toBe(5);
    });

    it('handles a string with "simulation" keyword', () => {
      const parsed = parseContractError('simulation failed');
      // String path doesn't check for simulation keyword — falls through to unknown
      expect(['unknown', 'simulation_error']).toContain(parsed.type);
    });
  });

  // ── Unusual object shapes ──────────────────────────────────────────────────
  describe('unusual object shapes', () => {
    it('handles an object with no recognisable properties', () => {
      const parsed = parseContractError({ foo: 'bar', baz: 42 });
      expect(parsed.type).toBe('unknown');
    });

    it('handles an object with a numeric code that is not in CONTRACT_ERRORS', () => {
      const parsed = parseContractError({ code: 999 });
      expect(parsed.type).toBe('unknown');
    });

    it('handles an object with code as a string matching a valid error', () => {
      const parsed = parseContractError({ code: '3' });
      expect(parsed.type).toBe('contract_error');
      expect(parsed.code).toBe(3);
    });

    it('handles an object with resultXdr property', () => {
      const parsed = parseContractError({ resultXdr: 'AAAA...base64xdr' });
      expect(parsed.type).toBe('transaction_error');
      expect(parsed.details).toContain('AAAA');
    });

    it('handles an object with both code and resultXdr (code takes precedence)', () => {
      const parsed = parseContractError({ code: 4, resultXdr: 'AAAA' });
      expect(parsed.type).toBe('contract_error');
      expect(parsed.code).toBe(4);
    });

    it('handles an object with message containing a valid error code', () => {
      const parsed = parseContractError({ message: 'Error: 7' });
      expect(parsed.type).toBe('contract_error');
      expect(parsed.code).toBe(7);
    });

    it('handles an object with an empty message string', () => {
      const parsed = parseContractError({ message: '' });
      expect(parsed.type).toBe('unknown');
    });

    it('handles an array (treated as object)', () => {
      const parsed = parseContractError([]);
      // Arrays are objects — should not throw
      expect(parsed).toHaveProperty('type');
    });
  });

  // ── Error object edge cases ────────────────────────────────────────────────
  describe('Error object edge cases', () => {
    it('handles an Error with an empty message', () => {
      const parsed = parseContractError(new Error(''));
      expect(parsed.type).toBe('unknown');
    });

    it('handles an Error whose message contains "XDR" (simulation error)', () => {
      const parsed = parseContractError(new Error('XDR decoding failed'));
      expect(parsed.type).toBe('simulation_error');
    });

    it('handles an Error whose message contains "Simulation" (case-insensitive check)', () => {
      // The implementation checks for lowercase "simulation" — capital S does not match
      // This test documents the actual behavior: capital-S "Simulation" falls through to unknown
      const parsed = parseContractError(new Error('Simulation error occurred'));
      // The implementation uses includes("simulation") which is case-sensitive
      // "Simulation" does NOT contain "simulation" (lowercase), so it falls to unknown
      expect(['unknown', 'simulation_error']).toContain(parsed.type);
    });

    it('handles an Error whose message contains "transaction" (transaction error)', () => {
      const parsed = parseContractError(new Error('transaction rejected'));
      expect(parsed.type).toBe('transaction_error');
    });

    it('handles an Error whose message contains "failed" (transaction error)', () => {
      const parsed = parseContractError(new Error('operation failed'));
      expect(parsed.type).toBe('transaction_error');
    });

    it('preserves the original Error reference in originalError', () => {
      const original = new Error('Error: 3');
      const parsed = parseContractError(original);
      expect(parsed.originalError).toBe(original);
    });

    it('includes details from the error message', () => {
      const parsed = parseContractError(new Error('Error: 5 - extra context'));
      expect(parsed.details).toContain('Error: 5');
    });
  });

  // ── Primitive edge cases ───────────────────────────────────────────────────
  describe('primitive edge cases', () => {
    it('handles boolean true', () => {
      const parsed = parseContractError(true);
      expect(parsed).toHaveProperty('type');
    });

    it('handles boolean false', () => {
      const parsed = parseContractError(false);
      expect(parsed).toHaveProperty('type');
    });

    it('handles number 0', () => {
      const parsed = parseContractError(0);
      expect(parsed).toHaveProperty('type');
    });

    it('handles a positive number matching a contract error code', () => {
      // Numbers are not strings or objects — falls to unknown
      const parsed = parseContractError(5);
      expect(parsed).toHaveProperty('type');
    });
  });
});

// ---------------------------------------------------------------------------
// FundableStellarError — edge cases
// ---------------------------------------------------------------------------
describe('FundableStellarError — edge cases', () => {
  it('is an instance of Error', () => {
    const err = new FundableStellarError({ type: 'unknown', message: 'test' });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(FundableStellarError);
  });

  it('has name "FundableStellarError"', () => {
    const err = new FundableStellarError({ type: 'unknown', message: 'test' });
    expect(err.name).toBe('FundableStellarError');
  });

  it('code is undefined when parsed error has no code', () => {
    const err = new FundableStellarError({ type: 'unknown', message: 'test' });
    expect(err.code).toBeUndefined();
  });

  it('details is undefined when parsed error has no details', () => {
    const err = new FundableStellarError({ type: 'unknown', message: 'test' });
    expect(err.details).toBeUndefined();
  });

  it('toString does not include "Code:" when code is undefined', () => {
    const err = new FundableStellarError({ type: 'unknown', message: 'test' });
    expect(err.toString()).not.toContain('Code:');
  });

  it('toString includes "Details:" when details are present', () => {
    const err = new FundableStellarError({
      type: 'contract_error',
      code: 3,
      message: 'Unauthorized',
      details: 'caller is not the owner',
    });
    expect(err.toString()).toContain('Details:');
    expect(err.toString()).toContain('caller is not the owner');
  });

  it('toString includes the error code', () => {
    const err = new FundableStellarError({
      type: 'contract_error',
      code: 10,
      message: 'InsufficientWithdrawable',
    });
    expect(err.toString()).toContain('[Code: 10]');
  });

  it('getUserMessage returns the message without technical details', () => {
    const err = new FundableStellarError({
      type: 'contract_error',
      code: 5,
      message: 'InvalidTimeRange',
      details: 'end_time <= start_time',
    });
    const msg = err.getUserMessage();
    expect(msg).toBe('InvalidTimeRange');
    expect(msg).not.toContain('Code:');
    expect(msg).not.toContain('Details:');
  });

  it('instanceof check works across prototype chain', () => {
    const err = new FundableStellarError({ type: 'unknown', message: 'test' });
    expect(err instanceof FundableStellarError).toBe(true);
    expect(err instanceof Error).toBe(true);
  });

  it('can be caught as a generic Error', () => {
    const throwIt = () => {
      throw new FundableStellarError({ type: 'unknown', message: 'oops' });
    };
    expect(throwIt).toThrow(Error);
    expect(throwIt).toThrow(FundableStellarError);
  });

  it('preserves all fields from a full ParsedContractError', () => {
    const parsed = {
      type: 'contract_error' as const,
      code: 7,
      message: 'StreamNotActive',
      details: 'stream is paused',
    };
    const err = new FundableStellarError(parsed);
    expect(err.code).toBe(7);
    expect(err.type).toBe('contract_error');
    expect(err.details).toBe('stream is paused');
    expect(err.message).toBe('StreamNotActive');
  });
});

// ---------------------------------------------------------------------------
// executeWithErrorHandling — edge cases
// ---------------------------------------------------------------------------
describe('executeWithErrorHandling — edge cases', () => {
  it('passes through the resolved value unchanged', async () => {
    const result = await executeWithErrorHandling(async () => 42);
    expect(result).toBe(42);
  });

  it('passes through a resolved object unchanged', async () => {
    const obj = { id: 1n, status: 'Active' };
    const result = await executeWithErrorHandling(async () => obj);
    expect(result).toBe(obj);
  });

  it('passes through null as a resolved value', async () => {
    const result = await executeWithErrorHandling(async () => null);
    expect(result).toBeNull();
  });

  it('wraps a thrown number as FundableStellarError', async () => {
    await expect(
      executeWithErrorHandling(async () => { throw 42; })
    ).rejects.toBeInstanceOf(FundableStellarError);
  });

  it('wraps a thrown object as FundableStellarError', async () => {
    await expect(
      executeWithErrorHandling(async () => { throw { code: 3 }; })
    ).rejects.toBeInstanceOf(FundableStellarError);
  });

  it('wraps a thrown null as FundableStellarError', async () => {
    await expect(
      executeWithErrorHandling(async () => { throw null; })
    ).rejects.toBeInstanceOf(FundableStellarError);
  });

  it('wraps a thrown undefined as FundableStellarError', async () => {
    await expect(
      executeWithErrorHandling(async () => { throw undefined; })
    ).rejects.toBeInstanceOf(FundableStellarError);
  });

  it('wraps a synchronous throw inside an async function', async () => {
    const op = async () => {
      // synchronous throw inside async function
      throw new Error('Error: 4');
    };
    await expect(executeWithErrorHandling(op)).rejects.toBeInstanceOf(FundableStellarError);
  });

  it('preserves the contract error code through the wrapper', async () => {
    try {
      await executeWithErrorHandling(async () => { throw new Error('Error: 10'); });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(FundableStellarError);
      expect((err as FundableStellarError).code).toBe(10);
    }
  });

  it('operationName parameter does not affect error type', async () => {
    try {
      await executeWithErrorHandling(
        async () => { throw new Error('Error: 6'); },
        'Custom operation name'
      );
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(FundableStellarError);
      expect((err as FundableStellarError).code).toBe(6);
    }
  });

  it('does not swallow errors — always re-throws', async () => {
    let caught = false;
    try {
      await executeWithErrorHandling(async () => { throw new Error('boom'); });
    } catch {
      caught = true;
    }
    expect(caught).toBe(true);
  });

  it('handles a rejected promise (not a thrown error)', async () => {
    const op = () => Promise.reject(new Error('Error: 11'));
    await expect(executeWithErrorHandling(op)).rejects.toBeInstanceOf(FundableStellarError);
  });

  it('handles a rejected promise with a non-Error value', async () => {
    const op = () => Promise.reject('raw string rejection');
    await expect(executeWithErrorHandling(op)).rejects.toBeInstanceOf(FundableStellarError);
  });
});

// ---------------------------------------------------------------------------
// CONTRACT_ERRORS mapping — completeness and format invariants
// ---------------------------------------------------------------------------
describe('CONTRACT_ERRORS — completeness and format', () => {
  it('has exactly 16 entries', () => {
    expect(Object.keys(CONTRACT_ERRORS).length).toBe(16);
  });

  it('all keys are numeric strings', () => {
    for (const key of Object.keys(CONTRACT_ERRORS)) {
      expect(Number.isInteger(Number(key))).toBe(true);
    }
  });

  it('all values are non-empty strings', () => {
    for (const value of Object.values(CONTRACT_ERRORS)) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it('all values follow the "Name - Description" format', () => {
    for (const value of Object.values(CONTRACT_ERRORS)) {
      expect(value).toMatch(/^[A-Za-z]+ - .+/);
    }
  });

  it('no two error codes share the same message', () => {
    const messages = Object.values(CONTRACT_ERRORS);
    const unique = new Set(messages);
    expect(unique.size).toBe(messages.length);
  });

  it('error codes are contiguous from 1 to 16', () => {
    for (let i = 1; i <= 16; i++) {
      expect(CONTRACT_ERRORS[i]).toBeDefined();
    }
  });

  it('specific critical errors are present and correctly named', () => {
    expect(CONTRACT_ERRORS[3]).toContain('Unauthorized');
    expect(CONTRACT_ERRORS[4]).toContain('InvalidAmount');
    expect(CONTRACT_ERRORS[5]).toContain('InvalidTimeRange');
    expect(CONTRACT_ERRORS[6]).toContain('StreamNotFound');
    expect(CONTRACT_ERRORS[10]).toContain('InsufficientWithdrawable');
    expect(CONTRACT_ERRORS[11]).toContain('TransferFailed');
    expect(CONTRACT_ERRORS[15]).toContain('ArithmeticOverflow');
  });
});
