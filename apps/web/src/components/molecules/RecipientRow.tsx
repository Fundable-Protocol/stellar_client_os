/**
 * RecipientRow - Individual recipient row with address and amount inputs
 */

import React, { useState } from 'react';
import { Trash2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { Recipient, DistributionType } from '@/types/distribution';
import { validateStellarAddress } from '@/utils/stellar-validation';
import { validateAmount } from '@/utils/amount-validation';

interface RecipientRowProps {
  /** Recipient data */
  recipient: Recipient;
  /** Distribution type (affects whether amount input is shown) */
  distributionType: DistributionType;
  /** Row index for display purposes */
  index: number;
  /** Callback when recipient data changes */
  onChange: (updates: Partial<Recipient>) => void;
  /** Callback when recipient should be removed */
  onRemove: () => void;
  /** Whether the row is disabled */
  disabled?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Individual recipient row with address input, optional amount input, and remove button
 */
export function RecipientRow({
  recipient,
  distributionType,
  index,
  onChange,
  onRemove,
  disabled = false,
  className,
}: RecipientRowProps) {
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  // Validate address in real-time
  const addressError = recipient.address ? validateStellarAddress(recipient.address) : null;
  
  // Validate amount for weighted distribution
  const amountError = distributionType === 'weighted' && recipient.amount 
    ? validateAmount(recipient.amount) 
    : null;

  const handleAddressChange = (value: string) => {
    onChange({
      address: value,
      isValid: !validateStellarAddress(value),
      validationError: validateStellarAddress(value) || undefined,
    });
  };

  const handleAmountChange = (value: string) => {
    onChange({
      amount: value,
      isValid: !validateAmount(value),
      validationError: validateAmount(value) || undefined,
    });
  };

  const handleRemove = () => {
    if (showConfirmDelete) {
      onRemove();
      setShowConfirmDelete(false);
    } else {
      setShowConfirmDelete(true);
      // Auto-hide confirmation after 3 seconds
      setTimeout(() => setShowConfirmDelete(false), 3000);
    }
  };

  return (
    <div className={cn(
      'flex items-start gap-3 p-4 rounded-lg border border-zinc-700 bg-zinc-800/50',
      className
    )}>
      {/* Row Number */}
      <div className="flex-shrink-0 w-8 h-9 flex items-center justify-center text-sm text-zinc-400 font-medium">
        {index + 1}
      </div>

      {/* Address Input */}
      <div className="flex-1 min-w-0">
        <div className="space-y-1">
          <Input
            type="text"
            placeholder="Stellar address (G... or C...)"
            value={recipient.address}
            onChange={(e) => handleAddressChange(e.target.value)}
            disabled={disabled}
            className={cn(
              'font-mono text-sm',
              addressError && 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
            )}
            aria-label={`Recipient ${index + 1} address`}
            aria-invalid={!!addressError}
            aria-describedby={addressError ? `recipient-${index}-address-error` : undefined}
          />
          {addressError && (
            <div id={`recipient-${index}-address-error`} role="alert" className="flex items-center gap-1 text-xs text-red-400">
              <AlertCircle className="h-3 w-3" aria-hidden="true" />
              <span>{addressError}</span>
            </div>
          )}
        </div>
      </div>

      {/* Amount Input (for weighted distribution) */}
      {distributionType === 'weighted' && (
        <div className="flex-shrink-0 w-32">
          <div className="space-y-1">
            <Input
              type="text"
              placeholder="Amount"
              value={recipient.amount || ''}
              onChange={(e) => handleAmountChange(e.target.value)}
              disabled={disabled}
              className={cn(
                'text-right',
                amountError && 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
              )}
              aria-label={`Recipient ${index + 1} amount`}
              aria-invalid={!!amountError}
              aria-describedby={amountError ? `recipient-${index}-amount-error` : undefined}
            />
            {amountError && (
              <div id={`recipient-${index}-amount-error`} role="alert" className="flex items-center gap-1 text-xs text-red-400">
                <AlertCircle className="h-3 w-3" aria-hidden="true" />
                <span>{amountError}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Remove Button */}
      <div className="flex-shrink-0">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleRemove}
          disabled={disabled}
          className={cn(
            'text-zinc-400 hover:text-red-400 hover:bg-red-500/10',
            showConfirmDelete && 'text-red-400 bg-red-500/10'
          )}
          aria-label={`Remove recipient ${index + 1}`}
          title={showConfirmDelete ? 'Click again to confirm removal' : 'Remove recipient'}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}