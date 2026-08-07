/**
 * Property-based tests for distribution state management hook
 * **Feature: token-distribution-ui, Property 2: Distribution Type State Preservation**
 * **Feature: token-distribution-ui, Property 11: Session Data Persistence**
 * **Validates: Requirements 1.4, 1.5, 7.1, 7.2, 7.4**
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDistributionState } from './use-distribution-state';
import type { Recipient } from '@/types/distribution';

// Mock sessionStorage
const mockSessionStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

Object.defineProperty(window, 'sessionStorage', {
  value: mockSessionStorage,
});

describe('Distribution State Management - Property Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionStorage.getItem.mockReturnValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Property 2: Distribution Type State Preservation
  // For any sequence of distribution type changes, switching types should preserve 
  // all recipient addresses while clearing amount-specific data, and the selected 
  // type should persist throughout the session

  describe('Property 2: Distribution Type State Preservation', () => {
    it('should preserve recipient addresses when switching distribution types', () => {
      const { result } = renderHook(() => useDistributionState());

      // Add some recipients
      const testAddresses = [
        'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
        'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM',
      ];

      act(() => {
        result.current.addRecipient(testAddresses[0]);
        result.current.addRecipient(testAddresses[1]);
      });

      // Switch from equal to weighted
      act(() => {
        result.current.updateType('weighted');
      });

      // Addresses should be preserved
      expect(result.current.state.recipients).toHaveLength(2);
      expect(result.current.state.recipients[0].address).toBe(testAddresses[0]);
      expect(result.current.state.recipients[1].address).toBe(testAddresses[1]);
      expect(result.current.state.type).toBe('weighted');

      // Switch back to equal
      act(() => {
        result.current.updateType('equal');
      });

      // Addresses should still be preserved
      expect(result.current.state.recipients).toHaveLength(2);
      expect(result.current.state.recipients[0].address).toBe(testAddresses[0]);
      expect(result.current.state.recipients[1].address).toBe(testAddresses[1]);
      expect(result.current.state.type).toBe('equal');
    });

    it('should clear amount data when switching from weighted to equal', () => {
      const { result } = renderHook(() => useDistributionState());

      // Start with weighted distribution
      act(() => {
        result.current.updateType('weighted');
        result.current.addRecipient('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', '100');
      });

      expect(result.current.state.recipients[0].amount).toBe('100');

      // Switch to equal
      act(() => {
        result.current.updateType('equal');
      });

      // Amount should be cleared (undefined for equal distribution)
      expect(result.current.state.recipients[0].amount).toBeUndefined();
    });

    it('should handle multiple type switches correctly', () => {
      const { result } = renderHook(() => useDistributionState());

      const testAddress = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

      // Add recipient in equal mode
      act(() => {
        result.current.addRecipient(testAddress);
        result.current.setTotalAmount('1000');
      });

      // Switch to weighted
      act(() => {
        result.current.updateType('weighted');
      });

      expect(result.current.state.type).toBe('weighted');
      expect(result.current.state.recipients[0].address).toBe(testAddress);
      expect(result.current.state.totalAmount).toBe(''); // Should be cleared

      // Switch back to equal
      act(() => {
        result.current.updateType('equal');
      });

      expect(result.current.state.type).toBe('equal');
      expect(result.current.state.recipients[0].address).toBe(testAddress);

      // Switch to weighted again
      act(() => {
        result.current.updateType('weighted');
      });

      expect(result.current.state.type).toBe('weighted');
      expect(result.current.state.recipients[0].address).toBe(testAddress);
    });
  });

  // Property 11: Session Data Persistence
  // For any user data entered during a session (recipients, amounts, distribution type), 
  // the data should persist across navigation, browser refresh, and return visits until 
  // explicitly cleared or a transaction completes successfully

  describe('Property 11: Session Data Persistence', () => {
    it('should persist state to session storage on changes', () => {
      const { result } = renderHook(() => useDistributionState());

      act(() => {
        result.current.updateType('weighted');
        result.current.addRecipient('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', '100');
        result.current.setTotalAmount('500');
      });

      // Should have called setItem to persist state
      expect(mockSessionStorage.setItem).toHaveBeenCalledWith(
        'distribution-state',
        expect.stringContaining('weighted')
      );
    });

    it('should restore state from session storage on initialization', () => {
      const storedState = {
        type: 'weighted',
        recipients: [{
          id: 'test-id',
          address: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
          amount: '100',
          isValid: true,
        }],
        totalAmount: '',
        isValid: true,
        errors: [],
      };

      mockSessionStorage.getItem.mockReturnValue(JSON.stringify(storedState));

      const { result } = renderHook(() => useDistributionState());

      expect(result.current.state.type).toBe('weighted');
      expect(result.current.state.recipients).toHaveLength(1);
      expect(result.current.state.recipients[0].address).toBe('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF');
      expect(result.current.state.recipients[0].amount).toBe('100');
    });

    it('should handle corrupted session storage gracefully', () => {
      mockSessionStorage.getItem.mockReturnValue('invalid json');

      const { result } = renderHook(() => useDistributionState());

      // Should fall back to initial state
      expect(result.current.state.type).toBe('equal');
      expect(result.current.state.recipients).toHaveLength(0);
      expect(result.current.state.totalAmount).toBe('');
    });

    it('should clear session storage on reset', () => {
      const { result } = renderHook(() => useDistributionState());

      act(() => {
        result.current.addRecipient('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF');
        result.current.reset();
      });

      expect(mockSessionStorage.removeItem).toHaveBeenCalledWith('distribution-state');
      expect(result.current.state.recipients).toHaveLength(0);
    });
  });

  describe('Recipient Management', () => {
    it('should add recipients correctly', () => {
      const { result } = renderHook(() => useDistributionState());

      act(() => {
        result.current.addRecipient('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF');
      });

      expect(result.current.state.recipients).toHaveLength(1);
      expect(result.current.state.recipients[0].address).toBe('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF');
      expect(result.current.state.recipients[0].id).toBeDefined();
    });

    it('should update recipients correctly', () => {
      const { result } = renderHook(() => useDistributionState());

      act(() => {
        result.current.addRecipient('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF');
      });

      const recipientId = result.current.state.recipients[0].id;

      act(() => {
        result.current.updateRecipient(recipientId, {
          address: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM',
        });
      });

      expect(result.current.state.recipients[0].address).toBe('CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM');
    });

    it('should remove recipients correctly', () => {
      const { result } = renderHook(() => useDistributionState());

      act(() => {
        result.current.addRecipient('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF');
        result.current.addRecipient('CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM');
      });

      expect(result.current.state.recipients).toHaveLength(2);

      const recipientId = result.current.state.recipients[0].id;

      act(() => {
        result.current.removeRecipient(recipientId);
      });

      expect(result.current.state.recipients).toHaveLength(1);
      expect(result.current.state.recipients[0].address).toBe('CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM');
    });

    it('should handle bulk recipient operations', () => {
      const { result } = renderHook(() => useDistributionState());

      const recipients: Recipient[] = [
        {
          id: 'test-1',
          address: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
          isValid: true,
        },
        {
          id: 'test-2',
          address: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM',
          isValid: true,
        },
      ];

      act(() => {
        result.current.bulkAddRecipients(recipients);
      });

      expect(result.current.state.recipients).toHaveLength(2);

      act(() => {
        result.current.replaceRecipients([recipients[0]]);
      });

      expect(result.current.state.recipients).toHaveLength(1);
      expect(result.current.state.recipients[0].address).toBe('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF');
    });
  });

  describe('Validation', () => {
    it('should validate recipients and amounts', () => {
      const { result } = renderHook(() => useDistributionState());

      // Empty state should be invalid (no recipients)
      expect(result.current.isValid).toBe(false);
      expect(result.current.errors.length).toBeGreaterThan(0); // Should have at least one error

      act(() => {
        result.current.addRecipient('invalid-address');
      });

      expect(result.current.isValid).toBe(false);
      expect(result.current.errors.some(e => e.message.toLowerCase().includes('invalid') || e.message.toLowerCase().includes('address'))).toBe(true);

      act(() => {
        result.current.updateRecipient(result.current.state.recipients[0].id, {
          address: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
        });
        result.current.setTotalAmount('100');
      });

      expect(result.current.isValid).toBe(true);
      expect(result.current.errors).toHaveLength(0);
    });

    it('should detect duplicate addresses', () => {
      const { result } = renderHook(() => useDistributionState());

      const duplicateAddress = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

      act(() => {
        result.current.addRecipient(duplicateAddress);
        result.current.addRecipient(duplicateAddress);
        result.current.setTotalAmount('100');
      });

      expect(result.current.isValid).toBe(false);
      expect(result.current.errors.some(e => e.message.includes('Duplicate'))).toBe(true);
    });
  });

  describe('Calculated Values', () => {
    it('should calculate equal distribution amounts correctly', () => {
      const { result } = renderHook(() => useDistributionState());

      act(() => {
        result.current.addRecipient('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF');
        result.current.addRecipient('CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM');
        result.current.setTotalAmount('100');
      });

      expect(result.current.calculatedValues.perRecipientAmount).toBe('50');
      expect(result.current.calculatedValues.totalAmount).toBe('100');
      expect(result.current.calculatedValues.recipientCount).toBe(2);
    });

    it('should calculate weighted distribution totals correctly', () => {
      const { result } = renderHook(() => useDistributionState());

      act(() => {
        result.current.updateType('weighted');
        result.current.addRecipient('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', '30');
        result.current.addRecipient('CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM', '70');
      });

      expect(result.current.calculatedValues.totalAmount).toBe('100');
      expect(result.current.calculatedValues.recipientCount).toBe(2);
    });
  });
});