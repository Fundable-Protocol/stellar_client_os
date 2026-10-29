"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";

/**
 * Fallback viewport used before the scroll container has been measured.
 *
 * This is what makes the list render server-side (and on the very first client
 * render) instead of flashing an empty box. It only affects the initial render
 * window; once mounted, the real element size is measured.
 */
const INITIAL_VIEWPORT = { width: 1200, height: 800 } as const;

/**
 * Work out how many grid columns fit in the available width.
 *
 * Exported for unit testing — the layout maths is the part most likely to
 * regress, and it is much cheaper to test as a pure function.
 */
export function computeColumnCount(
  width: number,
  minColumnWidth: number,
  gap: number,
  maxColumns = Number.POSITIVE_INFINITY,
): number {
  if (!Number.isFinite(width) || width <= 0 || minColumnWidth <= 0) return 1;

  const fit = Math.floor((width + gap) / (minColumnWidth + gap));
  const upperBound = Number.isFinite(maxColumns) ? Math.max(1, Math.floor(maxColumns)) : fit;

  return Math.max(1, Math.min(fit, upperBound));
}

export interface VirtualizedCampaignGridProps<T> {
  /** Full (already filtered) collection. Only visible rows are mounted. */
  items: readonly T[];
  /** Render a single campaign card. The grid supplies list semantics. */
  renderItem: (item: T, index: number) => React.ReactNode;
  /** Stable key for a campaign, used for React reconciliation. */
  getItemKey: (item: T, index: number) => React.Key;
  /** Minimum width of a single card before the grid drops a column. */
  minColumnWidth?: number;
  /** Hard cap on the number of columns (e.g. 2 for the dashboard). */
  maxColumns?: number;
  /** Columns rendered during SSR / before resize measurement. */
  initialColumns?: number;
  /** Space between cards, in pixels. */
  gap?: number;
  /** Estimated height of a row before individual rows are measured. */
  estimateRowHeight?: number;
  /** Extra rows rendered above and below the viewport. */
  overscan?: number;
  /** Height of the scrollable viewport. */
  maxHeight?: number | string;
  className?: string;
  ariaLabel?: string;
  /** Rendered instead of the grid when there are no items. */
  emptyState?: React.ReactNode;
}

/**
 * Virtualised, responsive campaign grid.
 *
 * Virtualises *rows* rather than individual cards: for a 10k campaign list only
 * a couple of dozen cards exist in the DOM at any time, so filtering, scrolling
 * and rendering stay fast regardless of collection size.
 */
export function VirtualizedCampaignGrid<T>({
  items,
  renderItem,
  getItemKey,
  minColumnWidth = 320,
  maxColumns = Number.POSITIVE_INFINITY,
  initialColumns = 1,
  gap = 24,
  estimateRowHeight = 360,
  overscan = 3,
  maxHeight = "70vh",
  className,
  ariaLabel = "Campaigns",
  emptyState = null,
}: VirtualizedCampaignGridProps<T>) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [columns, setColumns] = useState(() =>
    Math.max(1, Math.min(initialColumns, Number.isFinite(maxColumns) ? maxColumns : initialColumns)),
  );

  // Pair cards into rows. `slice` keeps the original order, so the visual
  // reading order always matches the underlying list order.
  const rows = useMemo(() => {
    const result: T[][] = [];
    for (let index = 0; index < items.length; index += columns) {
      result.push(items.slice(index, index + columns));
    }
    return result;
  }, [items, columns]);

  const rowKeys = useMemo(
    () =>
      rows.map((row, rowIndex) =>
        row.length > 0 ? getItemKey(row[0], rowIndex * columns) : rowIndex,
      ),
    [rows, columns, getItemKey],
  );

  // Cheap signature of the current collection. Used to detect replacements
  // (new search term / filters) without reacting to arrays that merely have a
  // new identity but the same contents.
  const itemsSignature = useMemo(() => {
    if (items.length === 0) return "empty";
    const first = getItemKey(items[0], 0);
    const last = getItemKey(items[items.length - 1], items.length - 1);
    return `${items.length}:${String(first)}:${String(last)}`;
  }, [items, getItemKey]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => estimateRowHeight,
    overscan,
    initialRect: INITIAL_VIEWPORT,
    getItemKey: (index) => rowKeys[index] ?? index,
  });

  // Responsive column count. Reading the width in an effect (never during
  // render) keeps this component safe to server-render.
  useEffect(() => {
    const element = scrollContainerRef.current;
    if (!element) return;

    const update = () => {
      const width = element.clientWidth;
      if (width <= 0) return;
      setColumns((previous) => {
        const next = computeColumnCount(width, minColumnWidth, gap, maxColumns);
        return next === previous ? previous : next;
      });
    };

    update();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }

    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [gap, maxColumns, minColumnWidth]);

  // Row heights change when the column count changes; discard cached
  // measurements so the scrollbar reflects the new layout immediately.
  useEffect(() => {
    virtualizer.measure();
  }, [columns, virtualizer]);

  // When the collection is replaced, return to the top. Without this, filtering
  // a long list down to a few results while scrolled near the bottom would
  // leave the viewport past the end of the new (much shorter) list.
  useEffect(() => {
    const element = scrollContainerRef.current;
    if (!element) return;

    element.scrollTop = 0;
    virtualizer.scrollToOffset(0);
    virtualizer.measure();
  }, [itemsSignature, virtualizer]);

  if (items.length === 0) {
    return <>{emptyState}</>;
  }

  const virtualRows = virtualizer.getVirtualItems();

  return (
    <div
      ref={scrollContainerRef}
      role="list"
      aria-label={ariaLabel}
      // Scrollable regions must be keyboard focusable so keyboard-only users
      // can scroll the list with the arrow keys / Page Down.
      tabIndex={0}
      className={cn(
        "relative overflow-y-auto overscroll-contain rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-purple-500",
        className,
      )}
      style={{ maxHeight }}
    >
      {/* Spacer sized to the full virtual list so the browser scrollbar
          reflects the true number of campaigns, even though only the visible
          rows are mounted. */}
      <div style={{ height: virtualizer.getTotalSize(), position: "relative", width: "100%" }}>
        {virtualRows.map((virtualRow) => {
          const row = rows[virtualRow.index] ?? [];

          return (
            // Presentational wrappers keep the listitem children semantically
            // direct children of the list for assistive technology.
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              role="presentation"
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div
                role="presentation"
                style={{
                  display: "grid",
                  gap,
                  // Extra bottom space separates this row from the next one.
                  paddingBottom: gap,
                  gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                }}
              >
                {row.map((item, columnIndex) => {
                  const itemIndex = virtualRow.index * columns + columnIndex;

                  return (
                    <div
                      key={getItemKey(item, itemIndex)}
                      role="listitem"
                      aria-setsize={items.length}
                      aria-posinset={itemIndex + 1}
                    >
                      {renderItem(item, itemIndex)}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default VirtualizedCampaignGrid;
