/**
 * ExifPreviewModalContainer - Self-contained trigger for the EXIF preview
 * flow. Lets a user pick a proof file, extracts GPS/timestamp/device
 * metadata client-side, and shows it in a confirmation modal before the
 * file is handed off to the caller (e.g. a milestone proof upload form).
 */
'use client';

import { useCallback, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useExifPreview } from '@/hooks/useExifPreview';
import { ExifPreviewModal } from './ExifPreviewModal';

interface ExifPreviewModalContainerProps {
  /** Called with the original file once the user confirms submission */
  onFileConfirmed: (file: File) => void;
  /** Accepted file types for the underlying input */
  accept?: string;
  disabled?: boolean;
  className?: string;
}

export function ExifPreviewModalContainer({
  onFileConfirmed,
  accept = 'image/*',
  disabled = false,
  className,
}: ExifPreviewModalContainerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const { status, data, error, analyze, reset } = useExifPreview();

  const handleFileSelect = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const file = files[0];
      setPendingFile(file);
      setOpen(true);
      analyze(file);
    },
    [analyze]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFileSelect(e.target.files);
      e.target.value = '';
    },
    [handleFileSelect]
  );

  const handleConfirm = useCallback(() => {
    if (pendingFile) {
      onFileConfirmed(pendingFile);
    }
    setOpen(false);
    setPendingFile(null);
    reset();
  }, [pendingFile, onFileConfirmed, reset]);

  const handleCancel = useCallback(() => {
    setOpen(false);
    setPendingFile(null);
    reset();
  }, [reset]);

  return (
    <div className={cn('space-y-4', className)}>
      <input
        ref={inputRef}
        id="proof-file-input"
        type="file"
        accept={accept}
        onChange={handleInputChange}
        disabled={disabled}
        className="sr-only"
        aria-label="Upload proof file"
      />
      <Button
        variant="outline"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        className="flex items-center gap-2"
      >
        <Upload className="h-4 w-4" />
        Upload proof file
      </Button>

      <ExifPreviewModal
        open={open}
        status={status}
        data={data}
        error={error}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) handleCancel();
        }}
      />
    </div>
  );
}
