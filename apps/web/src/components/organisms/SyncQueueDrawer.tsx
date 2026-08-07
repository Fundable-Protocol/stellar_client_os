"use client";

/**
 * SyncQueueDrawer — Action drawer listing pending sync items (issue #528)
 *
 * Slides up from the bottom on mobile / in from the right on desktop,
 * showing all items in the sync queue with their status and a per-item
 * retry action. Uses the existing Sheet component from the design system.
 *
 * Accessibility:
 *   - Drawer is a dialog (role="dialog") with a labelled title
 *   - Each status badge uses aria-label for screen readers
 *   - Empty state has a descriptive paragraph
 *   - All action buttons have accessible labels
 */

import React from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import type { SyncQueueItem, SyncQueueState } from "@/hooks/use-sync-queue";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SyncQueueDrawerProps {
  open: boolean;
  onClose: () => void;
  syncQueue: Pick<
    SyncQueueState,
    | "queue"
    | "pendingCount"
    | "isSyncing"
    | "isOnline"
    | "retryAll"
    | "retryItem"
    | "remove"
    | "clearSynced"
    | "clearAll"
  >;
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: SyncQueueItem["status"] }) {
  const config = {
    pending: {
      icon: Clock,
      label: "Pending",
      className: "bg-amber-900/50 text-amber-300 border-amber-700/50",
      spin: false,
    },
    syncing: {
      icon: Loader2,
      label: "Syncing",
      className: "bg-purple-900/50 text-purple-300 border-purple-700/50",
      spin: true,
    },
    synced: {
      icon: CheckCircle2,
      label: "Synced",
      className: "bg-emerald-900/50 text-emerald-300 border-emerald-700/50",
      spin: false,
    },
    failed: {
      icon: AlertCircle,
      label: "Failed",
      className: "bg-red-900/50 text-red-300 border-red-700/50",
      spin: false,
    },
  }[status];

  const Icon = config.icon;

  return (
    <span
      aria-label={`Status: ${config.label}`}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        config.className
      )}
    >
      <Icon aria-hidden="true" className={cn("h-3 w-3", config.spin && "animate-spin")} />
      {config.label}
    </span>
  );
}

// ── Queue item row ────────────────────────────────────────────────────────────

