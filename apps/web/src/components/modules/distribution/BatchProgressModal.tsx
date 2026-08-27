'use client';

import React from 'react';
import type { Recipient } from '@/types/distribution';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Download, AlertCircle, CheckCircle2 } from 'lucide-react';

export interface BatchProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  status: 'idle' | 'processing' | 'success' | 'failed';
  currentBatch: number;
  totalBatches: number;
  failedRows?: Recipient[];
  errorMessage?: string;
  onExportFailedRows?: () => void;
}

/**
 * BatchProgressModal - Displays progress of batch transactions
 * Provides an 'Export Failed Rows' CSV download option on batch failure (Issue #436)
 */
export function BatchProgressModal({
  isOpen,
  onClose,
  status,
  currentBatch,
  totalBatches,
  failedRows = [],
  errorMessage,
  onExportFailedRows,
}: BatchProgressModalProps) {
  const handleExportFailed = () => {
    if (onExportFailedRows) {
      onExportFailedRows();
      return;
    }

    if (failedRows.length === 0) return;

    const headers = 'address,amount\n';
    const rows = failedRows
      .map((r) => `${r.address},${r.amount || ''}`)
      .join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `failed-batch-rows-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-zinc-900 text-zinc-100 border-zinc-800">
        <DialogHeader>
          <DialogTitle>
            {status === 'processing' && 'Processing Batch Distribution...'}
            {status === 'success' && 'Batch Distribution Complete'}
            {status === 'failed' && 'Batch Distribution Failed'}
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Batch {currentBatch} of {totalBatches}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {status === 'failed' && (
            <div className="p-4 rounded-lg bg-red-950/50 border border-red-800/50 text-red-300 space-y-3">
              <div className="flex items-center gap-2 font-medium">
                <AlertCircle className="h-5 w-5 text-red-400" />
                <span>Transaction Failed</span>
              </div>
              {errorMessage && (
                <p className="text-sm text-red-400/90">{errorMessage}</p>
              )}

              {(failedRows.length > 0 || onExportFailedRows) && (
                <div className="pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExportFailed}
                    className="flex items-center gap-2 border-red-700 bg-red-900/30 text-red-200 hover:bg-red-900/50 hover:text-red-100"
                  >
                    <Download className="h-4 w-4" />
                    Export Failed Rows ({failedRows.length})
                  </Button>
                </div>
              )}
            </div>
          )}

          {status === 'success' && (
            <div className="flex items-center gap-2 text-green-400 p-4 rounded-lg bg-green-950/50 border border-green-800/50">
              <CheckCircle2 className="h-5 w-5" />
              <span>All batch transactions executed successfully!</span>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
