"use client";

import {
    flexRender,
    useReactTable,
    getCoreRowModel,
    getPaginationRowModel,
} from "@tanstack/react-table";

import {
    Table,
    TableCell,
    TableRow,
    TableBody,
    TableHead,
    TableHeader,
} from "@/components/ui/table";

import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination";

import { HistoryRecord } from "@/services/types";
import AppSelect from "@/components/molecules/AppSelect";
import { validPageLimits } from "@/lib/constants";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HistoryTableProps {
    data: HistoryRecord[];
    columns: any[];
    page: number;
    limit: number;
    totalCount: number;
    onPageChange: (page: number) => void;
    onLimitChange: (limit: number) => void;
    onExport: () => void;
    isLoading?: boolean;
}

const HistoryTable = ({
    data,
    columns,
    page,
    limit,
    totalCount,
    onPageChange,
    onLimitChange,
    onExport,
    isLoading = false,
}: HistoryTableProps) => {
    const table = useReactTable({
        data,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        manualPagination: true,
        pageCount: Math.ceil(totalCount / limit),
    });

    const pageCount = Math.ceil(totalCount / limit);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex gap-4">
                    <AppSelect
                        options={validPageLimits.map((l) => ({
                            label: `${l} per page`,
                            value: l.toString(),
                        }))}
                        value={limit.toString()}
                        setValue={(v) => onLimitChange(parseInt(v))}
                        placeholder="Limit"
                        title="Rows per page"
                    />
                </div>
                <Button
                    variant="outline"
                    className="border-zinc-800 bg-zinc-900 text-white hover:bg-zinc-800"
                    onClick={onExport}
                    aria-label="Export transaction history as CSV"
                >
                    <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                    Export CSV
                </Button>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
                <Table>
                    <TableHeader>
                        {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id} className="border-zinc-800 hover:bg-transparent">
                                {headerGroup.headers.map((header) => (
                                    <TableHead key={header.id} className="text-zinc-400 font-medium">
                                        {flexRender(header.column.columnDef.header, header.getContext())}
                                    </TableHead>
                                ))}
                            </TableRow>
                        ))}
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            Array.from({ length: 5 }).map((_, rowIndex) => (
                                <TableRow key={`skeleton-row-${rowIndex}`} className="border-zinc-800">
                                    {Array.from({ length: columns.length }).map((_, colIndex) => (
                                        <TableCell key={`skeleton-cell-${rowIndex}-${colIndex}`}>
                                            <div className="h-4 bg-zinc-800 animate-pulse rounded-md w-full" />
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        ) : data?.length ? (
                            table.getRowModel().rows.map((row) => (
                                <TableRow key={row.id} className="border-zinc-800 hover:bg-zinc-800/30">
                                    {row.getVisibleCells().map((cell) => (
                                        <TableCell key={cell.id}>
                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={columns.length} className="h-48 text-center text-zinc-500">
                                    <div className="flex flex-col items-center justify-center space-y-3">
                                        <div className="p-3 bg-zinc-800/50 rounded-full">
                                            <Download className="h-6 w-6 text-zinc-600 opacity-50" />
                                        </div>
                                        <div>
                                            <p className="font-medium text-zinc-300">No transactions found</p>
                                            <p className="text-sm text-zinc-500">Your transaction history will appear here once you start using the app.</p>
                                        </div>
                                    </div>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            <div className="flex items-center justify-between">
                <p className="text-sm text-zinc-500" aria-live="polite" aria-atomic="true">
                    Showing {data.length} of {totalCount} transactions
                </p>
                <Pagination>
                    <PaginationContent>
                        <PaginationItem>
                            <PaginationPrevious
                                href="#"
                                onClick={(e) => {
                                    e.preventDefault();
                                    if (page > 1) onPageChange(page - 1);
                                }}
                                className={page <= 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                            />
                        </PaginationItem>
                        {Array.from({ length: Math.min(5, pageCount) }).map((_, i) => (
                            <PaginationItem key={i}>
                                <PaginationLink
                                    href="#"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        onPageChange(i + 1);
                                    }}
                                    isActive={page === i + 1}
                                >
                                    {i + 1}
                                </PaginationLink>
                            </PaginationItem>
                        ))}
                        <PaginationItem>
                            <PaginationNext
                                href="#"
                                onClick={(e) => {
                                    e.preventDefault();
                                    if (page < pageCount) onPageChange(page + 1);
                                }}
                                className={page >= pageCount ? "pointer-events-none opacity-50" : "cursor-pointer"}
                            />
                        </PaginationItem>
                    </PaginationContent>
                </Pagination>
            </div>
        </div>
    );
};

export default HistoryTable;
