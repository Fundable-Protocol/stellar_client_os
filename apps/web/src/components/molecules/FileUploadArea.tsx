/**
 * FileUploadArea - CSV upload with drag-and-drop and validation
 */

import React, { useCallback, useState } from 'react';
import { Upload, Download, AlertCircle, CheckCircle, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { DistributionType, Recipient, CSVValidationResult } from '@/types/distribution';
import { 
  processCSVFile, 
  downloadCSVTemplate, 
  validateCSVFile 
} from '@/utils/csv-processing';

interface FileUploadAreaProps {
  /** Distribution type (affects CSV format) */
  distributionType: DistributionType;
  /** Callback when CSV is successfully processed */
  onUpload: (recipients: Recipient[]) => void;
  /** Callback when an error occurs */
  onError: (error: string, errors?: import('@/types/distribution').CSVError[], warnings?: import('@/types/distribution').CSVWarning[]) => void;
  /** Whether the upload area is disabled */
  disabled?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * File upload area with drag-and-drop support for CSV files
 */
export function FileUploadArea({
  distributionType,
  onUpload,
  onError,
  disabled = false,
  className,
}: FileUploadAreaProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastResult, setLastResult] = useState<CSVValidationResult | null>(null);

  const [progress, setProgress] = useState(0);
  
  const handleFileProcess = useCallback(async (file: File) => {
     setIsProcessing(true);
     setLastResult(null);
     setProgress(0);
 
     try {
       const result = await processCSVFile(file, distributionType, (p) => setProgress(p));
       setLastResult(result);
 
       if (result.isValid) {
         onUpload(result.recipients);
       } else {
         const errorMessage = result.errors.length > 0 
           ? `CSV validation failed with ${result.errors.length} error${result.errors.length !== 1 ? 's' : ''}`
           : 'CSV file contains invalid data';
         onError(errorMessage, result.errors, result.warnings);
       }
     } catch (error) {
       const errorMessage = error instanceof Error ? error.message : 'Failed to process CSV file';
       onError(errorMessage, [{ line: 0, message: errorMessage }], []);
     } finally {
       setIsProcessing(false);
       setProgress(0);
     }
   }, [distributionType, onUpload, onError]);

  const handleFileSelect = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    const file = files[0];
    const fileError = validateCSVFile(file);
    
    if (fileError) {
      onError(fileError);
      return;
    }

    handleFileProcess(file);
  }, [handleFileProcess, onError]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragOver(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    
    if (disabled) return;
    
    handleFileSelect(e.dataTransfer.files);
  }, [disabled, handleFileSelect]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileSelect(e.target.files);
    // Reset input value to allow re-uploading the same file
    e.target.value = '';
  }, [handleFileSelect]);

  const handleDownloadTemplate = useCallback(() => {
    downloadCSVTemplate(distributionType);
  }, [distributionType]);

  return (
    <div className={cn('space-y-4', className)}>
      {/* Upload Area */}
      <div
        className={cn(
          'relative border-2 border-dashed rounded-lg p-6 transition-colors',
          isDragOver && !disabled
            ? 'border-zinc-400 bg-zinc-800/50'
            : 'border-zinc-600 bg-zinc-800/20',
          disabled && 'opacity-50 cursor-not-allowed',
          !disabled && 'hover:border-zinc-500 hover:bg-zinc-800/30 cursor-pointer'
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => {
          if (!disabled) {
            document.getElementById('csv-file-input')?.click();
          }
        }}
      >
        <input
          id="csv-file-input"
          type="file"
          accept=".csv,text/csv"
          onChange={handleInputChange}
          disabled={disabled}
          className="sr-only"
          aria-label="Upload CSV file"
        />

        <div className="text-center">
          <div className="flex justify-center mb-4">
            {isProcessing ? (
              <div className="w-32">
                <div className="h-2 bg-zinc-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-purple-500 transition-all duration-200"
                    style={{ width: `${Math.round(progress * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-zinc-400 mt-2">
                  {Math.round(progress * 100)}% complete
                </p>
              </div>
            ) : (
              <Upload className="h-8 w-8 text-zinc-400" />
            )}
          </div>
          
          <div className="space-y-2">
            <p className="text-sm font-medium text-zinc-200">
              {isProcessing ? 'Processing CSV file...' : 'Upload CSV file'}
            </p>
            <p className="text-xs text-zinc-400">
              Drag and drop your CSV file here, or click to browse
            </p>
            <p className="text-xs text-zinc-500">
              Supports files up to 10MB
            </p>
          </div>
        </div>
      </div>

      {/* Template Download */}
      <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/30 border border-zinc-700">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-zinc-400" />
          <div>
            <p className="text-sm font-medium text-zinc-200">
              CSV Template
            </p>
            <p className="text-xs text-zinc-400">
              Download a template for {distributionType} distribution
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleDownloadTemplate}
          disabled={disabled}
          className="flex items-center gap-2"
        >
          <Download className="h-3 w-3" />
          Download
        </Button>
      </div>

      {/* Validation Results */}
      {lastResult && (
        <div className="space-y-2">
          {lastResult.isValid ? (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
              <CheckCircle className="h-4 w-4 text-green-400" />
              <div>
                <p className="text-sm font-medium text-green-400">
                  CSV processed successfully
                </p>
                <p className="text-xs text-green-300">
                  {lastResult.recipients.length} recipients imported
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <AlertCircle className="h-4 w-4 text-red-400" />
                <div>
                  <p className="text-sm font-medium text-red-400">
                    CSV validation failed
                  </p>
                  <p className="text-xs text-red-300">
                    {lastResult.errors.length} error(s) found
                  </p>
                </div>
              </div>
              
              {/* Error Details */}
              <div className="max-h-32 overflow-y-auto space-y-1">
                {lastResult.errors.slice(0, 5).map((error, index) => (
                  <div key={index} className="text-xs text-red-300 bg-red-500/5 p-2 rounded">
                    {error.line > 0 && `Line ${error.line}: `}
                    {error.column && `${error.column} - `}
                    {error.message}
                    {error.value && ` (${error.value})`}
                  </div>
                ))}
                {lastResult.errors.length > 5 && (
                  <div className="text-xs text-red-400 text-center py-1">
                    ... and {lastResult.errors.length - 5} more errors
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Warnings */}
          {lastResult.warnings.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                <AlertCircle className="h-3 w-3 text-yellow-400" />
                <p className="text-xs font-medium text-yellow-400">
                  {lastResult.warnings.length} warning(s)
                </p>
              </div>
              {lastResult.warnings.slice(0, 3).map((warning, index) => (
                <div key={index} className="text-xs text-yellow-300 bg-yellow-500/5 p-2 rounded">
                  {warning.line > 0 && `Line ${warning.line}: `}
                  {warning.message}
                  {warning.value && ` (${warning.value})`}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}