"use client";

import { useMemo, useState, type ComponentType } from "react";
import dynamic from "next/dynamic";
import AppSelect from "@/components/molecules/AppSelect";
import { Skeleton } from "@/components/ui/skeleton";

export type TreeStatus = "all" | "pending" | "planted" | "verified" | "failed";

export interface TreeProject {
  id: string;
  name: string;
  status: Exclude<TreeStatus, "all">;
}

export const TREE_STATUS_OPTIONS = [
  { label: "All", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Planted", value: "planted" },
  { label: "Verified", value: "verified" },
  { label: "Failed", value: "failed" },
] as const;

const TREE_PROJECTS: TreeProject[] = [
  { id: "1", name: "Amazon Grove", status: "pending" },
  { id: "2", name: "Forest Loop", status: "planted" },
  { id: "3", name: "Mangrove Restore", status: "verified" },
  { id: "4", name: "Desert Claim", status: "failed" },
  { id: "5", name: "Savanna Renewal", status: "verified" },
];

export function filterTreesByStatus(
  trees: TreeProject[],
  status: TreeStatus
): TreeProject[] {
  if (status === "all") return trees;
  return trees.filter((tree) => tree.status === status);
}

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
        <Skeleton className="h-[300px] md:h-[400px] lg:h-[500px] rounded-xl bj-zinc-900" />
      </div>
    ),
  }
) as ComponentType<{ sortBy?: string }>

export function ImpactMapSection() {
  const [sortBy, setSortBy] = useState("deadline");
  const [treeStatus, setTreeStatus] = useState<TreeStatus>("all");

  const filteredProjects = useMemo(
    () => filterTreesByStatus(TREE_PROJECTS, treeStatus),
    [treeStatus]
  );

  const statusTitle =
    treeStatus === "all"
      ? "All Projects"
      : `${treeStatus.charAt(0).toUpperCase()}${treeStatus.slice(1)} Projects`;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-white">Impact Projects</h2>
          <p className="text-sm text-zinc-400">
            Explore impact projects around the world. Toggle between street and
            satellite views.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="w-full max-w-[220px]">
            <p className="mb-1.5 ml-1 text-xs font-medium uppercase tracking-[0.08em] text-zinc-500">
              Tree status
            </p>
            <AppSelect
              options={TREE_STATUS_OPTIONS}
              value={treeStatus}
              setValue={(value) => setTreeStatus(value as TreeStatus)}
              placeholder="All"
              className="bg-zinc-900 border-zinc-700 text-white"
            />
          </div>

          <div className="w-full max-w-[220px]">
            <p className="mb-1.5 ml-1 text-xs font-medium uppercase tracking-[0.08em] text-zinc-500">
              Sort by
            </p>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full bg-zinc-800 text-sm text-zinc-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-zinc-600"
              aria-label="Sort projects"
            >
              <option value="pay">Highest pay</option>
              <option value="deadline">Soonest deadline</option>
              <option value="altitude">Easiest (lowest altitude)</option>
            </select>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium text-zinc-200">{statusTitle}</h3>
          <span className="text-xs text-zinc-400">{filteredProjects.length} items</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filteredProjects.map((project) => (
            <div
              key={project.id}
              className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-white">{project.name}</span>
                <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-300">
                  {project.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <ImpactMap sortBy={sortBy} />
    </div>
  );
}