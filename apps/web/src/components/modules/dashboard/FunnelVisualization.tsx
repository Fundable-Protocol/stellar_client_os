'use client';

import { useMemo, useState } from 'react';
import { FunnelId, FunnelMetrics, getDropOffStep, getFunnelMetrics } from '@/lib/analytics/funnel';
import { cn } from '@/lib/utils';

const FUNNEL_LABELS: Record<FunnelId, string> = {
  'payment-stream': 'Payment Stream',
  distribution: 'Distribution',
  offramp: 'Offramp',
};

const FUNNEL_IDS: FunnelId[] = ['payment-stream', 'distribution', 'offramp'];

// ─── Single funnel panel ──────────────────────────────────────────────────────

function FunnelPanel({ metrics }: { metrics: FunnelMetrics }) {
  const dropOff = useMemo(() => getDropOffStep(metrics), [metrics]);
  const topCount = metrics.counts[metrics.steps[0]?.id] ?? 0;

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-5 flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
        {FUNNEL_LABELS[metrics.funnelId]}
      </h3>

      {topCount === 0 ? (
        <p className="text-xs text-zinc-500 italic">No data yet.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {metrics.steps.map((step, i) => {
            const count = metrics.counts[step.id] ?? 0;
            const rate = metrics.conversionRates[step.id] ?? 0;
            const dropRate = metrics.dropOffRates[step.id] ?? 0;
            const isWorst = dropOff?.id === step.id && i > 0 && dropRate > 0;
            const barWidth = `${Math.round(rate * 100)}%`;

            return (
              <li key={step.id} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-xs">
                  <span className={cn('text-zinc-300', isWorst && 'text-amber-400 font-medium')}>
                    {step.label}
                    {isWorst && (
                      <span className="ml-1 text-amber-400" aria-label="Highest drop-off">
                        ⚠
                      </span>
                    )}
                  </span>
                  <span className="text-zinc-400 tabular-nums">
                    {count.toLocaleString()} ({Math.round(rate * 100)}%)
                  </span>
                </div>

                {/* Progress bar */}
                <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-500',
                      isWorst ? 'bg-amber-500' : 'bg-indigo-500'
                    )}
                    style={{ width: barWidth }}
                    role="progressbar"
                    aria-valuenow={Math.round(rate * 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${step.label} conversion rate`}
                  />
                </div>

                {/* Drop-off indicator between steps */}
                {i > 0 && dropRate > 0 && (
                  <p className="text-[10px] text-zinc-500 text-right">
                    −{Math.round(dropRate * 100)}% drop-off
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

export interface FunnelVisualizationProps {
  /** Restrict to a single funnel; shows all three if omitted. */
  funnelId?: FunnelId;
  className?: string;
}

/**
 * Displays conversion funnel metrics for one or all flows.
 * Reads from localStorage via `getFunnelMetrics` – no server round-trip needed.
 */
export function FunnelVisualization({ funnelId, className }: FunnelVisualizationProps) {
  // Re-compute on every render so the panel reflects the latest tracked data.
  const ids = funnelId ? [funnelId] : FUNNEL_IDS;
  const allMetrics = ids.map(getFunnelMetrics);

  return (
    <section className={cn('flex flex-col gap-4', className)} aria-label="Conversion funnel metrics">
      <h2 className="text-base font-semibold text-white">Conversion Funnels</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {allMetrics.map((m) => (
          <FunnelPanel key={m.funnelId} metrics={m} />
        ))}
      </div>
    </section>
  );
}
