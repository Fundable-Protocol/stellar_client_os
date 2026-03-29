import { Skeleton } from "@/components/ui/skeleton";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

const HistoryTableSkeleton = () => {
    return (
        <div className="space-y-4">
            <div className="flex gap-4">
                <Skeleton className="h-10 w-40 rounded-lg bg-zinc-800" />
                <Skeleton className="h-10 w-40 rounded-lg bg-zinc-800" />
            </div>

            {/* Mobile skeleton cards */}
            <div className="md:hidden space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="rounded-lg border border-zinc-800 p-4">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-3">
                                <Skeleton className="h-8 w-8 rounded-full" />
                                <Skeleton className="h-4 w-24" />
                            </div>
                            <Skeleton className="h-5 w-16 rounded-full" />
                        </div>
                        <div className="flex items-center justify-between">
                            <Skeleton className="h-4 w-20" />
                            <Skeleton className="h-3 w-16" />
                        </div>
                    </div>
                ))}
            </div>

            {/* Desktop table skeleton — hidden on mobile */}
            <div className="hidden md:block">
                <div className="rounded-xl border border-zinc-800 overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow className="border-zinc-800 bg-zinc-900/50">
                                <TableHead className="w-12"><Skeleton className="h-4 w-4 bg-zinc-800" /></TableHead>
                                <TableHead><Skeleton className="h-4 w-20 bg-zinc-800" /></TableHead>
                                <TableHead><Skeleton className="h-4 w-24 bg-zinc-800" /></TableHead>
                                <TableHead><Skeleton className="h-4 w-20 bg-zinc-800" /></TableHead>
                                <TableHead><Skeleton className="h-4 w-16 bg-zinc-800" /></TableHead>
                                <TableHead><Skeleton className="h-4 w-24 bg-zinc-800" /></TableHead>
                                <TableHead className="text-right"><Skeleton className="h-4 w-16 ml-auto bg-zinc-800" /></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {Array.from({ length: 5 }).map((_, i) => (
                                <TableRow key={i} className="border-zinc-800">
                                    {Array.from({ length: 7 }).map((_, j) => (
                                        <TableCell key={j}>
                                            <Skeleton className="h-4 w-full bg-zinc-800/50" />
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </div>
    );
};

export default HistoryTableSkeleton;
