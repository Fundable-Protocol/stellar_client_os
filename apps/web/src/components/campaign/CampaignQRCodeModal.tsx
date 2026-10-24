'use client';

import React, { useEffect, useState, useId } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  generateQRCodeSVG,
  downloadQRCodeSVG,
  downloadQRCodePNG,
  QR_CODE_SIZE_OPTIONS,
  QRCodeSize,
} from '@/services/campaign-qr-code.service';
import { Download, QrCode } from 'lucide-react';

export interface CampaignQRCodeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  campaignName: string;
  canonicalUrl: string;
}

export function CampaignQRCodeModal({
  open,
  onOpenChange,
  campaignId,
  campaignName,
  canonicalUrl,
}: CampaignQRCodeModalProps) {
  const [selectedSize, setSelectedSize] = useState<QRCodeSize>(512);
  const [svgPreview, setSvgPreview] = useState<string>('');
  const [isDownloading, setIsDownloading] = useState(false);
  const selectId = useId();

  useEffect(() => {
    let active = true;
    if (open && canonicalUrl) {
      generateQRCodeSVG(canonicalUrl, 256)
        .then((svg) => {
          if (active) setSvgPreview(svg);
        })
        .catch(console.error);
    }
    return () => {
      active = false;
    };
  }, [open, canonicalUrl]);

  const sanitizedFilename = `campaign-${campaignId.replace(/[^a-zA-Z0-9_-]/g, '_')}-qr-${selectedSize}px`;

  const handleDownloadSVG = async () => {
    setIsDownloading(true);
    try {
      await downloadQRCodeSVG(canonicalUrl, sanitizedFilename, selectedSize);
    } catch (err) {
      console.error('Failed to download SVG:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadPNG = async () => {
    setIsDownloading(true);
    try {
      await downloadQRCodePNG(canonicalUrl, sanitizedFilename, selectedSize);
    } catch (err) {
      console.error('Failed to download PNG:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-zinc-950 border-zinc-800 text-zinc-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <QrCode className="h-5 w-5 text-fundable-purple-2 text-purple-400" />
            Campaign QR Code
          </DialogTitle>
          <DialogDescription className="text-zinc-400 text-sm">
            Download a high-resolution QR code for <strong className="text-zinc-200">{campaignName}</strong> to print on flyers, business cards, posters, or banners.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center justify-center p-4 bg-zinc-900/60 rounded-xl border border-zinc-800">
          <div
            className="w-48 h-48 bg-white p-2.5 rounded-lg shadow-inner flex items-center justify-center [&>svg]:w-full [&>svg]:h-full"
            dangerouslySetInnerHTML={{ __html: svgPreview }}
            aria-label="QR Code preview"
          />
          <p className="mt-3 text-xs text-zinc-400 break-all text-center max-w-xs font-mono">
            {canonicalUrl}
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor={selectId} className="block text-xs font-medium text-zinc-300 mb-1.5">
              Select Output Size
            </label>
            <select
              id={selectId}
              value={selectedSize}
              onChange={(e) => setSelectedSize(Number(e.target.value) as QRCodeSize)}
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              {QR_CODE_SIZE_OPTIONS.map((opt) => (
                <option key={opt.size} value={opt.size}>
                  {opt.label} — {opt.description}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button
              type="button"
              onClick={handleDownloadSVG}
              disabled={isDownloading || !canonicalUrl}
              className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-medium"
            >
              <Download className="mr-1.5 h-4 w-4" /> Download SVG
            </Button>
            <Button
              type="button"
              onClick={handleDownloadPNG}
              disabled={isDownloading || !canonicalUrl}
              variant="outline"
              className="flex-1 border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-100 font-medium"
            >
              <Download className="mr-1.5 h-4 w-4" /> Download PNG
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default CampaignQRCodeModal;
