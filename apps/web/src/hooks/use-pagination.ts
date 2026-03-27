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

export const getPaginationRange = ({
  currentPage,
  pageCount,
  siblingCount = 2,
}: UsePaginationParams): PaginationRangeItem[] => {
  const safePageCount = Math.max(1, pageCount);
  const safeCurrentPage = Math.min(Math.max(1, currentPage), safePageCount);
  const windowSize = siblingCount * 2 + 1;

  if (safePageCount <= 7) {
    return range(1, safePageCount).map((page) => ({ type: "page", page }));
  }

  let left = Math.max(2, safeCurrentPage - siblingCount);
  let right = Math.min(safePageCount - 1, safeCurrentPage + siblingCount);

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

export const usePagination = (params: UsePaginationParams) =>
  useMemo(() => getPaginationRange(params), [params]);
