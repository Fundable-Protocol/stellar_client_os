'use client';

import React from 'react';
import { stroopsToAmount, formatAmount } from '@/utils/amount-validation';
import type { DistributionType } from '@/types/distribution';

export interface DistributionSummaryProps {
  distributionType: DistributionType;
  totalAmountStroops: bigint | string;
  recipientCount: number;
  perRecipientStroops?: bigint | string;
  tokenSymbol?: string;
  decimals?: number;
  className?: string;
}

/**
 * DistributionSummary - Confirmation summary component for token distribution.
 * Formats BigInt/atomic token amounts into human-readable decimal values (Fix Issue #438).
 */
export function DistributionSummary({
  distributionType,
  totalAmountStroops,
  recipientCount,
  perRecipientStroops,
  tokenSymbol = 'XLM',
  decimals = 7,
  className = '',
}: DistributionSummaryProps) {
  const formatTokenAmount = (val: bigint | string | undefined): string => {
    if (val === undefined || val === null) return '0';
    try {
      if (typeof val === 'bigint') {
        return stroopsToAmount(val, decimals);
      }
      // If string is all digits (raw atomic/stroop units), convert via BigInt
      if (/^\d+$/.test(val.trim())) {
        return stroopsToAmount(BigInt(val.trim()), decimals);
      }
      // Otherwise format string decimal
      return formatAmount(val);
    } catch {
      return String(val);
    }
  };

  const formattedTotal = formatTokenAmount(totalAmountStroops);
  const formattedPerRecipient = perRecipientStroops
    ? formatTokenAmount(perRecipientStroops)
    : null;

  return (
    <div className={`p-4 rounded-lg bg-zinc-800/40 border border-zinc-700 space-y-3 ${className}`}>
      <h4 className="text-sm font-semibold text-zinc-200">Confirmation Summary</h4>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <span className="text-zinc-400">Distribution Type:</span>
        <span className="font-medium capitalize text-zinc-200">{distributionType}</span>

        <span className="text-zinc-400">Total Recipients:</span>
        <span className="font-medium text-zinc-200">{recipientCount}</span>

        <span className="text-zinc-400">Total Amount:</span>
        <span className="font-medium text-zinc-200">
          {formattedTotal} {tokenSymbol}
        </span>

        {distributionType === 'equal' && formattedPerRecipient && (
          <>
            <span className="text-zinc-400">Per Recipient:</span>
            <span className="font-medium text-zinc-200">
              {formattedPerRecipient} {tokenSymbol}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
