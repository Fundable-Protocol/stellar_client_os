```tsx
'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableHead, TableHeader, TableRow, TableCell } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Upload, Plus, Trash2 } from 'lucide-react';
import { useDistributionState } from '@/hooks/use-distribution-state';
import { useDistributionTransaction } from '@/hooks/use-distribution-transaction';
import { useBalanceValidation } from '@/hooks/use-balance-validation';
import { downloadCSVTemplate, processCSVFile } from '@/utils/csv-processing';
import { SUPPORTED_TOKENS } from '@/lib/validations';
import ProtectedRoute from '@/components/layouts/ProtectedRoute';
import { CSVErrorDisplay } from '@/components/molecules/CSVErrorDisplay';
import { CSVError, CSVWarning } from '@/types/distribution';
import { notify } from '@/utils/notification';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { ErrorFallback } from '@/components/ui/error-fallback';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';

export default function DistributionPage() {
  const {
    state,
    updateType,
    addRecipient,
    updateRecipient,
    removeRecipient,
    bulkAddRecipients,
    setTotalAmount,
    reset,
  } = useDistributionState();

  const [showAddressLabel, setShowAddressLabel] = React.useState(false);
  const [selectedToken, setSelectedToken] = React.useState('USDC');
  const [urlInput, setUrlInput] = React.useState('');
  const [urlInputError, setUrlInputError] = React.useState('');
  const [uploadStatus, setUploadStatus] = React.useState<{ type: 'success' | 'error' | null; message: string }>({ type: null, message: '' });
  const [csvErrors, setCsvErrors] = React.useState<CSVError[]>([]);
  const [csvWarnings, setCsvWarnings] = React.useState<CSVWarning[]>([]);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [showPreview, setShowPreview] = React.useState(false);
  const [isExtracting, setIsExtracting] = React.useState(false);

  const { execute, isSubmitting } = useDistributionTransaction();

  const validateXPostUrl = (url: string): string => {
    if (!url.trim()) return 'Please enter an X post URL.';
    try {
      const parsed = new URL(url);
      const validHosts = ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'];
      if (!validHosts.includes(parsed.hostname)) return 'Invalid host.';
      if (!/^\/[^/]+\/status\/\d+\/?$/.test(parsed.pathname)) return 'Invalid post URL.';
      return '';
    } catch {
      return 'Invalid URL format.';
    }
  };

  const handleExtractAddresses = async () => {
    const error = validateXPostUrl(urlInput);
    if (error) {
      setUrlInputError(error);
      return;
    }

    setUrlInputError('');
    setIsExtracting(true);

    try {
      const res = await fetch(`/api/extract-addresses?url=${encodeURIComponent(urlInput.trim())}`);
      const data = await res.json();

      if (!res.ok) {
        setUploadStatus({ type: 'error', message: data.error || 'Failed.' });
        return;
      }

      const existing = new Set(state.recipients.map((r) => r.address));
      const fresh = data.addresses.filter((a: string) => !existing.has(a));

      bulkAddRecipients(fresh.map((address: string) => ({
        id: crypto.randomUUID(),
        address,
        isValid: true
      })));

      setUploadStatus({ type: 'success', message: `Added ${fresh.length} addresses` });
    } catch {
      setUploadStatus({ type: 'error', message: 'Network error' });
    } finally {
      setIsExtracting(false);
    }
  };

  const tokenAddress = React.useMemo(() => {
    return SUPPORTED_TOKENS.find((t) => t.value === selectedToken)?.address ?? 'native';
  }, [selectedToken]);

  const hasRecipientInput = React.useMemo(() => {
    return state.recipients.some(r => r.address || r.amount);
  }, [state.recipients]);

  useUnsavedChanges(hasRecipientInput || urlInput);

  const handleDistribute = () => setShowPreview(true);

  const handleConfirmDistribute = async () => {
    const success = await execute(state, tokenAddress);
    if (!success) return;

    setShowPreview(false);
    reset();
    setUrlInput('');
    setCsvErrors([]);
    setCsvWarnings([]);
    setUploadStatus({ type: null, message: '' });
  };

  return (
    <ProtectedRoute description="Connect wallet">
      <ErrorBoundary fallback={({ error, reset }) => (
        <ErrorFallback title="Error" description="Something failed" error={error} onRetry={reset} />
      )}>
        <div className="p-6 text-white">
          
          <h1 className="text-xl mb-6">
            {showPreview ? 'Review Distribution' : 'Create Distribution'}
          </h1>

          {showPreview ? (
            <div>
              <Button onClick={() => setShowPreview(false)}>Back</Button>
              <Button onClick={handleConfirmDistribute} disabled={isSubmitting}>
                {isSubmitting ? 'Processing...' : 'Confirm'}
              </Button>
            </div>
          ) : (
            <>
              <div className="flex gap-4 mb-4">
                <Switch
                  checked={showAddressLabel}
                  onCheckedChange={(checked) => setShowAddressLabel(checked)}
                />

                <Select value={selectedToken} onValueChange={setSelectedToken}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_TOKENS.map(token => (
                      <SelectItem key={token.value} value={token.value}>
                        {token.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2 mb-4">
                <Input
                  placeholder="Paste X post URL"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                />
                <Button
                  onClick={handleExtractAddresses}
                  disabled={isExtracting}
                >
                  {isExtracting ? 'Extracting...' : 'Extract'}
                </Button>
              </div>

              {uploadStatus.type && (
                <p className={uploadStatus.type === 'error' ? 'text-red-400' : 'text-green-400'}>
                  {uploadStatus.message}
                </p>
              )}

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {state.recipients.map((r, i) => (
                    <TableRow key={r.id}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell>
                        <Input
                          value={r.address}
                          onChange={(e) =>
                            updateRecipient(r.id, { address: e.target.value })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={r.amount || ''}
                          onChange={(e) =>
                            updateRecipient(r.id, { amount: e.target.value })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Button onClick={() => removeRecipient(r.id)}>
                          <Trash2 />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex justify-between mt-4">
                <Button onClick={addRecipient}>
                  <Plus /> Add
                </Button>

                <Button onClick={handleDistribute}>
                  Review & Distribute
                </Button>
              </div>
            </>
          )}
        </div>
      </ErrorBoundary>
    </ProtectedRoute>
  );
}
```
