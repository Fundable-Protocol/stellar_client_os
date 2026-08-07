"use client";

import { useEffect, useMemo, useState } from "react";

export interface UseStreamProgressOptions {
  /** Stream start time in milliseconds since epoch */
  startTime: number;
  /** Stream end time in milliseconds since epoch */
  endTime: number;
  totalAmount: string | number;
  withdrawnAmount?: string | number;
  /** Live ticking is skipped for streams that are not actively releasing value */
  isActive?: boolean;
  /** Recompute interval — 100ms keeps the counter visibly moving without churn */
  tickMs?: number;
}

export interface StreamProgress {
  total: number;
  streamed: number;
  withdrawn: number;
  /** Streamed but not yet withdrawn — what the recipient can claim now */
  available: number;
  remaining: number;
  streamedPercent: number;
  withdrawnPercent: number;
  ratePerSecond: number;
  ratePerHour: number;
  ratePerDay: number;
  secondsRemaining: number;
  hasStarted: boolean;
  isComplete: boolean;
  isValid: boolean;
}

const EMPTY_PROGRESS: StreamProgress = {
  total: 0,
  streamed: 0,
  withdrawn: 0,
  available: 0,
  remaining: 0,
  streamedPercent: 0,
  withdrawnPercent: 0,
  ratePerSecond: 0,
  ratePerHour: 0,
  ratePerDay: 0,
  secondsRemaining: 0,
  hasStarted: false,
  isComplete: false,
  isValid: false,
};

const toNumber = (value: string | number | undefined): number => {
  const parsed = typeof value === "number" ? value : parseFloat(value ?? "0");
  return Number.isFinite(parsed) ? parsed : NaN;
};

export function computeStreamProgress(
  options: UseStreamProgressOptions,
  now: number
): StreamProgress {
  const { startTime, endTime } = options;
  const total = toNumber(options.totalAmount);
  const withdrawnRaw = toNumber(options.withdrawnAmount ?? 0);
  const duration = endTime - startTime;

  const isValid =
    Number.isFinite(startTime) &&
    Number.isFinite(endTime) &&
    Number.isFinite(total) &&
    Number.isFinite(withdrawnRaw) &&
    total > 0 &&
    duration > 0;

  if (!isValid) return EMPTY_PROGRESS;

  const elapsed = Math.min(Math.max(now - startTime, 0), duration);
  const streamed = (total * elapsed) / duration;
  const withdrawn = Math.min(total, Math.max(0, withdrawnRaw));
  const ratePerSecond = total / (duration / 1000);

  return {
    total,
    streamed,
    withdrawn,
    available: Math.max(0, streamed - withdrawn),
    remaining: Math.max(0, total - streamed),
    streamedPercent: Math.min(100, Math.max(0, (streamed / total) * 100)),
    withdrawnPercent: Math.min(100, Math.max(0, (withdrawn / total) * 100)),
    ratePerSecond,
    ratePerHour: ratePerSecond * 3600,
    ratePerDay: ratePerSecond * 86400,
    secondsRemaining: Math.max(0, Math.ceil((endTime - now) / 1000)),
    hasStarted: now >= startTime,
    isComplete: now >= endTime,
    isValid: true,
  };
}

/**
 * Recomputes the released balance on a fixed tick so the visualizer can show
 * value accruing in real time instead of only on refetch.
 */
export function useStreamProgress(
  options: UseStreamProgressOptions
): StreamProgress {
  const { isActive = true, tickMs = 100, startTime, endTime } = options;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isActive) return;

    const interval = setInterval(() => {
      const current = Date.now();
      setNow(current);
      // Nothing left to accrue once the stream ends — stop burning frames.
      if (current >= endTime) clearInterval(interval);
    }, tickMs);

    return () => clearInterval(interval);
  }, [isActive, tickMs, endTime]);

  return useMemo(
    () =>
      computeStreamProgress(
        {
          startTime,
          endTime,
          totalAmount: options.totalAmount,
          withdrawnAmount: options.withdrawnAmount,
        },
        now
      ),
    [now, startTime, endTime, options.totalAmount, options.withdrawnAmount]
  );
}
