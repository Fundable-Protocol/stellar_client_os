'use client';

import React, { memo, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RecipientRow } from '@/components/molecules/RecipientRow';
import { FileUploadArea } from '@/components/molecules/FileUploadArea';
import { Plus, Upload } from 'lucide-react';
import { Recipient, DistributionType } from '@/types/distribution';

interface RecipientTableProps {
  recipients: Recipient[];
  distributionType: DistributionType;
  onAddRecipient: () => void;
  onUpdateRecipient: (id: string, updates: Partial<Recipient>) => void;
  onRemoveRecipient: (id: string) => void;
  onBulkImport: (recipients: Recipient[]) => void;
  isLoading?: boolean;
}

export const RecipientTable = memo(function RecipientTable({
  recipients,
  distributionType,
  onAddRecipient,
  onUpdateRecipient,
  onRemoveRecipient,
  onBulkImport,
  isLoading = false,
}: RecipientTableProps) {
  const [showUpload, setShowUpload] = React.useState(false);

  const handleBulkImport = useCallback((newRecipients: Recipient[]) => {
    onBulkImport(newRecipients);
    setShowUpload(false);
  }, [onBulkImport]);

  const handleUploadError = useCallback((error: string) => {
    // TODO: Integrate with existing notification system
    console.error('CSV upload error:', error);
  }, []);

  const toggleUpload = useCallback(() => {
    setShowUpload(prev => !prev);
  }, []);

  const recipientCount = useMemo(() => recipients.length, [recipients.length]);

  const recipientRows = useMemo(() =>
    recipients.map((recipient, index) => (
      <RecipientRow
        key={recipient.id}
        index={index}
        recipient={recipient}
        distributionType={distributionType}
        onChange={(updates) => onUpdateRecipient(recipient.id, updates)}
        onRemove={() => onRemoveRecipient(recipient.id)}
      />
    )),
    [recipients, distributionType, onUpdateRecipient, onRemoveRecipient]
  );

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

      {/* Recipients Table */}
      {recipientCount > 0 ? (
        <div className="border border-zinc-700 rounded-lg">
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
            <TableBody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={`skeleton-${i}`} className="border-zinc-800">
                    <TableCell><div className="h-4 bg-zinc-800 animate-pulse rounded w-full" /></TableCell>
                    {distributionType === 'weighted' && (
                      <TableCell><div className="h-4 bg-zinc-800 animate-pulse rounded w-full" /></TableCell>
                    )}
                    <TableCell><div className="h-4 bg-zinc-800 animate-pulse rounded w-8 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : (
                recipientRows
              )}
            </TableBody>
          </Table>
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