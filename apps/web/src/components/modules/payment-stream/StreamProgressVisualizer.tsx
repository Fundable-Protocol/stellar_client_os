"use client";

import { motion } from "framer-motion";
import { Activity, ArrowDownToLine, Clock, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useStreamProgress } from "@/hooks/use-stream-progress";

export interface StreamProgressVisualizerProps {
  /** Stream start time in milliseconds since epoch */
  startTime: number;
  /** Stream end time in milliseconds since epoch */
  endTime: number;
  totalAmount: string | number;
  withdrawnAmount?: string | number;
  tokenSymbol: string;
  status: string;
  isLoading?: boolean;
  className?: string;
}

const AMOUNT_PRECISION = 7;

const formatAmount = (value: number, precision = AMOUNT_PRECISION) =>
  value.toLocaleString("en-US", {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });

const formatRate = (value: number) =>
  value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });

function formatCountdown(totalSeconds: number): string {
  if (totalSeconds <= 0) return "Complete";

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function VisualizerSkeleton({ className }: { className?: string }) {
  return (
    <div
      data-testid="stream-visualizer-skeleton"
      className={cn(
        "w-full rounded-lg border border-zinc-700 bg-zinc-800/50 p-4 sm:p-6",
        className
      )}
    >
      <Skeleton className="h-4 w-32 bg-zinc-700" />
      <Skeleton className="mt-4 h-10 w-64 bg-zinc-700" />
      <Skeleton className="mt-6 h-3 w-full bg-zinc-700" />
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-20 bg-zinc-700" />
        <Skeleton className="h-20 bg-zinc-700" />
        <Skeleton className="h-20 bg-zinc-700" />
      </div>
    </div>
  );
}

export function StreamProgressVisualizer({
  startTime,
  endTime,
  totalAmount,
  withdrawnAmount = 0,
  tokenSymbol,
  status,
  isLoading = false,
  className,
}: StreamProgressVisualizerProps) {
  const normalizedStatus = status?.toLowerCase() ?? "";
  const isActive = normalizedStatus === "active";

  const progress = useStreamProgress({
    startTime,
    endTime,
    totalAmount,
    withdrawnAmount,
    isActive,
  });

  if (isLoading) {
    return <VisualizerSkeleton className={className} />;
  }

  if (!progress.isValid) {
    return (
      <div
        role="status"
        className={cn(
          "w-full rounded-lg border border-zinc-700 bg-zinc-800/50 p-4 text-sm text-zinc-400 sm:p-6",
          className
        )}
      >
        Stream progress is unavailable for this stream.
      </div>
    );
  }

  const isStreaming = isActive && progress.hasStarted && !progress.isComplete;

  return (
    <section
      aria-label="Real-time stream progress"
      className={cn(
        "w-full rounded-lg border border-zinc-700 bg-zinc-800/50 p-4 sm:p-6",
        className
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "relative flex h-2.5 w-2.5",
              !isStreaming && "opacity-50"
            )}
            aria-hidden="true"
          >
            {isStreaming && (
              <motion.span
                className="absolute inline-flex h-full w-full rounded-full bg-green-400"
                animate={{ scale: [1, 2.2, 1], opacity: [0.7, 0, 0.7] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
              />
            )}
            <span
              className={cn(
                "relative inline-flex h-2.5 w-2.5 rounded-full",
                isStreaming ? "bg-green-500" : "bg-zinc-500"
              )}
            />
          </span>
          <h3 className="text-sm font-medium text-zinc-300">
            {isStreaming ? "Streaming live" : "Stream paused"}
          </h3>
        </div>

        <span className="flex items-center gap-1.5 font-mono text-xs text-zinc-400">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          {formatCountdown(progress.secondsRemaining)}
        </span>
      </header>

      <div className="mt-5">
        <p className="text-xs uppercase tracking-wide text-zinc-500">
          Streamed so far
        </p>
        <p
          aria-live={isStreaming ? "off" : undefined}
          className="mt-1 flex flex-wrap items-baseline gap-2 font-mono text-2xl font-semibold tabular-nums text-zinc-50 sm:text-3xl"
        >
          <span data-testid="streamed-amount">
            {formatAmount(progress.streamed)}
          </span>
          <span className="text-sm font-medium text-zinc-400">{tokenSymbol}</span>
          <span className="text-sm font-medium text-zinc-500">
            of {formatAmount(progress.total, 2)}
          </span>
        </p>
      </div>

      <div className="mt-5">
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress.streamedPercent)}
          aria-label="Percentage of the stream released"
          className="relative h-3 w-full overflow-hidden rounded-full bg-zinc-700"
        >
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-purple-500 to-blue-500"
            initial={false}
            animate={{ width: `${progress.streamedPercent}%` }}
            transition={{ ease: "linear", duration: 0.15 }}
          />
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-blue-400/70"
            style={{ width: `${progress.withdrawnPercent}%` }}
            aria-hidden="true"
          />
        </div>

        <div className="mt-2 flex items-center justify-between font-mono text-[11px] text-zinc-400">
          <span>{progress.streamedPercent.toFixed(2)}% released</span>
          <span>{progress.withdrawnPercent.toFixed(2)}% withdrawn</span>
        </div>
      </div>

      <dl className="mt-6 grid gap-3 sm:grid-cols-3">
        <StatCard
          icon={<Wallet className="h-4 w-4 text-green-400" aria-hidden="true" />}
          label="Available to withdraw"
          value={`${formatAmount(progress.available, 4)} ${tokenSymbol}`}
        />
        <StatCard
          icon={
            <ArrowDownToLine
              className="h-4 w-4 text-blue-400"
              aria-hidden="true"
            />
          }
          label="Already withdrawn"
          value={`${formatAmount(progress.withdrawn, 4)} ${tokenSymbol}`}
        />
        <StatCard
          icon={
            <Activity className="h-4 w-4 text-purple-400" aria-hidden="true" />
          }
          label="Release rate"
          value={`${formatRate(progress.ratePerHour)} ${tokenSymbol}/hr`}
          hint={`${formatRate(progress.ratePerDay)} ${tokenSymbol}/day`}
        />
      </dl>
    </section>
  );
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}

function StatCard({ icon, label, value, hint }: StatCardProps) {
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900/40 p-3 transition-colors hover:border-zinc-600">
      <dt className="flex items-center gap-2 text-xs text-zinc-400">
        {icon}
        {label}
      </dt>
      <dd className="mt-2 break-all font-mono text-sm font-medium text-zinc-100">
        {value}
      </dd>
      {hint && <p className="mt-1 font-mono text-[11px] text-zinc-500">{hint}</p>}
    </div>
  );
}

export default StreamProgressVisualizer;
