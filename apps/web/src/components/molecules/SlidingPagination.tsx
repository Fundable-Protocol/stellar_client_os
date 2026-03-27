"use client";

import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { usePagination } from "@/hooks/use-pagination";

type SlidingPaginationProps = {
  page: number;
  pageCount: number;
  onPageChange: (p: number) => void;
  className?: string;
};

const clampPage = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const SlidingPagination = ({
  page,
  pageCount,
  onPageChange,
  className,
}: SlidingPaginationProps) => {
  const safePageCount = Math.max(1, pageCount);
  const currentPage = clampPage(page, 1, safePageCount);
  const items = usePagination({
    currentPage,
    pageCount: safePageCount,
    siblingCount: 2,
  });

  const navigate = (targetPage: number) => {
    const nextPage = clampPage(targetPage, 1, safePageCount);
    if (nextPage !== currentPage) {
      onPageChange(nextPage);
    }
  };

  return (
    <Pagination className={className}>
      <PaginationContent>
        <PaginationItem>
          <PaginationLink
            href="#"
            size="default"
            disabled={currentPage === 1}
            onClick={(e) => {
              e.preventDefault();
              navigate(1);
            }}
          >
            First
          </PaginationLink>
        </PaginationItem>

        <PaginationItem>
          <PaginationPrevious
            href="#"
            disabled={currentPage === 1}
            onClick={(e) => {
              e.preventDefault();
              navigate(currentPage - 1);
            }}
          />
        </PaginationItem>

        {items.map((item) => (
          <PaginationItem
            key={item.type === "ellipsis" ? item.key : `page-${item.page}`}
          >
            {item.type === "ellipsis" ? (
              <PaginationEllipsis />
            ) : (
              <PaginationLink
                href="#"
                isActive={item.page === currentPage}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(item.page);
                }}
              >
                {item.page}
              </PaginationLink>
            )}
          </PaginationItem>
        ))}

        <PaginationItem>
          <PaginationNext
            href="#"
            disabled={currentPage === safePageCount}
            onClick={(e) => {
              e.preventDefault();
              navigate(currentPage + 1);
            }}
          />
        </PaginationItem>

        <PaginationItem>
          <PaginationLink
            href="#"
            size="default"
            disabled={currentPage === safePageCount}
            onClick={(e) => {
              e.preventDefault();
              navigate(safePageCount);
            }}
          >
            Last
          </PaginationLink>
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
};

export default SlidingPagination;