function QueueItemRow({
  item,
  onRetry,
  onRemove,
  isOnline,
}: {
  item: SyncQueueItem;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  isOnline: boolean;
}) {
  return (
    <li
      className={cn(
        "flex items-start gap-3 rounded-lg border p-3 transition-colors",
        "border-white/10 bg-white/5 hover:bg-white/[0.07]"
      )}
    >
      {/* Icon */}
      <UploadCloud
        aria-hidden="true"
        className={cn(
          "mt-0.5 h-5 w-5 shrink-0",
          item.status === "synced" ? "text-emerald-400" :
          item.status === "failed" ? "text-red-400" :
          item.status === "syncing" ? "text-purple-400" :
          "text-amber-400"
        )}
      />

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-sm font-medium text-white">{item.label}</p>
          <StatusBadge status={item.status} />
        </div>

        {item.description && (
          <p className="mt-0.5 truncate text-xs text-white/50">{item.description}</p>
        )}

        {item.error && item.status === "failed" && (
          <p className="mt-1 text-xs text-red-400" role="alert">
            {item.error}
          </p>
        )}

        <div className="mt-1.5 flex items-center gap-2">
          <p className="text-xs text-white/40">
            {new Date(item.enqueuedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
          {item.retryCount > 0 && (
            <p className="text-xs text-white/40">
              · {item.retryCount} retr{item.retryCount === 1 ? "y" : "ies"}
            </p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1">
        {(item.status === "pending" || item.status === "failed") && isOnline && (
          <button
            type="button"
            onClick={() => onRetry(item.id)}
            aria-label={`Retry syncing ${item.label}`}
            className={cn(
              "rounded-md p-1.5 text-white/50 hover:text-white",
              "hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2",
              "focus-visible:ring-white/30 transition-all duration-150",
              "disabled:cursor-not-allowed disabled:opacity-40"
            )}
          >
            <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        )}
        {item.status !== "syncing" && (
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            aria-label={`Remove ${item.label} from queue`}
            className={cn(
              "rounded-md p-1.5 text-white/30 hover:text-red-400",
              "hover:bg-red-400/10 focus-visible:outline-none focus-visible:ring-2",
              "focus-visible:ring-red-400/30 transition-all duration-150"
            )}
          >
            <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </li>
  );
}

// ── Main drawer component ─────────────────────────────────────────────────────

export function SyncQueueDrawer({ open, onClose, syncQueue }: SyncQueueDrawerProps) {
  const {
    queue,
    pendingCount,
    isSyncing,
    isOnline,
    retryAll,
    retryItem,
    remove,
    clearSynced,
    clearAll,
  } = syncQueue;

  const hasSynced = queue.some((i) => i.status === "synced");
  const hasRetryable = queue.some((i) => i.status === "pending" || i.status === "failed");

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="bottom"
        className={cn(
          "max-h-[85dvh] rounded-t-2xl border-white/10",
          "bg-fundable-dark text-white",
          "flex flex-col gap-0 p-0",
          // Desktop: slide in from right instead
          "sm:side-right sm:max-h-full sm:rounded-none sm:rounded-l-2xl",
          "sm:w-[420px] sm:max-w-[420px]"
        )}
        aria-label="Sync queue"
      >
        {/* Header */}
        <SheetHeader className="border-b border-white/10 px-4 py-4">
          <div className="flex items-center gap-2">
            <UploadCloud aria-hidden="true" className="h-5 w-5 text-fundable-purple-2" />
            <SheetTitle className="text-base text-white">Sync Queue</SheetTitle>
            {pendingCount > 0 && (
              <span
                aria-label={`${pendingCount} pending`}
                className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-fundable-purple-2 px-1.5 text-xs font-bold text-white"
              >
                {pendingCount}
              </span>
            )}
          </div>
          <SheetDescription className="text-sm text-white/50">
            {queue.length === 0
              ? "No uploads in queue."
              : isOnline
              ? `${pendingCount} pending · ${queue.filter((i) => i.status === "synced").length} synced`
              : `Offline — ${pendingCount} upload${pendingCount !== 1 ? "s" : ""} waiting`}
          </SheetDescription>
        </SheetHeader>

        {/* Queue list */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {queue.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <CheckCircle2 aria-hidden="true" className="h-10 w-10 text-emerald-500/50" />
              <p className="text-sm text-white/50">
                All uploads are synced. Nothing pending.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2" aria-label="Pending upload items">
              {queue.map((item) => (
                <QueueItemRow
                  key={item.id}
                  item={item}
                  onRetry={retryItem}
                  onRemove={remove}
                  isOnline={isOnline}
                />
              ))}
            </ul>
          )}
        </div>

        {/* Footer actions */}
        {queue.length > 0 && (
          <SheetFooter className="border-t border-white/10 px-4 py-3">
            <div className="flex w-full flex-wrap gap-2">
              {hasRetryable && isOnline && (
                <Button
                  variant="gradient"
                  size="sm"
                  onClick={retryAll}
                  disabled={isSyncing}
                  className="flex-1"
                  aria-label="Retry all pending and failed uploads"
                >
                  <RefreshCw
                    aria-hidden="true"
                    className={cn("h-4 w-4", isSyncing && "animate-spin")}
                  />
                  {isSyncing ? "Syncing…" : "Retry all"}
                </Button>
              )}
              {hasSynced && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearSynced}
                  className="flex-1 border-white/10 bg-transparent text-white/70 hover:bg-white/10 hover:text-white"
                  aria-label="Clear synced uploads from queue"
                >
                  Clear synced
                </Button>
              )}
              {queue.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAll}
                  className="text-white/30 hover:bg-red-500/10 hover:text-red-400"
                  aria-label="Clear all items from queue"
                >
                  Clear all
                </Button>
              )}
            </div>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default SyncQueueDrawer;
