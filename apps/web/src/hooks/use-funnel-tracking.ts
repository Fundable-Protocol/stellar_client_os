'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  FunnelId,
  FunnelMetrics,
  getFunnelMetrics,
  trackFunnelStep,
} from '@/lib/analytics/funnel';

/** Stable session ID scoped to the browser tab. */
function getSessionId(): string {
  if (typeof window === 'undefined') return 'ssr';
  const key = 'fundable:session_id';
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(key, id);
  }
  return id;
}

export interface UseFunnelTrackingReturn {
  /** Record that the current session reached a step. */
  track: (stepId: string) => void;
  /** Current aggregated metrics for this funnel. */
  metrics: FunnelMetrics;
}

/**
 * Hook for tracking user progress through a named conversion funnel.
 *
 * @example
 * const { track } = useFunnelTracking('payment-stream');
 * // call track('form_start') when the user opens the form
 */
export function useFunnelTracking(funnelId: FunnelId): UseFunnelTrackingReturn {
  const sessionId = useRef(getSessionId());

  const track = useCallback(
    (stepId: string) => {
      trackFunnelStep(funnelId, stepId, sessionId.current);
    },
    [funnelId]
  );

  // Compute metrics on every render so callers always see fresh data.
  // This is cheap (just reads localStorage) and avoids extra state.
  const metrics = useMemo(() => getFunnelMetrics(funnelId), [funnelId]);

  return { track, metrics };
}

/**
 * Convenience hook that automatically tracks `form_start` on mount.
 */
export function useFunnelTrackingWithAutoStart(
  funnelId: FunnelId
): UseFunnelTrackingReturn {
  const result = useFunnelTracking(funnelId);

  useEffect(() => {
    result.track('form_start');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [funnelId]);

  return result;
}
