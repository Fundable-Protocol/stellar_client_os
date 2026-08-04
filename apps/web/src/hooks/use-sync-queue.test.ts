// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSyncQueue } from "./use-sync-queue";

// ── localStorage mock ─────────────────────────────────────────────────────────

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(window, "localStorage", { value: localStorageMock });

function setOnlineStatus(online: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value: online,
  });
}

beforeEach(() => {
  localStorageMock.clear();
  setOnlineStatus(true);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  setOnlineStatus(true);
});

// ── enqueue ───────────────────────────────────────────────────────────────────

describe("useSyncQueue — enqueue", () => {
  it("adds an item to the queue with pending status", () => {
    const { result } = renderHook(() =>
      useSyncQueue({ storageKey: "test_queue_enqueue" })
    );
    act(() => {
      result.current.enqueue({ label: "Photo 1" });
    });
    expect(result.current.queue).toHaveLength(1);
    expect(result.current.queue[0].status).toBe("pending");
    expect(result.current.queue[0].label).toBe("Photo 1");
  });

  it("assigns a unique id to each item", () => {
    const { result } = renderHook(() =>
      useSyncQueue({ storageKey: "test_queue_ids" })
    );
    act(() => {
      result.current.enqueue({ label: "A" });
      result.current.enqueue({ label: "B" });
    });
    const ids = result.current.queue.map((i) => i.id);
    expect(new Set(ids).size).toBe(2);
  });

  it("sets retryCount to 0 on initial enqueue", () => {
    const { result } = renderHook(() =>
      useSyncQueue({ storageKey: "test_queue_retry_init" })
    );
    act(() => { result.current.enqueue({ label: "C" }); });
    expect(result.current.queue[0].retryCount).toBe(0);
  });

  it("increments pendingCount correctly", () => {
    const { result } = renderHook(() =>
      useSyncQueue({ storageKey: "test_queue_pending_count" })
    );
    expect(result.current.pendingCount).toBe(0);
    act(() => { result.current.enqueue({ label: "X" }); });
    expect(result.current.pendingCount).toBe(1);
    act(() => { result.current.enqueue({ label: "Y" }); });
    expect(result.current.pendingCount).toBe(2);
  });
});

// ── remove ────────────────────────────────────────────────────────────────────

describe("useSyncQueue — remove", () => {
  it("removes an item by id", () => {
    const { result } = renderHook(() =>
      useSyncQueue({ storageKey: "test_queue_remove" })
    );
    act(() => { result.current.enqueue({ label: "Del me" }); });
    const id = result.current.queue[0].id;
    act(() => { result.current.remove(id); });
    expect(result.current.queue).toHaveLength(0);
  });

  it("leaves other items untouched", () => {
    const { result } = renderHook(() =>
      useSyncQueue({ storageKey: "test_queue_remove_other" })
    );
    act(() => {
      result.current.enqueue({ label: "Keep" });
      result.current.enqueue({ label: "Delete" });
    });
    const deleteId = result.current.queue[1].id;
    act(() => { result.current.remove(deleteId); });
    expect(result.current.queue).toHaveLength(1);
    expect(result.current.queue[0].label).toBe("Keep");
  });
});

// ── clearSynced / clearAll ────────────────────────────────────────────────────

describe("useSyncQueue — clear operations", () => {
  it("clearSynced removes only synced items", async () => {
    const onSync = vi.fn().mockResolvedValue(true);
    const { result } = renderHook(() =>
      useSyncQueue({ storageKey: "test_queue_clear_synced", onSync })
    );
    act(() => {
      result.current.enqueue({ label: "Sync me" });
      result.current.enqueue({ label: "Keep pending" });
    });
    // Manually simulate synced state for first item
    const id = result.current.queue[0].id;
    await act(async () => { await result.current.retryItem(id); });
    await waitFor(() =>
      expect(result.current.queue.find((i) => i.id === id)?.status).toBe("synced")
    );
    act(() => { result.current.clearSynced(); });
    expect(result.current.queue).toHaveLength(1);
    expect(result.current.queue[0].label).toBe("Keep pending");
  });

  it("clearAll empties the queue", () => {
    const { result } = renderHook(() =>
      useSyncQueue({ storageKey: "test_queue_clear_all" })
    );
    act(() => {
      result.current.enqueue({ label: "A" });
      result.current.enqueue({ label: "B" });
    });
    act(() => { result.current.clearAll(); });
    expect(result.current.queue).toHaveLength(0);
  });
});

// ── online / offline detection ────────────────────────────────────────────────

describe("useSyncQueue — online/offline", () => {
  it("reflects offline status when navigator.onLine is false", () => {
    setOnlineStatus(false);
    const { result } = renderHook(() =>
      useSyncQueue({ storageKey: "test_queue_offline" })
    );
    act(() => { window.dispatchEvent(new Event("offline")); });
    expect(result.current.isOnline).toBe(false);
  });

  it("updates isOnline when connectivity changes", () => {
    setOnlineStatus(true);
    const { result } = renderHook(() =>
      useSyncQueue({ storageKey: "test_queue_online_change" })
    );
    expect(result.current.isOnline).toBe(true);
    setOnlineStatus(false);
    act(() => { window.dispatchEvent(new Event("offline")); });
    expect(result.current.isOnline).toBe(false);
    setOnlineStatus(true);
    act(() => { window.dispatchEvent(new Event("online")); });
    expect(result.current.isOnline).toBe(true);
  });
});

