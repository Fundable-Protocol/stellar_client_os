import { Skeleton } from "@/components/ui/skeleton";

const StreamsTableSkeleton = () => {
    return (
        <div className="space-y-4">
            {/* Header skeleton */}
            <div className="flex items-center gap-4 mb-4">
                <Skeleton className="h-10 w-32 bg-zinc-800" />
                <Skeleton className="h-10 w-32 bg-zinc-800" />
                <Skeleton className="h-10 w-40 bg-zinc-800" />
            </div>

            {/* Table skeleton with horizontal scroll container */}
            <div className="w-full overflow-x-auto">
                <div className="border border-zinc-700 rounded-lg overflow-hidden min-w-[640px]">
                    {/* Header row */}
                    <div className="bg-zinc-800 p-4 grid grid-cols-8 gap-4">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <Skeleton key={`header-${i}`} className="h-4 bg-zinc-700" />
                        ))}
                    </div>

                    {/* Data rows */}
                    {Array.from({ length: 5 }).map((_, rowIndex) => (
                        <div
                            key={`row-${rowIndex}`}
                            className="p-4 grid grid-cols-8 gap-4 border-t border-zinc-700"
                        >
                            {Array.from({ length: 8 }).map((_, colIndex) => (
                                <Skeleton
                                    key={`cell-${rowIndex}-${colIndex}`}
                                    className="h-4 bg-zinc-800"
                                />
                            ))}
                        </div>
                    ))}
                </div>
            </div>

            {/* Pagination skeleton */}
            <div className="flex items-center justify-between">
                <Skeleton className="h-8 w-32 bg-zinc-800" />
                <div className="flex gap-2">
                    <Skeleton className="h-8 w-24 bg-zinc-800" />
                    <Skeleton className="h-8 w-8 bg-zinc-800" />
                    <Skeleton className="h-8 w-8 bg-zinc-800" />
                    <Skeleton className="h-8 w-8 bg-zinc-800" />
                    <Skeleton className="h-8 w-24 bg-zinc-800" />
                </div>
            </div>
        </div>
    );
};

export default StreamsTableSkeleton;