/**
 * ExifPreviewModal - Shows client-side extracted GPS, timestamp, and device
 * metadata for a proof file before the user confirms submission.
 */
import { MapPin, Clock, Smartphone, AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { ExifPreviewStatus } from '@/hooks/useExifPreview';
import type { ExifSummary } from '@/lib/exif';

interface ExifPreviewModalProps {
  open: boolean;
  status: ExifPreviewStatus;
  data: ExifSummary | null;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  onOpenChange?: (open: boolean) => void;
}

export function ExifPreviewModal({
  open,
  status,
  data,
  error,
  onConfirm,
  onCancel,
  onOpenChange,
}: ExifPreviewModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Review file metadata</DialogTitle>
          <DialogDescription>
            Confirm the details extracted from your proof file before submitting.
          </DialogDescription>
        </DialogHeader>

        {status === 'loading' && (
          <div className="space-y-3" role="status" aria-live="polite">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-5 w-2/3" />
          </div>
        )}

        {status === 'error' && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <AlertCircle className="h-4 w-4 text-yellow-400 shrink-0" />
            <p className="text-sm text-yellow-300">
              {error ?? 'No metadata could be read from this file. You may still submit it.'}
            </p>
          </div>
        )}

        {status === 'success' && data && (
          <div className="space-y-3">
            <MetadataRow
              icon={<MapPin className="h-4 w-4 text-zinc-400" />}
              label="GPS location"
              value={
                data.gps
                  ? `${data.gps.latitude.toFixed(5)}, ${data.gps.longitude.toFixed(5)}`
                  : 'Not available'
              }
            />
            <MetadataRow
              icon={<Clock className="h-4 w-4 text-zinc-400" />}
              label="Timestamp"
              value={data.timestamp ? new Date(data.timestamp).toLocaleString() : 'Not available'}
            />
            <MetadataRow
              icon={<Smartphone className="h-4 w-4 text-zinc-400" />}
              label="Device"
              value={
                data.device.make || data.device.model
                  ? [data.device.make, data.device.model].filter(Boolean).join(' ')
                  : 'Not available'
              }
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={status === 'loading'}>
            Confirm & Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MetadataRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/30 border border-zinc-700">
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-sm font-medium text-zinc-200">{label}</p>
      </div>
      <p className="text-xs text-zinc-400">{value}</p>
    </div>
  );
}
