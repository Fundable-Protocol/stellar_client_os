"use client";

import { useMemo } from "react";

export type PaginationRangeItem =
  | { type: "page"; page: number }
  | { type: "ellipsis"; key: "left" | "right" };

type UsePaginationParams = {
  currentPage: number;
  pageCount: number;
  siblingCount?: number;
};

const range = (start: number, end: number) =>
  Array.from({ length: end - start + 1 }, (_, index) => start + index);

export const clampPageCount = (pageCount: number): number => {
  if (!pageCount || Number.isNaN(pageCount) || pageCount < 1) {
    return 1;
  }
  return Math.ceil(pageCount);
};

export const getPaginationRange = ({
  currentPage,
  pageCount,
  siblingCount = 2,
}: UsePaginationParams): PaginationRangeItem[] => {
  const safePageCount = clampPageCount(pageCount);
  const safeSiblingCount = Math.max(0, Math.floor(siblingCount ?? 2));
  const safeCurrentPage = Math.min(
    Math.max(1, Math.floor(currentPage || 1)),
    safePageCount
  );
  const windowSize = safeSiblingCount * 2 + 1;

  if (safePageCount <= 7) {
    return range(1, safePageCount).map((page) => ({ type: "page", page }));
  }

  let left = Math.max(2, safeCurrentPage - safeSiblingCount);
  let right = Math.min(safePageCount - 1, safeCurrentPage + safeSiblingCount);

  while (right - left + 1 < windowSize) {
    if (left > 2) {
      left -= 1;
      continue;
    }

    if (right < safePageCount - 1) {
      right += 1;
      continue;
    }

    break;
  }

  if (left === 3) {
    left = 2;
  }

  if (right === safePageCount - 2) {
    right = safePageCount - 1;
  }

  const showLeftEllipsis = left > 2;
  const showRightEllipsis = right < safePageCount - 1;

  const items: PaginationRangeItem[] = [{ type: "page", page: 1 }];

  if (showLeftEllipsis) {
    items.push({ type: "ellipsis", key: "left" });
  }

  range(left, right).forEach((page) => {
    items.push({ type: "page", page });
  });

  if (showRightEllipsis) {
    items.push({ type: "ellipsis", key: "right" });
  }

  items.push({ type: "page", page: safePageCount });

  return items;
};

export const usePagination = ({
  currentPage = 1,
  pageCount = 1,
  siblingCount = 2,
}: Partial<UsePaginationParams> = {}) =>
  useMemo(
    () => getPaginationRange({ currentPage, pageCount, siblingCount }),
    [currentPage, pageCount, siblingCount]
  );
