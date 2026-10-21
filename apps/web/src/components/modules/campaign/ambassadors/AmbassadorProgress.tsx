"use client";

/** A thin progress bar used to show an ambassador's progress to the next tier. */

export interface ProgressProps {
  /** Completion between 0 and 1. */
  value: number;
  className?: string;
  "aria-label"?: string;
}

export function Progress({ value, className = "", "aria-label": ariaLabel }: ProgressProps) {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  const percent = Math.round(clamped * 100);

  return (
    <div
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel ?? "Progress"}
      className={`h-1.5 w-full overflow-hidden rounded-full bg-zinc-800 ${className}`}
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-purple-500 to-emerald-500 transition-all"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

export default Progress;
