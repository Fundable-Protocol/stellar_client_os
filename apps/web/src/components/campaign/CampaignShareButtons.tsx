'use client';

import React, { useState } from 'react';
import { QrCode, Edit3, Check } from 'lucide-react';
import { CampaignQRCodeModal } from './CampaignQRCodeModal';

export interface CampaignImpactCard {
  svg: string;
  fileName: string;
}

export interface CampaignShareButtonsProps {
  campaignId: string;
  campaignName: string;
  description?: string;
  raisedAmount?: string;
  goalAmount?: string;
  shareUrl?: string;
  customShareMessage?: string;
}

export function buildCampaignShareMessage({
  campaignName,
  description,
  raisedAmount,
  goalAmount,
  customShareMessage,
}: Pick<CampaignShareButtonsProps, 'campaignName' | 'description' | 'raisedAmount' | 'goalAmount' | 'customShareMessage'>): string {
  if (customShareMessage && customShareMessage.trim().length > 0) {
    return customShareMessage.trim();
  }
  const progress = raisedAmount && goalAmount ? ` ${raisedAmount}/${goalAmount} raised.` : '';
  const impact = description ? ` ${description}` : '';
  return `Support ${campaignName}!${impact}${progress}`;
}

export function buildCampaignShareLinks(props: CampaignShareButtonsProps) {
  const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'https://fundable.example';
  const url = props.shareUrl ?? `${origin}/campaigns/${encodeURIComponent(props.campaignId)}`;
  const message = buildCampaignShareMessage(props);
  return {
    canonicalUrl: url,
    twitter: `https://twitter.com/intent/tweet?${new URLSearchParams({ text: message, url }).toString()}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?${new URLSearchParams({ u: url, quote: message }).toString()}`,
    whatsapp: `https://wa.me/?${new URLSearchParams({ text: `${message} ${url}` }).toString()}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?${new URLSearchParams({ url }).toString()}`,
  };
}

async function svgToPngBlob(svg: string): Promise<Blob> {
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const objectUrl = URL.createObjectURL(svgBlob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load impact card SVG'));
      img.src = objectUrl;
    });
    const width = image.naturalWidth || 1200;
    const height = image.naturalHeight || 630;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.drawImage(image, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to render impact card PNG'));
      }, 'image/png');
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export default function CampaignShareButtons(props: CampaignShareButtonsProps) {
  const [showQRModal, setShowQRModal] = useState(false);
  const [isEditingMessage, setIsEditingMessage] = useState(false);
  const [customMessage, setCustomMessage] = useState(props.customShareMessage || '');

  const effectiveProps: CampaignShareButtonsProps = {
    ...props,
    customShareMessage: customMessage,
  };

  const links = buildCampaignShareLinks(effectiveProps);
  const items = [
    { name: 'Twitter', href: links.twitter, className: 'bg-sky-500 hover:bg-sky-600' },
    { name: 'Facebook', href: links.facebook, className: 'bg-blue-600 hover:bg-blue-700' },
    { name: 'LinkedIn', href: links.linkedin, className: 'bg-blue-700 hover:bg-blue-800' },
    { name: 'WhatsApp', href: links.whatsapp, className: 'bg-green-600 hover:bg-green-700' },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div aria-label="Share campaign" className="flex flex-wrap items-center gap-2">
        {items.map((item) => (
          <a
            key={item.name}
            href={item.href}
            target="_blank"
            rel="noopener noreferrer"
            className={`rounded-md px-3 py-2 text-sm font-medium text-white transition-colors ${item.className}`}
          >
            Share on {item.name}
          </a>
        ))}
        <button
          type="button"
          aria-label="Customize share message"
          onClick={() => setIsEditingMessage(!isEditingMessage)}
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-700 transition-colors"
        >
          <Edit3 className="h-4 w-4 text-emerald-400" />
          Customize
        </button>

        <button
          type="button"
          aria-label="Download Campaign QR Code"
          onClick={() => setShowQRModal(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-700 transition-colors"
        >
          <QrCode className="h-4 w-4 text-purple-400" />
          QR Code
        </button>

        <CampaignQRCodeModal
          open={showQRModal}
          onOpenChange={setShowQRModal}
          campaignId={props.campaignId}
          campaignName={props.campaignName}
          canonicalUrl={links.canonicalUrl}
        />
      </div>

      {isEditingMessage && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/80 p-3 text-sm">
          <label htmlFor="custom-share-input" className="mb-1 block font-medium text-zinc-300">
            Customise Default Share Message:
          </label>
          <div className="flex gap-2">
            <input
              id="custom-share-input"
              type="text"
              value={customMessage}
              placeholder={buildCampaignShareMessage(props)}
              onChange={(e) => setCustomMessage(e.target.value)}
              className="flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-zinc-100 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setIsEditingMessage(false)}
              className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 font-medium text-white hover:bg-emerald-500"
            >
              <Check className="h-4 w-4" /> Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
