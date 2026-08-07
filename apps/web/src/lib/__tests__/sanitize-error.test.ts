import { describe, it, expect } from 'vitest';
import {
  sanitizeErrorString,
  sanitizeObject,
  sanitizeError,
  STELLAR_PUBLIC_KEY_PATTERN,
  STELLAR_SECRET_KEY_PATTERN,
} from '../sanitize-error';

describe('sanitize-error', () => {
  const validPublicKey = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFGHIJKLMN';
  const validSecretKey = 'SABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFGHIJKLMN';
  const truncatedKey = 'GABC...KLMN';

  describe('sanitizeErrorString', () => {
    it('should mask full public keys', () => {
      const input = `Error with account ${validPublicKey}`;
      const result = sanitizeErrorString(input);
      expect(result).toBe('Error with account [PUBLIC_KEY_REDACTED]');
    });

    it('should mask secret keys completely', () => {
      const input = `Secret key: ${validSecretKey}`;
      const result = sanitizeErrorString(input);
      expect(result).toBe('Secret key: [SECRET_KEY_REDACTED]');
    });

    it('should mask truncated public keys', () => {
      const input = `Account ${truncatedKey} had an error`;
      const result = sanitizeErrorString(input);
      expect(result).toBe('Account [PUBLIC_KEY_REDACTED] had an error');
    });

    it('should handle multiple keys in one string', () => {
      const input = `Sender ${validPublicKey} and recipient ${validPublicKey}`;
      const result = sanitizeErrorString(input);
      expect(result).toBe('Sender [PUBLIC_KEY_REDACTED] and recipient [PUBLIC_KEY_REDACTED]');
    });

    it('should keep first 4 and last 5 chars when maskFullKey is false', () => {
      const input = `Error with account ${validPublicKey}`;
      const result = sanitizeErrorString(input, { maskFullKey: false });
      const expectedStart = validPublicKey.slice(0, 4);
      const expectedEnd = validPublicKey.slice(-5);
      expect(result).toBe(`Error with account ${expectedStart}...${expectedEnd}`);
    });

    it('should use custom replacement string', () => {
      const input = `Error with account ${validPublicKey}`;
      const result = sanitizeErrorString(input, { replacement: '[KEY_HIDDEN]' });
      expect(result).toBe('Error with account [KEY_HIDDEN]');
    });

    it('should handle non-string inputs gracefully', () => {
      expect(sanitizeErrorString(null as unknown as string)).toBe(null);
      expect(sanitizeErrorString(undefined as unknown as string)).toBe(undefined);
      expect(sanitizeErrorString(123 as unknown as string)).toBe(123);
    });
  });

  describe('sanitizeObject', () => {
    it('should sanitize string values in objects', () => {
      const obj = {
        message: `Error with account ${validPublicKey}`,
        data: {
          address: validPublicKey,
          nested: {
            key: `Secret: ${validSecretKey}`,
          },
        },
        array: [`Account ${validPublicKey}`, `Another ${validPublicKey}`],
      };

      const result = sanitizeObject(obj);
      expect(result.message).toBe('Error with account [PUBLIC_KEY_REDACTED]');
      expect(result.data.address).toBe('[PUBLIC_KEY_REDACTED]');
      expect(result.data.nested.key).toBe('Secret: [SECRET_KEY_REDACTED]');
      expect(result.array[0]).toBe('Account [PUBLIC_KEY_REDACTED]');
      expect(result.array[1]).toBe('Another [PUBLIC_KEY_REDACTED]');
    });

    it('should preserve non-string values', () => {
      const obj = {
        number: 123,
        boolean: true,
        null: null,
        undefined: undefined,
        timestamp: new Date(),
      };

      const result = sanitizeObject(obj);
      expect(result.number).toBe(123);
      expect(result.boolean).toBe(true);
      expect(result.null).toBe(null);
      expect(result.undefined).toBe(undefined);
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should not sanitize object keys', () => {
      const obj = {
        [validPublicKey]: 'some value',
      };

      const result = sanitizeObject(obj);
      // Keys should remain unchanged
      expect(Object.keys(result)[0]).toBe(validPublicKey);
      // Values should be sanitized
      expect(result[validPublicKey]).toBe('some value');
    });
  });

  describe('sanitizeError', () => {
    it('should sanitize error message and stack', () => {
      const error = new Error(`Error with account ${validPublicKey}`);
      error.stack = `Error with account ${validPublicKey}\n    at someFunction`;
      error.name = 'CustomError';

      const result = sanitizeError(error);
      expect(result.message).toBe('Error with account [PUBLIC_KEY_REDACTED]');
      expect(result.stack).toBe('Error with account [PUBLIC_KEY_REDACTED]\n    at someFunction');
      expect(result.name).toBe('CustomError');
    });

    it('should sanitize custom error properties', () => {
      type ErrorWithProps = Error & Record<string, unknown>;

      const error = new Error('Something went wrong') as ErrorWithProps;
      error.address = validPublicKey;
      error.details = { user: validPublicKey, context: 'test' };

      const result = sanitizeError(error) as ErrorWithProps;
      expect(result.address).toBe('[PUBLIC_KEY_REDACTED]');
      expect((result.details as Record<string, unknown>).user).toBe('[PUBLIC_KEY_REDACTED]');
      expect((result.details as Record<string, unknown>).context).toBe('test');
    });

    it('should handle error without stack', () => {
      const error = new Error(`Error with account ${validPublicKey}`);
      delete error.stack;

      const result = sanitizeError(error);
      expect(result.message).toBe('Error with account [PUBLIC_KEY_REDACTED]');
      expect(result.stack).toBeUndefined();
    });
  });

  describe('Regex patterns', () => {
    it('should match valid Stellar public keys', () => {
      const key = validPublicKey;
      expect(STELLAR_PUBLIC_KEY_PATTERN.test(key)).toBe(true);
      // Reset regex state
      STELLAR_PUBLIC_KEY_PATTERN.lastIndex = 0;
      
      // Should not match invalid keys
      expect(STELLAR_PUBLIC_KEY_PATTERN.test('G123')).toBe(false);
      STELLAR_PUBLIC_KEY_PATTERN.lastIndex = 0;
      expect(STELLAR_PUBLIC_KEY_PATTERN.test('invalid')).toBe(false);
    });

    it('should match Stellar secret keys', () => {
      const key = validSecretKey;
      expect(STELLAR_SECRET_KEY_PATTERN.test(key)).toBe(true);
      STELLAR_SECRET_KEY_PATTERN.lastIndex = 0;
      
      expect(STELLAR_SECRET_KEY_PATTERN.test('S123')).toBe(false);
    });
  });
});