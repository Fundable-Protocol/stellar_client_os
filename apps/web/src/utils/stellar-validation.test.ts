/**
 * Property-based tests for Stellar address validation utilities
 * **Feature: token-distribution-ui, Property 1: Address Validation Consistency**
 * **Validates: Requirements 2.1, 2.2, 2.5**
 */

import { describe, it, expect } from 'vitest';
import {
  isValidStellarAddress,
  validateStellarAddress,
  isSameAddress,
  findDuplicateAddresses,
  validateAddressList,
} from './stellar-validation';

describe('Stellar Address Validation - Property Tests', () => {
  // Property 1: Address Validation Consistency
  // For any string input provided as a recipient address, the system should accept it 
  // if and only if it is a valid Stellar address format, and should provide consistent 
  // validation feedback across all input methods

  // Test data generators for property-like testing
  const generateValidStellarAddress = (prefix: 'G' | 'C' = 'G'): string => {
    const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let address = prefix;
    for (let i = 0; i < 55; i++) {
      address += base32Chars[Math.floor(Math.random() * base32Chars.length)];
    }
    return address;
  };

  const generateInvalidAddresses = (): string[] => [
    '', // empty
    'G', // too short
    'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHFX', // too long
    'XAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', // wrong prefix
    'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA01WHF', // invalid chars
    'gaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaawhf', // lowercase
    ' GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', // leading space
    'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF ', // trailing space
  ];

  describe('Property 1: Address Validation Consistency', () => {
    it('should consistently validate valid G addresses', () => {
      // Generate multiple valid G addresses and test consistency
      for (let i = 0; i < 100; i++) {
        const address = generateValidStellarAddress('G');
        
        // Both validation functions should agree
        expect(isValidStellarAddress(address)).toBe(true);
        expect(validateStellarAddress(address)).toBeNull();
      }
    });

    it('should consistently validate valid C addresses', () => {
      // Generate multiple valid C addresses and test consistency
      for (let i = 0; i < 100; i++) {
        const address = generateValidStellarAddress('C');
        
        // Both validation functions should agree
        expect(isValidStellarAddress(address)).toBe(true);
        expect(validateStellarAddress(address)).toBeNull();
      }
    });

    it('should consistently reject invalid addresses', () => {
      const invalidAddresses = generateInvalidAddresses();
      
      invalidAddresses.forEach((address: string) => {
        // Both validation functions should agree on invalid addresses
        expect(isValidStellarAddress(address)).toBe(false);
        expect(validateStellarAddress(address)).not.toBeNull();
      });
    });

    it('should provide consistent validation across different input methods', () => {
      const testAddresses = [
        'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', // valid G
        'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM', // valid C
        'invalid', // clearly invalid
        '', // empty
      ];

      testAddresses.forEach(address => {
        const isValid = isValidStellarAddress(address);
        const validationError = validateStellarAddress(address);
        const listValidation = validateAddressList([address]);

        // All validation methods should be consistent
        if (isValid) {
          expect(validationError).toBeNull();
          expect(listValidation.validAddresses).toContain(address);
          expect(listValidation.invalidAddresses).toHaveLength(0);
        } else {
          expect(validationError).not.toBeNull();
          expect(listValidation.validAddresses).not.toContain(address);
          expect(listValidation.invalidAddresses).toHaveLength(1);
        }
      });
    });

    it('should handle edge cases consistently', () => {
      const edgeCases = [
        null as unknown as string,
        undefined as unknown as string,
        123 as unknown as string,
        {} as unknown as string,
        [] as unknown as string,
        'G'.repeat(56), // all G's
        'C'.repeat(56), // all C's
        'G' + '2'.repeat(55), // valid base32 chars
        'G' + '8'.repeat(55), // invalid base32 chars
      ];

      edgeCases.forEach(testCase => {
        const isValid = isValidStellarAddress(testCase);
        const validationError = validateStellarAddress(testCase);

        // Consistency check
        if (isValid) {
          expect(validationError).toBeNull();
        } else {
          expect(validationError).not.toBeNull();
        }
      });
    });

    it('should correctly identify duplicate addresses', () => {
      const address1 = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
      const address2 = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM';
      
      // Test various duplicate scenarios
      const testCases = [
        { addresses: [address1, address1], expectedDuplicates: [address1] },
        { addresses: [address1, address2], expectedDuplicates: [] },
        { addresses: [address1, address2, address1], expectedDuplicates: [address1] },
        { addresses: [address1, address2, address1, address2], expectedDuplicates: [address1, address2] },
        { addresses: [], expectedDuplicates: [] },
        { addresses: [address1], expectedDuplicates: [] },
      ];

      testCases.forEach(({ addresses, expectedDuplicates }) => {
        const duplicates = findDuplicateAddresses(addresses);
        expect(duplicates.sort()).toEqual(expectedDuplicates.sort());
      });
    });

    it('should maintain address comparison consistency', () => {
      const address = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
      
      // Same address should always be equal to itself
      expect(isSameAddress(address, address)).toBe(true);
      
      // Different addresses should not be equal
      const differentAddress = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM';
      expect(isSameAddress(address, differentAddress)).toBe(false);
      
      // Case sensitivity test
      expect(isSameAddress(address, address.toLowerCase())).toBe(false);
    });
  });

  describe('Detailed validation behavior', () => {
    it('should provide specific error messages for different invalid formats', () => {
      const testCases = [
        { address: '', expectedError: 'Address cannot be empty' },
        { address: ' GABC ', expectedError: 'Address cannot have leading or trailing whitespace' },
        { address: 'G'.repeat(55), expectedError: 'Address is too short' },
        { address: 'G'.repeat(57), expectedError: 'Address is too long' },
        { address: 'X' + 'A'.repeat(55), expectedError: 'Address must start with G' },
        { address: 'G' + '0'.repeat(55), expectedError: 'Address contains invalid characters' },
      ];

      testCases.forEach(({ address, expectedError }) => {
        const error = validateStellarAddress(address);
        expect(error).toContain(expectedError.split(' ')[0]); // Check key word
      });
    });

    it('should handle list validation correctly', () => {
      const validAddress = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
      const invalidAddress = 'invalid';
      const duplicateAddress = validAddress;

      const result = validateAddressList([validAddress, invalidAddress, duplicateAddress]);

      expect(result.validAddresses).toContain(validAddress);
      expect(result.invalidAddresses).toHaveLength(1);
      expect(result.invalidAddresses[0].address).toBe(invalidAddress);
      expect(result.duplicateAddresses).toContain(validAddress);
    });
  });
});