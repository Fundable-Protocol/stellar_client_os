"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

const ImpactMap = dynamic(
  () => import("@/components/organisms/ImpactMap").then((m) => m.ImpactMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col gap-4">
        <div className="space-y-1">
          <Skeleton className="h-5 w-48 bg-zinc-800" />
          <Skeleton className="h-4 w-72 bg-zinc-800" />
        </div>
        <Skeleton className="h-[300px] md:h-[400px] lg:h-[500px] rounded-xl bg-zinc-900" />
      </div>
    ),
  }
);

export function ImpactMapSection() {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-white">Impact Projects</h2>
        <p className="text-sm text-zinc-400">
          Explore impact projects around the world. Toggle between street and
          satellite views.
        </p>
      </div>
      <ImpactMap />
    </div>
  );
}
