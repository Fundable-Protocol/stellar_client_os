/**
 * Core state management hook for token distribution
 */

import { useState, useCallback, useEffect } from 'react';
import { useDebouncedCallback } from './use-debounce-callback';
import type { 
  DistributionState, 
  DistributionType, 
  Recipient, 
  ValidationError 
} from '@/types/distribution';
import { isValidStellarAddress, validateStellarAddress, findDuplicateAddresses } from '@/utils/stellar-validation';
import { validateAmount, calculateEqualAmount, calculateTotalAmount } from '@/utils/amount-validation';

/**
 * Initial state for distribution
 */
const createInitialState = (): DistributionState => {
  const initialState: DistributionState = {
    type: 'equal',
    recipients: [],
    totalAmount: '',
    isValid: false,
    errors: [{
      field: 'recipients',
      message: 'At least one recipient is required',
    }],
  };
  return initialState;
};

/**
 * Generate a unique session key for storage
 */
const generateSessionKey = (): string => {
  return `distribution-session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Simple ID generator for recipients
 */
const generateRecipientId = (): string => {
  return `recipient_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Hook for managing distribution state with session persistence
 */
export function useDistributionState() {
  const [sessionKey] = useState(() => generateSessionKey());
  const [state, setState] = useState<DistributionState>(() => {
    // Try to restore from session storage
    if (typeof window !== 'undefined') {
      try {
        const stored = sessionStorage.getItem('distribution-state');
        if (stored) {
          const parsed = JSON.parse(stored);
          // Validate the stored state structure
          if (parsed && typeof parsed === 'object' && parsed.type && Array.isArray(parsed.recipients)) {
            return { ...createInitialState(), ...parsed };
          }
        }
      } catch (error) {
        console.warn('Failed to restore distribution state from session storage:', error);
      }
    }
    return createInitialState();
  });

  /**
   * Persist state to session storage
   */
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem('distribution-state', JSON.stringify(state));
      } catch (error) {
        console.warn('Failed to persist distribution state to session storage:', error);
      }
    }
  }, [state]);

  /**
   * Validate the current state
   */
  const validateState = useCallback((currentState: DistributionState): ValidationError[] => {
    const errors: ValidationError[] = [];

    // Validate recipients
    if (currentState.recipients.length === 0) {
      errors.push({
        field: 'recipients',
        message: 'At least one recipient is required',
      });
    }

    // Validate each recipient
    currentState.recipients.forEach((recipient, index) => {
      const addressError = validateStellarAddress(recipient.address);
      if (addressError) {
        errors.push({
          field: 'recipients',
          message: `Recipient ${index + 1}: ${addressError}`,
          recipientId: recipient.id,
        });
      }

      // For weighted distribution, validate amounts
      if (currentState.type === 'weighted' && recipient.amount !== undefined) {
        const amountError = validateAmount(recipient.amount);
        if (amountError) {
          errors.push({
            field: 'recipients',
            message: `Recipient ${index + 1} amount: ${amountError}`,
            recipientId: recipient.id,
          });
        }
      }
    });

    // Check for duplicate addresses
    const addresses = currentState.recipients.map(r => r.address).filter(addr => addr.trim() !== '');
    const duplicates = findDuplicateAddresses(addresses);
    if (duplicates.length > 0) {
      errors.push({
        field: 'recipients',
        message: `Duplicate addresses found: ${duplicates.join(', ')}`,
      });
    }

    // For equal distribution, validate total amount
    if (currentState.type === 'equal') {
      if (!currentState.totalAmount || currentState.totalAmount.trim() === '') {
        errors.push({
          field: 'totalAmount',
          message: 'Total amount is required for equal distribution',
        });
      } else {
        const totalAmountError = validateAmount(currentState.totalAmount);
        if (totalAmountError) {
          errors.push({
            field: 'totalAmount',
            message: totalAmountError,
          });
        }
      }
    }

    return errors;
  }, []);

  const debouncedValidate = useDebouncedCallback((currentState: DistributionState) => {
    const errors = validateState(currentState);
    setState(prev => ({ ...prev, errors, isValid: errors.length === 0 }));
  }, 150);

  /**
   * Update distribution type
   */
  const updateType = useCallback((type: DistributionType) => {
    setState(prevState => {
      const newState: DistributionState = {
        ...prevState,
        type,
        // Clear amount data when switching types but preserve addresses
        recipients: prevState.recipients.map(recipient => ({
          ...recipient,
          amount: type === 'weighted' ? recipient.amount || '' : undefined,
          isValid: isValidStellarAddress(recipient.address),
          validationError: validateStellarAddress(recipient.address) ?? undefined,
        })),
        totalAmount: type === 'equal' ? prevState.totalAmount : '',
      };

      const errors = validateState(newState);
      return {
        ...newState,
        errors,
        isValid: errors.length === 0,
      };
    });
  }, [validateState]);

  /**
   * Add a new recipient
   */
  const addRecipient = useCallback((address: string = '', amount?: string) => {
    setState(prevState => {
      const trimmed = address.trim();
      const newRecipient: Recipient = {
        id: generateRecipientId(),
        address: trimmed,
        amount: prevState.type === 'weighted' ? (amount || '') : undefined,
        isValid: isValidStellarAddress(trimmed),
        validationError: validateStellarAddress(trimmed) ?? undefined,
      };

      const newState: DistributionState = {
        ...prevState,
        recipients: [...prevState.recipients, newRecipient],
      };

      const errors = validateState(newState);
      return {
        ...newState,
        errors,
        isValid: errors.length === 0,
      };
    });
  }, [validateState]);

  /**
   * Update a specific recipient
   */
  const updateRecipient = useCallback((id: string, updates: Partial<Recipient>) => {
    setState(prevState => {
      const newState: DistributionState = {
        ...prevState,
        recipients: prevState.recipients.map(recipient => {
          if (recipient.id !== id) return recipient;
          const updated = { ...recipient, ...updates };
          const addr = updated.address ?? '';
          return {
            ...updated,
            isValid: isValidStellarAddress(addr),
            validationError: validateStellarAddress(addr) ?? undefined,
          };
        }),
      };

      debouncedValidate(newState);
      return newState;
    });
  }, [debouncedValidate]);

  /**
   * Remove a recipient
   */
  const removeRecipient = useCallback((id: string) => {
    setState(prevState => {
      const newState: DistributionState = {
        ...prevState,
        recipients: prevState.recipients.filter(recipient => recipient.id !== id),
      };

      const errors = validateState(newState);
      return {
        ...newState,
        errors,
        isValid: errors.length === 0,
      };
    });
  }, [validateState]);

  /**
   * Bulk add recipients (e.g., from CSV import)
   */
  const bulkAddRecipients = useCallback((recipients: Recipient[]) => {
    setState(prevState => {
      const existingAddresses = new Set(prevState.recipients.map(r => r.address));
      const validated = recipients
        .filter(r => !existingAddresses.has(r.address))
        .map(r => ({
          ...r,
          isValid: isValidStellarAddress(r.address),
          validationError: validateStellarAddress(r.address) ?? undefined,
        }));

      const newState: DistributionState = {
        ...prevState,
        recipients: [...prevState.recipients, ...validated],
      };

      const errors = validateState(newState);
      return {
        ...newState,
        errors,
        isValid: errors.length === 0,
      };
    });
  }, [validateState]);

  /**
   * Replace all recipients (e.g., from CSV import)
   */
  const replaceRecipients = useCallback((recipients: Recipient[]) => {
    setState(prevState => {
      const newState: DistributionState = {
        ...prevState,
        recipients,
      };

      const errors = validateState(newState);
      return {
        ...newState,
        errors,
        isValid: errors.length === 0,
      };
    });
  }, [validateState]);

  /**
   * Set total amount for equal distribution
   */
  const setTotalAmount = useCallback((amount: string) => {
    setState(prevState => {
      const newState: DistributionState = {
        ...prevState,
        totalAmount: amount,
      };

      const errors = validateState(newState);
      return {
        ...newState,
        errors,
        isValid: errors.length === 0,
      };
    });
  }, [validateState]);

  /**
   * Clear all data and reset to initial state
   */
  const reset = useCallback(() => {
    setState(createInitialState());
    // Clear session storage
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem('distribution-state');
      } catch (error) {
        console.warn('Failed to clear distribution state from session storage:', error);
      }
    }
  }, []);

  /**
   * Force revalidation of current state
   */
  const revalidate = useCallback(() => {
    setState(prevState => {
      const errors = validateState(prevState);
      return {
        ...prevState,
        errors,
        isValid: errors.length === 0,
      };
    });
  }, [validateState]);

  /**
   * Get calculated values for display
   */
  const calculatedValues = useCallback(() => {
    if (state.type === 'equal' && state.totalAmount && state.recipients.length > 0) {
      const perRecipientAmount = calculateEqualAmount(state.totalAmount, state.recipients.length);
      return {
        perRecipientAmount,
        totalAmount: state.totalAmount,
        recipientCount: state.recipients.length,
      };
    } else if (state.type === 'weighted') {
      const amounts = state.recipients
        .map(r => r.amount || '0')
        .filter(amount => amount !== '');
      const totalAmount = calculateTotalAmount(amounts);
      return {
        totalAmount,
        recipientCount: state.recipients.length,
        validRecipientCount: amounts.length,
      };
    }
    return {
      totalAmount: '0',
      recipientCount: state.recipients.length,
    };
  }, [state]);

  return {
    // State
    state,
    sessionKey,
    
    // Actions
    updateType,
    addRecipient,
    updateRecipient,
    removeRecipient,
    bulkAddRecipients,
    replaceRecipients,
    setTotalAmount,
    reset,
    revalidate,
    
    // Computed values
    calculatedValues: calculatedValues(),
    
    // Validation
    validate: () => validateState(state),
    isValid: state.isValid,
    errors: state.errors,
  };
}