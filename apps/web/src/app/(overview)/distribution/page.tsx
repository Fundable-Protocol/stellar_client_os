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

  const [selectedRecipients, setSelectedRecipients] = React.useState<Set<string>>(new Set());

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedRecipients(new Set(state.recipients.map(r => r.id)));
    } else {
      setSelectedRecipients(new Set());
    }
  };

  const handleSelectRow = (id: string, checked: boolean) => {
    const newSelected = new Set(selectedRecipients);
    if (checked) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedRecipients(newSelected);
  };

  const handleBulkDelete = () => {
    selectedRecipients.forEach(id => removeRecipient(id));
    setSelectedRecipients(new Set());
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
            )}
          </div>
        </div>

        {/* URL Input */}
        <div className="mb-6">
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="Enter an X post URL (https://x.com/username/status/1234567890) to extract Stellar addresses from replies."
              value={urlInput}
              onChange={(e) => {
                setUrlInput(e.target.value);
                if (urlInputError) setUrlInputError('');
              }}
              className={`flex-1 ${urlInputError ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
            />
            <Button
              variant="outline"
              className="bg-purple-600 hover:bg-purple-700 border-purple-600"
              onClick={handleExtractAddresses}
            >
              Extract Addresses
              className="bg-purple-600 hover:bg-purple-700 border-purple-600 whitespace-nowrap"
              onClick={handleExtractAddresses}
              disabled={isExtracting}
            >
              {isExtracting ? 'Extracting...' : 'Extract Addresses'}
            </Button>
          </div>
          {urlInputError && (
            <p className="mt-1.5 text-xs text-red-400">{urlInputError}</p>
          )}
        </div>

        {/* Status Message */}
        {uploadStatus.type && (
          <div className={`mb-4 p-3 rounded-lg border ${
            uploadStatus.type === 'success' 
              ? 'bg-green-900/20 border-green-700 text-green-300' 
              : 'bg-red-900/20 border-red-700 text-red-300'
          }`}>
            {uploadStatus.message}
          </div>
        )}

        {/* CSV Errors/Warnings Display */}
        {(csvErrors.length > 0 || csvWarnings.length > 0) && (
          <div className="mb-4">
            <CSVErrorDisplay
              errors={csvErrors}
              warnings={csvWarnings}
              onDismiss={() => {
                setCsvErrors([]);
                setCsvWarnings([]);
              }}
            />
          </div>
        )}

        {/* CSV Upload Area */}
        <div
          role="button"
          tabIndex={isProcessing ? -1 : 0}
          aria-label="CSV upload area. Drag and drop a CSV file here, or press Enter or Space to open the file picker."
          aria-disabled={isProcessing}
          className="border-2 border-dashed border-zinc-700 rounded-lg p-8 mb-6 text-center bg-zinc-900/50 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:border-purple-500"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={!isProcessing ? handleSelectFile : undefined}
          onKeyDown={(e) => {
            if (!isProcessing && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              handleSelectFile();
            }
          }}
        >
          <div className="flex flex-col items-center gap-4">
            <Upload className="h-12 w-12 text-zinc-500" />
            <div>
              <p className="text-base font-medium mb-2 text-zinc-300">Drag and drop a CSV file here, or click to select a file</p>
              <p className="text-sm text-zinc-500">
                CSV format: {state.type === 'equal' ? 'address (one per line)' : 'address,amount (one per line)'}
              </p>
              <p className="text-xs text-zinc-600 mt-1">Keyboard: Tab to focus, Enter or Space to open file picker</p>
            </div>
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="hidden"
                disabled={isProcessing}
              />
              <Button 
                variant="outline" 
                onClick={(e) => { e.stopPropagation(); handleSelectFile(); }}
                disabled={isProcessing}
              >
                {isProcessing ? 'Processing...' : 'Select File'}
              </Button>
              <Button 
                variant="outline" 
                onClick={(e) => { e.stopPropagation(); handleDownloadTemplate(); }}
                className="text-purple-400 border-purple-400 hover:bg-purple-400/10"
                disabled={isProcessing}
              >
                Download Template
              </Button>
            </div>
          </div>
        </div>

        {/* Recipients Table */}
        <div className="relative">
          <div 
            className="border border-zinc-800 rounded-lg mb-6 bg-zinc-900/30"
          >
          <Table>
            <TableHeader className="sticky top-0 bg-zinc-900/90 backdrop-blur-sm z-10">
              <TableRow className="border-zinc-800">
                <TableHead className="w-12 text-zinc-400">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-purple-600 focus:ring-purple-600 focus:ring-offset-zinc-900 cursor-pointer"
                    checked={state.recipients.length > 0 && selectedRecipients.size === state.recipients.length}
                    onChange={handleSelectAll}
                  />
                </TableHead>
                <TableHead className="w-12 text-zinc-400">#</TableHead>
                <TableHead className="text-zinc-400">Address</TableHead>
                <TableHead className="w-24 text-right text-zinc-400">
                  {state.type === 'weighted' ? 'Amount' : '0'}
                </TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.recipients.map((recipient, index) => (
                <TableRow key={recipient.id} className="border-zinc-800">
                  <TableCell>
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-purple-600 focus:ring-purple-600 focus:ring-offset-zinc-900 cursor-pointer"
                      checked={selectedRecipients.has(recipient.id)}
                      onChange={(e) => handleSelectRow(recipient.id, e.target.checked)}
                    />
                  </TableCell>
                  <TableCell className="text-zinc-500">{index + 1}</TableCell>
                  <TableCell>
                    <Input
                      type="text"
                      placeholder="Address"
                      value={recipient.address}
                      onChange={(e) => handleRecipientChange(recipient.id, 'address', e.target.value)}
                      className="border-0 bg-transparent p-0 focus-visible:ring-0 text-zinc-300 placeholder:text-zinc-600"
                      autoFocus={index === state.recipients.length - 1}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    {state.type === 'weighted' ? (
                      <Input
                        type="text"
                        placeholder="0"
                        value={recipient.amount || ''}
                        onChange={(e) => handleRecipientChange(recipient.id, 'amount', e.target.value)}
                        className="border-0 bg-transparent p-0 text-right focus-visible:ring-0 text-zinc-300 placeholder:text-zinc-600"
                      />
                    ) : (
                      <span className="text-zinc-500">0</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeRecipient(recipient.id)}
                      className="h-8 w-8 text-zinc-500 hover:text-red-400 hover:bg-red-900/20"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          
          {/* Scroll fade indicator for bottom - Removed as table is now full height */}
        </div>
          {isProcessing ? (
            <>
              <p className="text-sm text-zinc-400 mb-2 flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-purple-500 animate-pulse" />
                Validating recipients...
              </p>
              <RecipientTableSkeleton />
            </>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex justify-between">
          <div className="flex gap-4">
            <Button
              variant="outline"
              onClick={handleAddRecipient}
              className="flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Add Row
            </Button>
            
            {selectedRecipients.size > 0 && (
              <Button
                variant="outline"
                onClick={handleBulkDelete}
                className="flex items-center gap-2 text-red-500 border-red-900/50 hover:bg-red-900/20 hover:text-red-400"
              >
                <Trash2 className="h-4 w-4" />
                Delete Selected
              </Button>
            )}
          </div>

          <Button
            className="bg-purple-600 hover:bg-purple-700"
            disabled={state.recipients.length === 0 || isSubmitting || distInsufficientBalance}
            onClick={handleDistribute}
          >
            {isSubmitting ? 'Distributing...' : 'Distribute Token'}
          </Button>
        </div>
          </div>
        </div>
      </ErrorBoundary>
    </ProtectedRoute>
  );
}
```
