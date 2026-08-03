import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { clampPageCount, getPaginationRange, usePagination } from "./use-pagination";

describe("use-pagination", () => {
  describe("clampPageCount", () => {
    it("clamps 0 to minimum 1 page", () => {
      expect(clampPageCount(0)).toBe(1);
    });

    it("clamps negative numbers to minimum 1 page", () => {
      expect(clampPageCount(-5)).toBe(1);
    });

    it("handles NaN and invalid numbers gracefully by returning 1", () => {
      expect(clampPageCount(NaN)).toBe(1);
      expect(clampPageCount(Number.NaN)).toBe(1);
    });

    it("ceils floating point page counts", () => {
      expect(clampPageCount(2.3)).toBe(3);
    });

    it("returns valid positive integer page counts unchanged", () => {
      expect(clampPageCount(1)).toBe(1);
      expect(clampPageCount(5)).toBe(5);
    });
  });

  describe("getPaginationRange", () => {
    it("returns single page when pageCount is 0", () => {
      const range = getPaginationRange({ currentPage: 1, pageCount: 0 });
      expect(range).toEqual([{ type: "page", page: 1 }]);
    });

    it("returns single page when pageCount is 1", () => {
      const range = getPaginationRange({ currentPage: 1, pageCount: 1 });
      expect(range).toEqual([{ type: "page", page: 1 }]);
    });

    it("returns range for small page counts (<= 7)", () => {
      const range = getPaginationRange({ currentPage: 2, pageCount: 5 });
      expect(range).toEqual([
        { type: "page", page: 1 },
        { type: "page", page: 2 },
        { type: "page", page: 3 },
        { type: "page", page: 4 },
        { type: "page", page: 5 },
      ]);
    });

    it("handles float currentPage and siblingCount gracefully", () => {
      const range = getPaginationRange({ currentPage: 4.7, pageCount: 10.2, siblingCount: 1.8 });
      expect(range).toEqual([
        { type: "page", page: 1 },
        { type: "page", page: 2 },
        { type: "page", page: 3 },
        { type: "page", page: 4 },
        { type: "page", page: 5 },
        { type: "ellipsis", key: "right" },
        { type: "page", page: 11 },
      ]);
    });

    it("expands boundary left = 3 to page 2 instead of showing single-page ellipsis", () => {
      const range = getPaginationRange({ currentPage: 4, pageCount: 10, siblingCount: 1 });
      expect(range).toEqual([
        { type: "page", page: 1 },
        { type: "page", page: 2 },
        { type: "page", page: 3 },
        { type: "page", page: 4 },
        { type: "page", page: 5 },
        { type: "ellipsis", key: "right" },
        { type: "page", page: 10 },
      ]);
    });

    it("handles ellipsis for larger page counts (> 7)", () => {
      const range = getPaginationRange({ currentPage: 5, pageCount: 10, siblingCount: 1 });
      expect(range).toEqual([
        { type: "page", page: 1 },
        { type: "ellipsis", key: "left" },
        { type: "page", page: 4 },
        { type: "page", page: 5 },
        { type: "page", page: 6 },
        { type: "ellipsis", key: "right" },
        { type: "page", page: 10 },
      ]);
    });
  });

  describe("usePagination hook", () => {
    it("renders pagination range correctly via hook", () => {
      const { result } = renderHook(() =>
        usePagination({ currentPage: 1, pageCount: 0 })
      );
      expect(result.current).toEqual([{ type: "page", page: 1 }]);
    });

    it("handles being called without parameters safely", () => {
      const { result } = renderHook(() => usePagination());
      expect(result.current).toEqual([{ type: "page", page: 1 }]);
    });
  });
});