// ── sync / retryAll ───────────────────────────────────────────────────────────

describe("useSyncQueue — sync", () => {
  it("marks item as synced on successful onSync", async () => {
    const onSync = vi.fn().mockResolvedValue(true);
    const { result } = renderHook(() =>
      useSyncQueue({ storageKey: "test_queue_sync_success", onSync })
    );
    act(() => { result.current.enqueue({ label: "Upload 1" }); });
    const id = result.current.queue[0].id;
    await act(async () => { await result.current.retryItem(id); });
    await waitFor(() =>
      expect(result.current.queue[0]?.status).toBe("synced")
    );
  });

  it("marks item as failed when onSync throws and maxRetries exceeded", async () => {
    const onSync = vi.fn().mockRejectedValue(new Error("Network error"));
    const { result } = renderHook(() =>
      useSyncQueue({
        storageKey: "test_queue_sync_fail",
        onSync,
        maxRetries: 1,
      })
    );
    act(() => { result.current.enqueue({ label: "Bad upload" }); });
    const id = result.current.queue[0].id;
    await act(async () => { await result.current.retryItem(id); });
    await waitFor(() =>
      expect(result.current.queue.find((i) => i.id === id)?.status).toBe("failed")
    );
  });

  it("calls onSyncSuccess callback on success", async () => {
    const onSync = vi.fn().mockResolvedValue(true);
    const onSyncSuccess = vi.fn();
    const { result } = renderHook(() =>
      useSyncQueue({ storageKey: "test_queue_cb_success", onSync, onSyncSuccess })
    );
    act(() => { result.current.enqueue({ label: "Upload CB" }); });
    const id = result.current.queue[0].id;
    await act(async () => { await result.current.retryItem(id); });
    await waitFor(() => expect(onSyncSuccess).toHaveBeenCalledOnce());
  });

  it("calls onSyncFailure callback when maxRetries exhausted", async () => {
    const onSync = vi.fn().mockRejectedValue(new Error("RPC down"));
    const onSyncFailure = vi.fn();
    const { result } = renderHook(() =>
      useSyncQueue({
        storageKey: "test_queue_cb_fail",
        onSync,
        onSyncFailure,
        maxRetries: 1,
      })
    );
    act(() => { result.current.enqueue({ label: "Fail CB" }); });
    const id = result.current.queue[0].id;
    await act(async () => { await result.current.retryItem(id); });
    await waitFor(() => expect(onSyncFailure).toHaveBeenCalledOnce());
  });

  it("retryAll retries all pending and failed items", async () => {
    const onSync = vi.fn().mockResolvedValue(true);
    const { result } = renderHook(() =>
      useSyncQueue({ storageKey: "test_queue_retry_all", onSync })
    );
    act(() => {
      result.current.enqueue({ label: "A" });
      result.current.enqueue({ label: "B" });
    });
    await act(async () => { await result.current.retryAll(); });
    await waitFor(() =>
      expect(result.current.queue.every((i) => i.status === "synced")).toBe(true)
    );
    expect(onSync).toHaveBeenCalledTimes(2);
  });

  it("does not call onSync when no handler is provided", async () => {
    const { result } = renderHook(() =>
      useSyncQueue({ storageKey: "test_queue_no_sync" })
    );
    act(() => { result.current.enqueue({ label: "No sync fn" }); });
    await act(async () => { await result.current.retryAll(); });
    // Should not throw — items remain pending
    expect(result.current.queue[0].status).toBe("pending");
  });
});

// ── localStorage persistence ──────────────────────────────────────────────────

describe("useSyncQueue — persistence", () => {
  it("saves the queue to localStorage on change", () => {
    const { result } = renderHook(() =>
      useSyncQueue({ storageKey: "test_persist_save" })
    );
    act(() => { result.current.enqueue({ label: "Persist me" }); });
    const stored = JSON.parse(localStorageMock.getItem("test_persist_save") ?? "[]");
    expect(stored).toHaveLength(1);
    expect(stored[0].label).toBe("Persist me");
  });

  it("loads the queue from localStorage on mount", () => {
    const existing = [
      {
        id: "abc", label: "Loaded", status: "pending",
        enqueuedAt: Date.now(), retryCount: 0,
      },
    ];
    localStorageMock.setItem("test_persist_load", JSON.stringify(existing));
    const { result } = renderHook(() =>
      useSyncQueue({ storageKey: "test_persist_load" })
    );
    expect(result.current.queue).toHaveLength(1);
    expect(result.current.queue[0].label).toBe("Loaded");
  });

  it("resets 'syncing' items to 'pending' on mount (crash recovery)", () => {
    const items = [
      {
        id: "x", label: "Mid-sync", status: "syncing",
        enqueuedAt: Date.now(), retryCount: 0,
      },
    ];
    localStorageMock.setItem("test_crash_recovery", JSON.stringify(items));
    const { result } = renderHook(() =>
      useSyncQueue({ storageKey: "test_crash_recovery" })
    );
    expect(result.current.queue[0].status).toBe("pending");
  });
});
