/**
 * Conversion funnel tracking utility.
 * Stores metrics in memory (and optionally localStorage) and dispatches
 * custom events so external analytics tools can subscribe.
 */

export type FunnelId = 'payment-stream' | 'distribution' | 'offramp';

export interface FunnelStep {
  id: string;
  label: string;
  order: number;
}

export interface StepEvent {
  funnelId: FunnelId;
  stepId: string;
  timestamp: number;
  sessionId: string;
}

export interface FunnelMetrics {
  funnelId: FunnelId;
  steps: FunnelStep[];
  /** Number of sessions that reached each step */
  counts: Record<string, number>;
  /** Conversion rate from first step to each step (0–1) */
  conversionRates: Record<string, number>;
  /** Drop-off rate between consecutive steps (0–1) */
  dropOffRates: Record<string, number>;
}

// ─── Step definitions ────────────────────────────────────────────────────────

export const FUNNEL_STEPS: Record<FunnelId, FunnelStep[]> = {
  'payment-stream': [
    { id: 'form_start', label: 'Form Started', order: 0 },
    { id: 'form_filled', label: 'Form Filled', order: 1 },
    { id: 'review', label: 'Review', order: 2 },
    { id: 'confirmed', label: 'Confirmed', order: 3 },
    { id: 'completed', label: 'Completed', order: 4 },
  ],
  distribution: [
    { id: 'form_start', label: 'Form Started', order: 0 },
    { id: 'recipients_added', label: 'Recipients Added', order: 1 },
    { id: 'review', label: 'Review', order: 2 },
    { id: 'confirmed', label: 'Confirmed', order: 3 },
    { id: 'completed', label: 'Completed', order: 4 },
  ],
  offramp: [
    { id: 'form_start', label: 'Form Started', order: 0 },
    { id: 'quote_requested', label: 'Quote Requested', order: 1 },
    { id: 'quote_accepted', label: 'Quote Accepted', order: 2 },
    { id: 'bridge_initiated', label: 'Bridge Initiated', order: 3 },
    { id: 'completed', label: 'Completed', order: 4 },
  ],
};

// ─── Storage key ─────────────────────────────────────────────────────────────

const STORAGE_KEY = 'fundable:funnel_counts';

function loadCounts(): Record<string, Record<string, number>> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function saveCounts(all: Record<string, Record<string, number>>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // storage quota exceeded – ignore
  }
}

// ─── Core tracking ───────────────────────────────────────────────────────────

/**
 * Record that a session reached `stepId` in `funnelId`.
 * Emits a `fundable:funnel_step` CustomEvent for external listeners.
 */
export function trackFunnelStep(
  funnelId: FunnelId,
  stepId: string,
  sessionId: string
): void {
  const all = loadCounts();
  if (!all[funnelId]) all[funnelId] = {};
  all[funnelId][stepId] = (all[funnelId][stepId] ?? 0) + 1;
  saveCounts(all);

  if (typeof window !== 'undefined') {
    const event: StepEvent = { funnelId, stepId, timestamp: Date.now(), sessionId };
    window.dispatchEvent(new CustomEvent('fundable:funnel_step', { detail: event }));
  }
}

/**
 * Compute metrics for a given funnel from stored counts.
 */
export function getFunnelMetrics(funnelId: FunnelId): FunnelMetrics {
  const steps = FUNNEL_STEPS[funnelId];
  const all = loadCounts();
  const counts = all[funnelId] ?? {};

  const topCount = counts[steps[0]?.id] ?? 0;

  const conversionRates: Record<string, number> = {};
  const dropOffRates: Record<string, number> = {};

  steps.forEach((step, i) => {
    const count = counts[step.id] ?? 0;
    conversionRates[step.id] = topCount > 0 ? count / topCount : 0;

    if (i > 0) {
      const prevCount = counts[steps[i - 1].id] ?? 0;
      dropOffRates[step.id] = prevCount > 0 ? 1 - count / prevCount : 0;
    } else {
      dropOffRates[step.id] = 0;
    }
  });

  return { funnelId, steps, counts, conversionRates, dropOffRates };
}

/**
 * Returns the step with the highest drop-off rate (i.e. the bottleneck).
 */
export function getDropOffStep(metrics: FunnelMetrics): FunnelStep | null {
  let worst: FunnelStep | null = null;
  let worstRate = -1;

  metrics.steps.forEach((step) => {
    const rate = metrics.dropOffRates[step.id] ?? 0;
    if (rate > worstRate) {
      worstRate = rate;
      worst = step;
    }
  });

  return worst;
}

/** Reset stored counts (useful for testing). */
export function resetFunnelCounts(funnelId?: FunnelId): void {
  const all = loadCounts();
  if (funnelId) {
    delete all[funnelId];
  } else {
    Object.keys(all).forEach((k) => delete all[k]);
  }
  saveCounts(all);
}
