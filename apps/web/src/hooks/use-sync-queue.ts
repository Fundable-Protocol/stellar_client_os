"use client";

/**
 * useSyncQueue — Offline-first PWA sync queue hook (issue #528)
 *
 * Manages a queue of pending evidence uploads that could not be submitted
 * while the user was offline. Provides:
 *   - Real-time online/offline detection
 *   - Queue CRUD (add, remove, clear)
 *   - Automatic retry when the connection is restored
 *   - Manual retry trigger
 *   - Per-item status tracking (pending | syncing | synced | failed)
 *
 * Persistence: the queue is stored in localStorage so it survives page
 * refreshes. The key is configurable via the `storageKey` option.
 *
 * @example
 * ```tsx
 * const { queue, pendingCount, isOnline, retryAll } = useSyncQueue();
 * ```
 */

import { useCallback, useEffect, useRef, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export type SyncItemStatus = "pending" | "syncing" | "synced" | "failed";

export interface SyncQueueItem {
  /** Unique identifier for this queue item. */
  id: string;
  /** Human-readable label shown in the action drawer. */
  label: string;
  /** Optional description (file name, stream id, etc.). */
  description?: string;
  /** Current sync status. */
  status: SyncItemStatus;
  /** Unix timestamp (ms) when the item was enqueued. */
  enqueuedAt: number;
  /** Unix timestamp (ms) of the last retry attempt. */
  lastAttemptAt?: number;
  /** Number of retry attempts so far. */
  retryCount: number;
  /** Error message from the last failed attempt. */
  error?: string;
}

export interface SyncQueueOptions {
  /** localStorage key for queue persistence. Default: "fundable_sync_queue" */
  storageKey?: string;
  /** Maximum number of auto-retry attempts per item. Default: 3 */
  maxRetries?: number;
  /**
   * Async function that performs the actual sync operation for a single item.
   * Return `true` on success, throw or return `false` on failure.
   */
  onSync?: (item: SyncQueueItem) => Promise<boolean>;
  /** Called when an item syncs successfully. */
  onSyncSuccess?: (item: SyncQueueItem) => void;
  /** Called when an item fails after all retries. */
  onSyncFailure?: (item: SyncQueueItem, error: string) => void;
}

export interface SyncQueueState {
  /** All items in the queue (all statuses). */
  queue: SyncQueueItem[];
  /** Items still waiting to be synced. */
  pendingItems: SyncQueueItem[];
  /** Items currently being synced. */
  syncingItems: SyncQueueItem[];
  /** Items that failed after all retries. */
  failedItems: SyncQueueItem[];
  /** Items successfully synced. */
  syncedItems: SyncQueueItem[];
  /** Number of pending + failed items. */
  pendingCount: number;
  /** Whether any items are actively syncing. */
  isSyncing: boolean;
  /** Whether the browser is currently online. */
  isOnline: boolean;
  /** Add a new item to the sync queue. */
  enqueue: (item: Omit<SyncQueueItem, "id" | "status" | "enqueuedAt" | "retryCount">) => void;
  /** Remove a specific item from the queue. */
  remove: (id: string) => void;
  /** Retry all pending and failed items immediately. */
  retryAll: () => Promise<void>;
  /** Retry a single item. */
  retryItem: (id: string) => Promise<void>;
  /** Clear all synced items from the queue. */
  clearSynced: () => void;
  /** Clear the entire queue (pending, failed, synced). */
  clearAll: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_STORAGE_KEY = "fundable_sync_queue";
const DEFAULT_MAX_RETRIES = 3;

// ── UUID helper ───────────────────────────────────────────────────────────────

function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ── Queue persistence ─────────────────────────────────────────────────────────

function loadQueue(storageKey: string): SyncQueueItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SyncQueueItem[];
    // Reset any "syncing" items back to "pending" (interrupted mid-sync)
    return parsed.map((item) =>
      item.status === "syncing" ? { ...item, status: "pending" } : item
    );
  } catch {
    return [];
  }
}

