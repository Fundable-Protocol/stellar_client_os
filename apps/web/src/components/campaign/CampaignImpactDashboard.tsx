'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useImpactCounter } from '@/hooks/useImpactCounter';
import { buildImpactCardSvg } from '@/lib/funding-counter';

export interface ImpactMetric {
  name: string;
  unit: string;
  /** Amount raised per unit of impact (cost per unit). */
  costPerUnit: number;
}

export interface CampaignImpactDashboardProps {
  campaignId: string;
  campaignName: string;
  impactMetric: ImpactMetric;
  /** Optional total amount raised in the campaign's currency. */
  amountRaised?: number;
  className?: string;
}

function formatImpactValue(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

async function svgToPngBlob(svg: string, width: number, height: number): Promise<Blob> {
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load impact card SVG'));
      img.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Unable to create canvas context');
    }
    ctx.drawImage(image, 0, 0, width, height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to rasterize impact card'));
      }, 'image/png');
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function CampaignImpactDashboard({
  campaignId,
  campaignName,
  impactMetric,
  amountRaised = 0,
  className,
}: CampaignImpactDashboardProps) {
  const { value: animatedValue, targetValue } = useImpactCounter({
    amountRaised,
    costPerUnit: impactMetric.costPerUnit,
  });

  const [isSharing, setIsSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleShare = useCallback(async () => {
    setIsSharing(true);
    setShareError(null);

    try {
      const svg = buildImpactCardSvg({
        campaignName,
        metricName: impactMetric.name,
        unit: impactMetric.unit,
        impactValue: targetValue,
        formattedValue: formatImpactValue(targetValue),
      });

      const width = 1200;
      const height = 630;
      const pngBlob = await svgToPngBlob(svg, width, height);
      const filename = `${campaignId}-impact-card.png`;
      const file = new File([pngBlob], filename, { type: 'image/png' });

      const shareData: ShareData = {
        title: `${campaignName} — Impact`,
        text: `We've generated ${formatImpactValue(targetValue)} ${impactMetric.unit} of ${impactMetric.name} so far!`,
        files: [file],
      };

      const canShare =
        typeof navigator !== 'undefined' &&
        typeof navigator.canShare === 'function' &&
        typeof navigator.share === 'function' &&
        navigator.canShare({ files: [file] });

      if (canShare) {
        await navigator.share(shareData);
      } else {
        triggerDownload(pngBlob, filename);
      }
    } catch (err) {
      if (mountedRef.current) {
        const message =
          err instanceof Error ? err.message : 'Unable to share impact card';
        // Ignore user-cancelled shares.
        if (!/abort|cancel/i.test(message)) {
          setShareError(message);
        }
      }
    } finally {
      if (mountedRef.current) {
        setIsSharing(false);
      }
    }
  }, [campaignId, campaignName, impactMetric.name, impactMetric.unit, targetValue]);

  return (
    <section
      className={className}
      aria-label={`${campaignName} impact dashboard`}
      data-campaign-id={campaignId}
    >
      <div>
        <h2>{impactMetric.name}</h2>
        <p>
          Every {impactMetric.costPerUnit.toLocaleString()} raised creates 1{' '}
          {impactMetric.unit}
        </p>
      </div>

      <div aria-live="polite" aria-atomic="true">
        <span data-testid="impact-counter-value">
          {formatImpactValue(animatedValue)}
        </span>{' '}
        <span>{impactMetric.unit}</span>
      </div>

      <button
        type="button"
        onClick={handleShare}
        disabled={isSharing}
        aria-busy={isSharing}
      >
        {isSharing ? 'Preparing card…' : 'Share impact card'}
      </button>

      {shareError ? (
        <p role="alert" data-testid="impact-share-error">
          {shareError}
        </p>
      ) : null}
    </section>
  );
}

export default CampaignImpactDashboard;