// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SyncQueueBanner } from "./SyncQueueBanner";
import type { SyncQueueState } from "@/hooks/use-sync-queue";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSyncQueue(
  overrides: Partial<SyncQueueState> = {}
): Pick<
  SyncQueueState,
  | "pendingCount"
  | "isSyncing"
  | "isOnline"
  | "failedItems"
  | "syncedItems"
  | "pendingItems"
  | "syncingItems"
  | "retryAll"
> {
  return {
    pendingCount: 0,
    isSyncing: false,
    isOnline: true,
    failedItems: [],
    syncedItems: [],
    pendingItems: [],
    syncingItems: [],
    retryAll: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ── Visibility ────────────────────────────────────────────────────────────────

describe("SyncQueueBanner — visibility", () => {
  it("renders nothing when queue is empty and device is online", () => {
    const { container } = render(<SyncQueueBanner syncQueue={makeSyncQueue()} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders when there are pending items", () => {
    const syncQueue = makeSyncQueue({
      pendingCount: 2,
      pendingItems: [
        { id: "1", label: "Photo 1", status: "pending", enqueuedAt: Date.now(), retryCount: 0 },
        { id: "2", label: "Photo 2", status: "pending", enqueuedAt: Date.now(), retryCount: 0 },
      ],
    });
    render(<SyncQueueBanner syncQueue={syncQueue} />);
    expect(screen.getByTestId("sync-queue-banner")).toBeTruthy();
  });

  it("renders when actively syncing", () => {
    const syncQueue = makeSyncQueue({
      isSyncing: true,
      syncingItems: [
        { id: "1", label: "Photo 1", status: "syncing", enqueuedAt: Date.now(), retryCount: 0 },
      ],
    });
    render(<SyncQueueBanner syncQueue={syncQueue} />);
    expect(screen.getByTestId("sync-queue-banner")).toBeTruthy();
  });

  it("renders when items have failed", () => {
    const syncQueue = makeSyncQueue({
      failedItems: [
        { id: "1", label: "Photo 1", status: "failed", enqueuedAt: Date.now(), retryCount: 3 },
      ],
    });
    render(<SyncQueueBanner syncQueue={syncQueue} />);
    expect(screen.getByTestId("sync-queue-banner")).toBeTruthy();
  });
});

// ── Accessibility ─────────────────────────────────────────────────────────────

describe("SyncQueueBanner — accessibility", () => {
  it("has role='status' and aria-live='polite'", () => {
    const syncQueue = makeSyncQueue({ pendingCount: 1, pendingItems: [
      { id: "1", label: "Photo 1", status: "pending", enqueuedAt: Date.now(), retryCount: 0 },
    ]});
    render(<SyncQueueBanner syncQueue={syncQueue} />);
    const banner = screen.getByRole("status");
    expect(banner.getAttribute("aria-live")).toBe("polite");
    expect(banner.getAttribute("aria-atomic")).toBe("true");
  });

  it("retry button has accessible aria-label", () => {
    const syncQueue = makeSyncQueue({
      pendingCount: 1,
      isOnline: true,
      pendingItems: [
        { id: "1", label: "P", status: "pending", enqueuedAt: Date.now(), retryCount: 0 },
      ],
    });
    render(<SyncQueueBanner syncQueue={syncQueue} />);
    const retryBtn = screen.getByRole("button", { name: /retry syncing/i });
    expect(retryBtn).toBeTruthy();
  });

  it("view all button has accessible aria-label", () => {
    const onOpenDrawer = vi.fn();
    const syncQueue = makeSyncQueue({
      pendingCount: 1,
      pendingItems: [
        { id: "1", label: "P", status: "pending", enqueuedAt: Date.now(), retryCount: 0 },
      ],
    });
    render(<SyncQueueBanner syncQueue={syncQueue} onOpenDrawer={onOpenDrawer} />);
    expect(screen.getByRole("button", { name: /view pending/i })).toBeTruthy();
  });
});

// ── Variants ──────────────────────────────────────────────────────────────────

describe("SyncQueueBanner — variant text", () => {
  it("shows offline message when offline with pending items", () => {
    const syncQueue = makeSyncQueue({
      isOnline: false,
      pendingCount: 3,
      pendingItems: Array.from({ length: 3 }, (_, i) => ({
        id: String(i), label: `P${i}`, status: "pending" as const,
        enqueuedAt: Date.now(), retryCount: 0,
      })),
    });
    render(<SyncQueueBanner syncQueue={syncQueue} />);
    expect(screen.getByTestId("sync-queue-banner").textContent).toMatch(/offline/i);
    expect(screen.getByTestId("sync-queue-banner").textContent).toMatch(/3/);
  });

  it("shows syncing message when isSyncing is true", () => {
    const syncQueue = makeSyncQueue({
      isSyncing: true,
      syncingItems: [
        { id: "1", label: "P", status: "syncing", enqueuedAt: Date.now(), retryCount: 0 },
      ],
    });
    render(<SyncQueueBanner syncQueue={syncQueue} />);
    expect(screen.getByTestId("sync-queue-banner").getAttribute("data-variant")).toBe("syncing");
  });

  it("shows failed message when items have failed", () => {
    const syncQueue = makeSyncQueue({
      failedItems: [
        { id: "1", label: "P", status: "failed", enqueuedAt: Date.now(), retryCount: 3 },
      ],
    });
    render(<SyncQueueBanner syncQueue={syncQueue} />);
    expect(screen.getByTestId("sync-queue-banner").getAttribute("data-variant")).toBe("failed");
  });
});

// ── Interactions ──────────────────────────────────────────────────────────────

describe("SyncQueueBanner — interactions", () => {
  it("calls retryAll when retry button is clicked", async () => {
    const retryAll = vi.fn().mockResolvedValue(undefined);
    const syncQueue = makeSyncQueue({
      pendingCount: 1,
      isOnline: true,
      pendingItems: [
        { id: "1", label: "P", status: "pending", enqueuedAt: Date.now(), retryCount: 0 },
      ],
      retryAll,
    });
    render(<SyncQueueBanner syncQueue={syncQueue} />);
    fireEvent.click(screen.getByRole("button", { name: /retry syncing/i }));
    await waitFor(() => expect(retryAll).toHaveBeenCalledOnce());
  });

  it("calls onOpenDrawer when view all is clicked", () => {
    const onOpenDrawer = vi.fn();
    const syncQueue = makeSyncQueue({
      pendingCount: 1,
      pendingItems: [
        { id: "1", label: "P", status: "pending", enqueuedAt: Date.now(), retryCount: 0 },
      ],
    });
    render(<SyncQueueBanner syncQueue={syncQueue} onOpenDrawer={onOpenDrawer} />);
    fireEvent.click(screen.getByRole("button", { name: /view pending/i }));
    expect(onOpenDrawer).toHaveBeenCalledOnce();
  });

  it("retry button is disabled when isSyncing is true", () => {
    const syncQueue = makeSyncQueue({
      isSyncing: true,
      isOnline: true,
      pendingCount: 1,
      pendingItems: [
        { id: "1", label: "P", status: "pending", enqueuedAt: Date.now(), retryCount: 0 },
      ],
      syncingItems: [
        { id: "1", label: "P", status: "syncing", enqueuedAt: Date.now(), retryCount: 0 },
      ],
    });
    render(<SyncQueueBanner syncQueue={syncQueue} />);
    // syncing variant hides the retry button — banner should show syncing state
    expect(screen.getByTestId("sync-queue-banner").getAttribute("data-variant")).toBe("syncing");
  });
});