function saveQueue(storageKey: string, queue: SyncQueueItem[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(queue));
  } catch {
    // localStorage unavailable (private mode, quota exceeded) — silently skip
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useSyncQueue(options: SyncQueueOptions = {}): SyncQueueState {
  const {
    storageKey = DEFAULT_STORAGE_KEY,
    maxRetries = DEFAULT_MAX_RETRIES,
    onSync,
    onSyncSuccess,
    onSyncFailure,
  } = options;

  const [queue, setQueue] = useState<SyncQueueItem[]>(() => loadQueue(storageKey));
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  // Use a ref so retryAll/retryItem closures always see the latest queue
  const queueRef = useRef(queue);
  queueRef.current = queue;

  // ── Persist on every change ───────────────────────────────────────────────
  useEffect(() => {
    saveQueue(storageKey, queue);
  }, [queue, storageKey]);

  // ── Online / offline detection ────────────────────────────────────────────
  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    update();
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // ── Auto-retry when coming back online ───────────────────────────────────
  useEffect(() => {
    if (!isOnline) return;
    const hasPending = queueRef.current.some(
      (item) => item.status === "pending" || item.status === "failed"
    );
    if (hasPending && onSync) {
      retryAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  // ── Queue mutations ───────────────────────────────────────────────────────

  const enqueue = useCallback(
    (item: Omit<SyncQueueItem, "id" | "status" | "enqueuedAt" | "retryCount">) => {
      const newItem: SyncQueueItem = {
        ...item,
        id: generateId(),
        status: "pending",
        enqueuedAt: Date.now(),
        retryCount: 0,
      };
      setQueue((prev) => [...prev, newItem]);
    },
    []
  );

  const remove = useCallback((id: string) => {
    setQueue((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clearSynced = useCallback(() => {
    setQueue((prev) => prev.filter((item) => item.status !== "synced"));
  }, []);

  const clearAll = useCallback(() => {
    setQueue([]);
  }, []);

  // ── Sync a single item ────────────────────────────────────────────────────

  const syncItem = useCallback(
    async (id: string): Promise<void> => {
      if (!onSync) return;

      const item = queueRef.current.find((i) => i.id === id);
      if (!item || item.status === "syncing" || item.status === "synced") return;

      // Mark as syncing
      setQueue((prev) =>
        prev.map((i) =>
          i.id === id
            ? { ...i, status: "syncing", lastAttemptAt: Date.now() }
            : i
        )
      );

      try {
        const success = await onSync({ ...item, status: "syncing" });
        if (success) {
          setQueue((prev) =>
            prev.map((i) => (i.id === id ? { ...i, status: "synced", error: undefined } : i))
          );
          onSyncSuccess?.({ ...item, status: "synced" });
        } else {
          throw new Error("Sync returned false");
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Sync failed";
        const newRetryCount = item.retryCount + 1;
        const isFinal = newRetryCount >= maxRetries;

        setQueue((prev) =>
          prev.map((i) =>
            i.id === id
              ? {
                  ...i,
                  status: isFinal ? "failed" : "pending",
                  retryCount: newRetryCount,
                  error: errorMessage,
                }
              : i
          )
        );

        if (isFinal) {
          onSyncFailure?.({ ...item, status: "failed", error: errorMessage }, errorMessage);
        }
      }
    },
    [maxRetries, onSync, onSyncSuccess, onSyncFailure]
  );

  const retryAll = useCallback(async (): Promise<void> => {
    const retryable = queueRef.current.filter(
      (item) => item.status === "pending" || item.status === "failed"
    );
    // Reset failed items back to pending before retrying
    setQueue((prev) =>
      prev.map((item) =>
        item.status === "failed" ? { ...item, status: "pending", retryCount: 0, error: undefined } : item
      )
    );
    await Promise.allSettled(retryable.map((item) => syncItem(item.id)));
  }, [syncItem]);

  const retryItem = useCallback(
    async (id: string): Promise<void> => {
      // Reset to pending first
      setQueue((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, status: "pending", error: undefined } : item
        )
      );
      await syncItem(id);
    },
    [syncItem]
  );

  // ── Derived state ─────────────────────────────────────────────────────────

  const pendingItems = queue.filter((i) => i.status === "pending");
  const syncingItems = queue.filter((i) => i.status === "syncing");
  const failedItems = queue.filter((i) => i.status === "failed");
  const syncedItems = queue.filter((i) => i.status === "synced");

  return {
    queue,
    pendingItems,
    syncingItems,
    failedItems,
    syncedItems,
    pendingCount: pendingItems.length + failedItems.length,
    isSyncing: syncingItems.length > 0,
    isOnline,
    enqueue,
    remove,
    retryAll,
    retryItem,
    clearSynced,
    clearAll,
  };
}
