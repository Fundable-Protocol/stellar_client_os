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
import { useVirtualizer } from '@tanstack/react-virtual';
import { notify } from '@/utils/notification';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { ErrorFallback } from '@/components/ui/error-fallback';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';

/**
 * Distribution page – lets users configure and execute equal or weighted token
 * distributions to multiple Stellar recipients, with CSV import and address
 * extraction from X (Twitter) post replies.
 */
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
  const [uploadStatus, setUploadStatus] = React.useState<{
    type: 'success' | 'error' | null;
    message: string;
  }>({ type: null, message: '' });
  const [csvErrors, setCsvErrors] = React.useState<CSVError[]>([]);
  const [csvWarnings, setCsvWarnings] = React.useState<CSVWarning[]>([]);

  const [isProcessing, setIsProcessing] = React.useState(false);
  const [isExtracting, setIsExtracting] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const pageRef = React.useRef<HTMLDivElement>(null);

  const { execute, isSubmitting } = useDistributionTransaction();

  // Virtualization constants
  const VIRTUALIZE_THRESHOLD = 50;
  const ESTIMATED_ROW_HEIGHT = 72; // Based on existing row padding and content height

  const tokenAddress = React.useMemo(() => {
    return SUPPORTED_TOKENS.find((t) => t.value === selectedToken)?.address ?? 'native';
  }, [selectedToken]);

  // Compute total amount for balance validation
  const distributionTotal = React.useMemo(() => {
    if (state.type === 'equal') return state.totalAmount;
    // weighted: sum all recipient amounts
    const sum = state.recipients.reduce((acc, r) => {
      const n = parseFloat(r.amount || '0');
      return acc + (isNaN(n) ? 0 : n);
    }, 0);
    return sum > 0 ? sum.toString() : '';
  }, [state.type, state.totalAmount, state.recipients]);

  const { balanceError: distBalanceError, insufficientBalance: distInsufficientBalance } =
    useBalanceValidation(distributionTotal, selectedToken);

  const hasRecipientInput = React.useMemo(() => {
    return state.recipients.some((recipient) => {
      const hasAddress = recipient.address.trim().length > 0;
      const hasAmount = (recipient.amount ?? '').trim().length > 0;
      return hasAddress || hasAmount;
    });
  }, [state.recipients]);

  const isDistributionDirty = React.useMemo(() => {
    return (
      hasRecipientInput ||
      state.totalAmount.trim().length > 0 ||
      urlInput.trim().length > 0
    );
  }, [hasRecipientInput, state.totalAmount, urlInput]);

  useUnsavedChanges(isDistributionDirty);

  const handleDistribute = async () => {
    const success = await execute(state, tokenAddress);
    if (!success) {
      return;
    }

    reset();
    setUrlInput('');
    setCsvErrors([]);
    setCsvWarnings([]);
    setUploadStatus({ type: null, message: '' });
  };

  const showMessage = (type: 'success' | 'error', message: string) => {
    setUploadStatus({ type, message });
    setTimeout(() => setUploadStatus({ type: null, message: '' }), 5000);
  };

  const handleExtractAddresses = async () => {
    if (!urlInput.trim()) {
      showMessage('error', 'Please enter an X post URL.');
      return;
    }
    setIsExtracting(true);
    try {
      const res = await fetch(`/api/extract-addresses?url=${encodeURIComponent(urlInput.trim())}`);
      const data = await res.json();
      if (!res.ok) {
        showMessage('error', data.error ?? 'Failed to extract addresses.');
        return;
      }
      const { addresses } = data as { addresses: string[] };
      if (addresses.length === 0) {
        showMessage('error', 'No Stellar addresses found in replies.');
        return;
      }
      const existing = new Set(state.recipients.map((r) => r.address).filter(Boolean));
      const fresh = addresses.filter((a) => !existing.has(a));
      const skipped = addresses.length - fresh.length;
      bulkAddRecipients(fresh.map((address) => ({ id: crypto.randomUUID(), address, isValid: true })));
      const msg = skipped > 0
        ? `Added ${fresh.length} address${fresh.length !== 1 ? 'es' : ''} (${skipped} duplicate${skipped !== 1 ? 's' : ''} skipped).`
        : `Added ${fresh.length} address${fresh.length !== 1 ? 'es' : ''}.`;
      showMessage('success', msg);
    } catch {
      showMessage('error', 'Network error. Please try again.');
    } finally {
      setIsExtracting(false);
    }
  };

  // Add initial recipients if none exist
  React.useEffect(() => {
    if (state.recipients.length === 0) {
      addRecipient();
      addRecipient();
    }
  }, [state.recipients.length, addRecipient]);

  const handleAddRecipient = () => {
    addRecipient();
    
    // Auto-scroll to the bottom of the page after adding a new recipient
    setTimeout(() => {
      if (pageRef.current) {
        pageRef.current.scrollTop = pageRef.current.scrollHeight;
      }
    }, 100);
  };

  const handleRecipientChange = (id: string, field: 'address' | 'amount', value: string) => {
    updateRecipient(id, { [field]: value });
  };

  const handleDownloadTemplate = () => {
    downloadCSVTemplate(state.type);
  };

  const handleSelectFile = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setIsProcessing(true);
      // Clear previous errors/warnings
      setCsvErrors([]);
      setCsvWarnings([]);
      
      try {
        const result = await processCSVFile(file, state.type);
        
        if (result.errors.length > 0) {
          // Surface errors to user via UI
          setCsvErrors(result.errors);
          setCsvWarnings(result.warnings);
          showMessage('error', `CSV processing failed with ${result.errors.length} error${result.errors.length !== 1 ? 's' : ''}`);
          return;
        }

        // Show warnings if any (but still process)
        if (result.warnings.length > 0) {
          setCsvWarnings(result.warnings);
        }

        // Add recipients from CSV using bulk add
        bulkAddRecipients(result.recipients);

        // Show success message
        const warningText = result.warnings.length > 0 
          ? ` (${result.warnings.length} warning${result.warnings.length !== 1 ? 's' : ''})` 
          : '';
        showMessage('success', `Successfully imported ${result.recipients.length} recipient${result.recipients.length !== 1 ? 's' : ''} from CSV${warningText}`);
        
        // Auto-scroll to show the newly added recipients
        setTimeout(() => {
          if (pageRef.current) {
            pageRef.current.scrollTop = pageRef.current.scrollHeight;
          }
        }, 100);
        
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        } catch (error) {
        notify.error('Failed to process CSV file. Please check the format and try again.');
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        setCsvErrors([{ line: 0, message: errorMessage }]);
        showMessage('error', 'Failed to process CSV file. Please check the format and try again.');
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
  };

  const handleDrop = async (event: React.DragEvent) => {
    event.preventDefault();
    const files = event.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      setIsProcessing(true);
      // Clear previous errors/warnings
      setCsvErrors([]);
      setCsvWarnings([]);
      
      try {
        const result = await processCSVFile(file, state.type);
        
        if (result.errors.length > 0) {
          // Surface errors to user via UI
          setCsvErrors(result.errors);
          setCsvWarnings(result.warnings);
          showMessage('error', `CSV processing failed with ${result.errors.length} error${result.errors.length !== 1 ? 's' : ''}`);
          return;
        }

        // Show warnings if any (but still process)
        if (result.warnings.length > 0) {
          setCsvWarnings(result.warnings);
        }

        // Add recipients from CSV using bulk add
        bulkAddRecipients(result.recipients);

        const warningText = result.warnings.length > 0 
          ? ` (${result.warnings.length} warning${result.warnings.length !== 1 ? 's' : ''})` 
          : '';
        showMessage('success', `Successfully imported ${result.recipients.length} recipient${result.recipients.length !== 1 ? 's' : ''} from CSV${warningText}`);
        
        // Auto-scroll to show the newly added recipients
        setTimeout(() => {
          if (pageRef.current) {
            pageRef.current.scrollTop = pageRef.current.scrollHeight;
          }
        }, 100);
      } catch (error) {
        notify.error('Failed to process CSV file. Please check the format and try again.');
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        setCsvErrors([{ line: 0, message: errorMessage }]);
        showMessage('error', 'Failed to process CSV file. Please check the format and try again.');
      } finally {
        setIsProcessing(false);
      }
    }
  };

  // Virtualized recipient table component
  const VirtualizedRecipientTable = React.useMemo(() => {
    return function VirtualizedRecipientTable() {
      const parentRef = React.useRef<HTMLDivElement>(null);
      
      const virtualizer = useVirtualizer({
        count: state.recipients.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => ESTIMATED_ROW_HEIGHT,
        overscan: 5,
      });

      const virtualItems = virtualizer.getVirtualItems();
      const totalSize = virtualizer.getTotalSize();

      return (
        <div className="border border-zinc-800 rounded-lg mb-6 bg-zinc-900/30">
          {/* Sticky Header */}
          <Table>
            <TableHeader className="sticky top-0 bg-zinc-900/90 backdrop-blur-sm z-10">
              <TableRow className="border-zinc-800">
                <TableHead className="w-12 text-zinc-400">#</TableHead>
                <TableHead className="text-zinc-400">Address</TableHead>
                <TableHead className="w-24 text-right text-zinc-400">
                  {state.type === 'weighted' ? 'Amount' : '0'}
                </TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
          </Table>
          
          {/* Virtual Scroll Container */}
          <div
            ref={parentRef}
            style={{ height: '500px', overflow: 'auto' }}
            className="relative"
          >
            <Table style={{ width: '100%' }}>
              <TableBody>
                {/* Top spacer */}
                <tr>
                  <td
                    style={{ height: virtualItems[0]?.start ?? 0 }}
                    colSpan={4}
                  />
                </tr>

                {/* Virtual rows */}
                {virtualItems.map((virtualRow) => {
                  const recipient = state.recipients[virtualRow.index];
                  return (
                    <TableRow
                      key={recipient.id}
                      data-index={virtualRow.index}
                      ref={virtualizer.measureElement}
                      className="border-zinc-800"
                      style={{ height: ESTIMATED_ROW_HEIGHT }}
                    >
                      <TableCell className="text-zinc-500">{virtualRow.index + 1}</TableCell>
                      <TableCell>
                        <Input
                          type="text"
                          placeholder="Address"
                          value={recipient.address}
                          onChange={(e) => handleRecipientChange(recipient.id, 'address', e.target.value)}
                          className="border-0 bg-transparent p-0 focus-visible:ring-0 text-zinc-300 placeholder:text-zinc-600"
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
                  );
                })}

                {/* Bottom spacer */}
                <tr>
                  <td
                    style={{
                      height: totalSize - (virtualItems[virtualItems.length - 1]?.end ?? 0)
                    }}
                    colSpan={4}
                  />
                </tr>
              </TableBody>
            </Table>
          </div>
        </div>
      );
    };
  }, [state.recipients, state.type, ESTIMATED_ROW_HEIGHT, handleRecipientChange, removeRecipient]);

  // Standard recipient table component (existing implementation)
  const StandardRecipientTable = React.useMemo(() => {
    return function StandardRecipientTable() {
      return (
        <div className="border border-zinc-800 rounded-lg mb-6 bg-zinc-900/30">
          <Table>
            <TableHeader className="sticky top-0 bg-zinc-900/90 backdrop-blur-sm z-10">
              <TableRow className="border-zinc-800">
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
        </div>
      );
    };
  }, [state.recipients, state.type, handleRecipientChange, removeRecipient]);

  const shouldVirtualize = state.recipients.length >= VIRTUALIZE_THRESHOLD;
  const RecipientTableComponent = shouldVirtualize ? VirtualizedRecipientTable : StandardRecipientTable;

  return (
    <ProtectedRoute description="Connect your Stellar wallet to create token distributions.">
      <ErrorBoundary
        boundaryName="distribution-module"
        fallback={({ error, reset }) => (
          <ErrorFallback
            title="Distribution Unavailable"
            description="Something failed in the distribution module."
            error={error}
            onRetry={reset}
          />
        )}
      >
        <div 
          ref={pageRef}
          className="h-screen mt-10 bg-black text-white overflow-y-auto scroll-smooth distribution-scrollbar"
        >
          <div className="max-w-6xl mx-auto p-6 pb-12">
        {/* Header */}
        <h1 className="text-xl font-semibold mb-8 text-zinc-100">Create Distribution</h1>

        {/* Controls Row */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-8">
            {/* Show Address Label Toggle */}
            <div className="flex items-center gap-3">
              <Label htmlFor="show-address-label" className="text-sm">
                Show Address Label
              </Label>
              <Switch
                id="show-address-label"
                checked={showAddressLabel}
                onChange={(e) => setShowAddressLabel(e.target.checked)}
              />
            </div>

            {/* Distribution Type Toggle */}
            <div className="flex items-center gap-3">
              <Label className="text-sm">Distribution Type</Label>
              <div className="flex items-center gap-2">
                <Button
                  variant={state.type === 'equal' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => updateType('equal')}
                  className="h-8"
                >
                  Equal
                </Button>
                <Button
                  variant={state.type === 'weighted' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => updateType('weighted')}
                  className="h-8"
                >
                  Weighted
                </Button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Token Selector */}
            <Select value={selectedToken} onValueChange={setSelectedToken}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_TOKENS.map((token) => (
                  <SelectItem key={token.value} value={token.value}>
                    {token.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Amount Configuration */}
            {state.type === 'equal' && (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Label className="text-sm whitespace-nowrap">
                    Equal Amount per address
                  </Label>
                  <Input
                    type="text"
                    placeholder="Amount"
                    value={state.totalAmount}
                    onChange={(e) => setTotalAmount(e.target.value)}
                    className={`w-32 ${distBalanceError ? 'border-red-500' : ''}`}
                  />
                </div>
                {distBalanceError && (
                  <p className="text-xs text-red-400">{distBalanceError}</p>
                )}
              </div>
            )}

            {state.type === 'weighted' && (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Label className="text-sm">Amount</Label>
                </div>
                {distBalanceError && (
                  <p className="text-xs text-red-400">{distBalanceError}</p>
                )}
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
              onChange={(e) => setUrlInput(e.target.value)}
              className="flex-1"
            />
            <Button
              variant="outline"
              className="bg-purple-600 hover:bg-purple-700 border-purple-600 whitespace-nowrap"
              onClick={handleExtractAddresses}
              disabled={isExtracting}
            >
              {isExtracting ? 'Extracting...' : 'Extract Addresses'}
            </Button>
          </div>
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
          className="border-2 border-dashed border-zinc-700 rounded-lg p-8 mb-6 text-center bg-zinc-900/50"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <div className="flex flex-col items-center gap-4">
            <Upload className="h-12 w-12 text-zinc-500" />
            <div>
              <p className="text-base font-medium mb-2 text-zinc-300">Drag and drop a CSV file here, or click to select a file</p>
              <p className="text-sm text-zinc-500">
                CSV format: {state.type === 'equal' ? 'address (one per line)' : 'address,amount (one per line)'}
              </p>
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
                onClick={handleSelectFile}
                disabled={isProcessing}
              >
                {isProcessing ? 'Processing...' : 'Select File'}
              </Button>
              <Button 
                variant="outline" 
                onClick={handleDownloadTemplate}
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
          <RecipientTableComponent />
        </div>
        
        {/* Scroll indicator for large lists - Removed as table is full height */}

        {/* Action Buttons */}
        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={handleAddRecipient}
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Row
          </Button>

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
