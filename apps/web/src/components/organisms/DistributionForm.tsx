'use client';

import React, { memo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DistributionTypeSelector } from '@/components/molecules/DistributionTypeSelector';
import { RecipientTable } from '@/components/organisms/RecipientTable';
import { AmountSummary } from '@/components/molecules/AmountSummary';
import { useDistributionState } from '@/hooks/use-distribution-state';
import { DistributionState } from '@/types/distribution';

interface DistributionFormProps {
  onSubmit: (data: DistributionState) => Promise<void>;
  initialState?: Partial<DistributionState>;
  isLoading?: boolean;
}

export const DistributionForm = memo(function DistributionForm({
  onSubmit,
  initialState,
  isLoading = false,
}: DistributionFormProps) {
  const {
    state,
    updateType,
    addRecipient,
    updateRecipient,
    removeRecipient,
    bulkAddRecipients,
    setTotalAmount,
    validate,
    reset,
  } = useDistributionState();

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validate()) {
      return;
    }

    try {
      await onSubmit(state);
    } catch (error) {
      console.error('Distribution submission failed:', error);
      // TODO: Integrate with existing notification system
    }
  }, [onSubmit, state, validate]);

  const handleTotalAmountChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setTotalAmount(e.target.value);
  }, [setTotalAmount]);

  const canSubmit = state.isValid && 
    state.recipients.length > 0 && 
    (state.type === 'weighted' || (state.type === 'equal' && state.totalAmount));

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Distribution Type Selection */}
      <div className="space-y-2">
        <Label className="text-base font-medium text-zinc-100">
          Distribution Type
        </Label>
        <DistributionTypeSelector
          value={state.type}
          onChange={updateType}
          disabled={isLoading}
        />
      </div>

      {/* Total Amount Input (Equal Distribution Only) */}
      {state.type === 'equal' && (
        <div className="space-y-2">
          <Label htmlFor="totalAmount" className="text-base font-medium text-zinc-100">
            Total Amount to Distribute
          </Label>
          <Input
            id="totalAmount"
            type="text"
            placeholder="Enter total amount"
            value={state.totalAmount}
            onChange={handleTotalAmountChange}
            disabled={isLoading}
            aria-invalid={state.errors.some(e => e.field === 'totalAmount')}
            aria-describedby={state.errors.some(e => e.field === 'totalAmount') ? 'totalAmount-error' : undefined}
          />
          {state.errors
            .filter(e => e.field === 'totalAmount')
            .map((error, index) => (
              <p key={index} id={index === 0 ? 'totalAmount-error' : undefined} role="alert" className="text-sm text-red-400">
                {error.message}
              </p>
            ))}
        </div>
      )}

      {/* Recipients Management */}
      <RecipientTable
        recipients={state.recipients}
        distributionType={state.type}
        onAddRecipient={addRecipient}
        onUpdateRecipient={updateRecipient}
        onRemoveRecipient={removeRecipient}
        onBulkImport={bulkAddRecipients}
        isLoading={isLoading}
      />

      {/* Amount Summary */}
      {state.recipients.length > 0 && (
        <AmountSummary
          distributionType={state.type}
          totalAmount={state.type === 'equal' ? state.totalAmount : 
            state.recipients.reduce((sum, r) => sum + (parseFloat(r.amount || '0')), 0).toString()}
          recipientCount={state.recipients.length}
          perRecipientAmount={state.type === 'equal' && state.totalAmount ? 
            (parseFloat(state.totalAmount) / state.recipients.length).toString() : undefined}
          validRecipientCount={state.type === 'weighted' ? 
            state.recipients.filter(r => r.amount && parseFloat(r.amount) > 0).length : undefined}
        />
      )}

      {/* Form Errors */}
      {state.errors.length > 0 && (
        <div role="alert" aria-live="assertive" className="bg-red-900/20 border border-red-700 rounded-lg p-4">
          <h4 className="text-sm font-medium text-red-400 mb-2">
            Please fix the following errors:
          </h4>
          <ul className="text-sm text-red-300 space-y-1">
            {state.errors.map((error, index) => (
              <li key={index}>• {error.message}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Submit Button */}
      <div className="flex gap-3">
        <Button
          type="submit"
          disabled={!canSubmit || isLoading}
          className="flex-1"
        >
          {isLoading ? 'Processing...' : 'Distribute Tokens'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={reset}
          disabled={isLoading}
        >
          Reset
        </Button>
      </div>
    </form>
  );
});