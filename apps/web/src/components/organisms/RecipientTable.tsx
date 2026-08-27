'use client';

import React, { memo, useCallback, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Button } from '@/components/ui/button';
import { Table, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RecipientRow } from '@/components/molecules/RecipientRow';
import { FileUploadArea } from '@/components/molecules/FileUploadArea';
import { Plus, Upload } from 'lucide-react';
import { Recipient, DistributionType } from '@/types/distribution';
import { notify } from '@/utils/notification';

const ROW_ESTIMATED_HEIGHT = 80;

interface RecipientTableProps {
  recipients: Recipient[];
  distributionType: DistributionType;
  onAddRecipient: () => void;
  onUpdateRecipient: (id: string, updates: Partial<Recipient>) => void;
  onRemoveRecipient: (id: string) => void;
  onBulkImport: (recipients: Recipient[]) => void;
  onUploadError?: (errors: import('@/types/distribution').CSVError[], warnings: import('@/types/distribution').CSVWarning[]) => void;
  isLoading?: boolean;
}

export const RecipientTable = memo(function RecipientTable({
  recipients,
  distributionType,
  onAddRecipient,
  onUpdateRecipient,
  onRemoveRecipient,
  onBulkImport,
  onUploadError,
  isLoading = false,
}: RecipientTableProps) {
  const [showUpload, setShowUpload] = React.useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: recipients.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => ROW_ESTIMATED_HEIGHT,
    overscan: 10,
  });

  const handleBulkImport = useCallback((newRecipients: Recipient[]) => {
    onBulkImport(newRecipients);
    setShowUpload(false);
    toast.success(
      `${newRecipients.length} recipient${newRecipients.length !== 1 ? 's' : ''} imported successfully.`,
      { duration: 4000 }
    );
  }, [onBulkImport]);

  const handleUploadError = useCallback((error: string) => {
    if (onUploadError) {
      onUploadError([{ line: 0, message: error }], []);
    } else {
      notify.error(`CSV upload error: ${error}`);
    }
  }, [onUploadError]);

  const toggleUpload = useCallback(() => {
    setShowUpload(prev => !prev);
  }, []);

  const recipientCount = useMemo(() => recipients.length, [recipients.length]);

  const totalSize = rowVirtualizer.getTotalSize();
  const virtualItems = rowVirtualizer.getVirtualItems();

  return (
    <div className="space-y-4">
      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-zinc-100">Recipients</h3>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={toggleUpload}
          >
            <Upload className="h-4 w-4" />
            Import CSV
          </Button>
          <Button size="sm" onClick={onAddRecipient}>
            <Plus className="h-4 w-4" />
            Add Recipient
          </Button>
        </div>
      </div>

      {/* CSV Upload Area */}
      {showUpload && (
        <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-800/30">
          <FileUploadArea
            distributionType={distributionType}
            onUpload={handleBulkImport}
            onError={handleUploadError}
          />
        </div>
      )}

      {/* Recipients Table — Virtualized */}
      {recipientCount > 0 ? (
        <div className="border border-zinc-700 rounded-lg">
          {/* Non-virtualized table header */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Address</TableHead>
                {distributionType === 'weighted' && (
                  <TableHead>Amount</TableHead>
                )}
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
          </Table>

          {/* Virtualized scrollable rows */}
          <div
            ref={scrollContainerRef}
            className="overflow-auto"
            style={{ maxHeight: Math.min(recipientCount * ROW_ESTIMATED_HEIGHT, 480) }}
          >
            <div
              style={{
                height: `${totalSize}px`,
                position: 'relative',
              }}
            >
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={`skeleton-${i}`}
                    className="flex items-center gap-3 p-4 border-b border-zinc-700"
                  >
                    <div className="h-4 bg-zinc-800 animate-pulse rounded w-full" />
                    {distributionType === 'weighted' && (
                      <div className="h-4 bg-zinc-800 animate-pulse rounded w-32" />
                    )}
                    <div className="h-4 bg-zinc-800 animate-pulse rounded w-8" />
                  </div>
                ))
              ) : (
                virtualItems.map((virtualRow) => {
                  const recipient = recipients[virtualRow.index];
                  return (
                    <div
                      key={recipient.id}
                      data-index={virtualRow.index}
                      ref={rowVirtualizer.measureElement}
                      className="border-b border-zinc-700 last:border-b-0"
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <RecipientRow
                        index={virtualRow.index}
                        recipient={recipient}
                        distributionType={distributionType}
                        onChange={(updates) => onUpdateRecipient(recipient.id, updates)}
                        onRemove={() => onRemoveRecipient(recipient.id)}
                      />
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="border border-dashed border-zinc-700 rounded-lg p-8 text-center">
          <div className="text-zinc-400 mb-4">
            <Plus className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p className="text-lg font-medium">No recipients added</p>
            <p className="text-sm">Add recipients manually or import from CSV</p>
          </div>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" onClick={() => setShowUpload(true)}>
              Import CSV
            </Button>
            <Button onClick={onAddRecipient}>Add First Recipient</Button>
          </div>
        </div>
      )}

      {/* Summary */}
      {recipientCount > 0 && (
        <div className="text-sm text-zinc-400">
          {recipientCount} recipient{recipientCount !== 1 ? 's' : ''} added
        </div>
      )}
    </div>
  );
});
