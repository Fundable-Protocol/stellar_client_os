"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Coins, Leaf, MapPin, Plus, Scale, Sprout, Target, Users, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type {
  CampaignComparison,
  CampaignComparisonColumn,
  ComparisonMetric,
  ComparisonOption,
} from "@/services/campaign-comparison.service";

/** Kept in step with `MAX_COMPARED_CAMPAIGNS`; the service module is server-only. */
const MAX_CAMPAIGNS = 3;

const ENDPOINT = "/api/campaigns/compare";

const percent = (value: number) => `${Math.round(value * 100)}%`;
const number = (value: number, digits = 0) =>
  value.toLocaleString("en-US", { maximumFractionDigits: digits });

interface MetricRow {
  label: string;
  icon: React.ReactNode;
  metric?: ComparisonMetric;
  render: (column: CampaignComparisonColumn) => React.ReactNode;
}

const ROWS: MetricRow[] = [
  {
    label: "Tree species",
    icon: <Sprout className="h-4 w-4 text-emerald-400" />,
    render: (column) =>
      column.species.length === 0 ? (
        <span className="text-zinc-500">No trees planted yet</span>
      ) : (
        <ul className="space-y-1">
          {column.species.map((species) => (
            <li key={species.id} className="flex justify-between gap-2">
              <span className="text-zinc-200">{species.label}</span>
              <span className="text-zinc-400 tabular-nums">
                {number(species.trees)} · {percent(species.share)}
              </span>
            </li>
          ))}
        </ul>
      ),
  },
  {
    label: "Location",
    icon: <MapPin className="h-4 w-4 text-sky-400" />,
    render: (column) => <span className="text-zinc-200">{column.location.label}</span>,
  },
  {
    label: "Completion rate",
    icon: <Target className="h-4 w-4 text-purple-400" />,
    metric: "completionRate",
    render: (column) => (
      <div className="space-y-1.5">
        <span className="font-semibold text-zinc-100 tabular-nums">{percent(column.completionRate)}</span>
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-zinc-800"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(column.completionRate * 100)}
          aria-label={`${column.title} completion`}
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-purple-500 to-emerald-400"
            style={{ width: percent(column.completionRate) }}
          />
        </div>
      </div>
    ),
  },
  {
    label: "CO₂ impact",
    icon: <Leaf className="h-4 w-4 text-emerald-400" />,
    metric: "co2",
    render: (column) => (
      <div>
        <span className="font-semibold text-zinc-100 tabular-nums">
          {number(column.co2.perYearTonnes, 1)} t/year
        </span>
        <p className="text-[11px] text-zinc-400 tabular-nums">
          {number(column.co2.over10YearsTonnes, 1)} t over 10 years
        </p>
      </div>
    ),
  },
  {
    label: "Sponsors",
    icon: <Users className="h-4 w-4 text-indigo-400" />,
    metric: "sponsorCount",
    render: (column) => (
      <span className="font-semibold text-zinc-100 tabular-nums">{number(column.sponsorCount)}</span>
    ),
  },
  {
    label: "Cost per tree",
    icon: <Coins className="h-4 w-4 text-amber-400" />,
    metric: "costPerTree",
    render: (column) =>
      column.costPerTreeXlm === null ? (
        <span className="text-zinc-500">—</span>
      ) : (
        <span className="font-semibold text-zinc-100 tabular-nums">
          {number(column.costPerTreeXlm, 2)} XLM
        </span>
      ),
  },
];

const LEADER_LABELS: Record<ComparisonMetric, string> = {
  completionRate: "Most complete",
  co2: "Most CO₂",
  sponsorCount: "Most sponsors",
  costPerTree: "Lowest cost",
};

export interface CampaignSideBySideComparisonProps {
  /** Campaigns to open the comparison with (at most three are used). */
  initialIds?: string[];
}

/**
 * Compare up to three tree-planting campaigns side by side (issue #929):
 * tree species, location, completion rate, CO2 impact, sponsor count, and
 * cost per tree, with the leader of each metric highlighted.
 */
export function CampaignSideBySideComparison({ initialIds = [] }: CampaignSideBySideComparisonProps) {
  const [options, setOptions] = useState<ComparisonOption[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    [...new Set(initialIds)].slice(0, MAX_CAMPAIGNS),
  );
  const [optionsError, setOptionsError] = useState<string | null>(null);
  /** The last comparison response, tagged with the selection it answered. */
  const [result, setResult] = useState<{
    key: string;
    comparison: CampaignComparison | null;
    error: string | null;
  } | null>(null);
  const selectionKey = selectedIds.map(encodeURIComponent).join(",");

  useEffect(() => {
    const controller = new AbortController();
    fetch(ENDPOINT, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error())))
      .then((body: { data: { options: ComparisonOption[] } }) => setOptions(body.data.options))
      .catch(() => {
        if (!controller.signal.aborted) setOptionsError("Could not load campaigns to compare.");
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (selectionKey === "") return;
    const controller = new AbortController();
    fetch(`${ENDPOINT}?ids=${selectionKey}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error())))
      .then((body: { data: CampaignComparison }) =>
        setResult({ key: selectionKey, comparison: body.data, error: null }),
      )
      .catch(() => {
        if (!controller.signal.aborted) {
          setResult({ key: selectionKey, comparison: null, error: "Could not load the comparison." });
        }
      });
    return () => controller.abort();
  }, [selectionKey]);

  const comparison = result?.comparison ?? null;
  const loading = selectionKey !== "" && result?.key !== selectionKey;
  const error = optionsError ?? (result?.key === selectionKey ? result.error : null);
  const available = options.filter((option) => !selectedIds.includes(option.campaignId));
  const canAdd = selectedIds.length < MAX_CAMPAIGNS && available.length > 0;
  // Keep showing the previous columns while a new selection loads, minus any just removed.
  const columns = (comparison?.campaigns ?? []).filter((column) =>
    selectedIds.includes(column.campaignId),
  );
  const isLeader = (metric: ComparisonMetric | undefined, id: string) =>
    metric !== undefined && (comparison?.leaders[metric] ?? []).includes(id);

  const add = (id: string) => {
    if (id && selectedIds.length < MAX_CAMPAIGNS && !selectedIds.includes(id)) {
      setSelectedIds([...selectedIds, id]);
    }
  };
  const remove = (id: string) => setSelectedIds(selectedIds.filter((item) => item !== id));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-zinc-800 pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-extrabold tracking-tight text-zinc-50">
            <Scale className="h-8 w-8 text-emerald-400" />
            Compare Campaigns
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-400">
            Put up to {MAX_CAMPAIGNS} tree-planting campaigns side by side: species, location,
            completion rate, CO₂ impact, sponsors, and cost per tree.
          </p>
        </div>

        {canAdd && (
          <label className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 p-2 text-xs text-zinc-400">
            <Plus className="h-3.5 w-3.5 text-emerald-400" />
            Add campaign ({selectedIds.length}/{MAX_CAMPAIGNS})
            <select
              aria-label="Add campaign to comparison"
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              value=""
              onChange={(event) => add(event.target.value)}
            >
              <option value="" disabled>
                Select campaign…
              </option>
              {available.map((option) => (
                <option key={option.campaignId} value={option.campaignId}>
                  {option.title} — {option.location}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-rose-900 bg-rose-950/40 p-3 text-sm text-rose-300">
          {error}
        </p>
      )}

      {selectedIds.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/40 p-12 text-center">
          <Scale className="mx-auto mb-3 h-12 w-12 text-zinc-600" />
          <h2 className="text-lg font-semibold text-zinc-200">No campaigns selected</h2>
          <p className="mt-1 text-sm text-zinc-400">Add a campaign above to start comparing.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/80" aria-busy={loading}>
          <table className="w-full min-w-[640px] table-fixed text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-800">
                <th scope="col" className="w-40 p-4 font-medium text-zinc-400">
                  Campaign
                </th>
                {columns.map((column) => (
                  <th key={column.campaignId} scope="col" className="p-4 align-top">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <Link
                          href={`/campaigns/${column.campaignId}`}
                          className="text-sm font-bold text-zinc-100 hover:text-emerald-300"
                        >
                          {column.title}
                        </Link>
                        <Badge variant="outline" className="border-zinc-700 text-[10px] text-zinc-400">
                          {column.status}
                        </Badge>
                      </div>
                      <button
                        type="button"
                        onClick={() => remove(column.campaignId)}
                        className="rounded-lg p-1 text-zinc-500 hover:bg-rose-950/30 hover:text-rose-400"
                        aria-label={`Remove ${column.title} from comparison`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.label} className="border-b border-zinc-800/60 last:border-0">
                  <th scope="row" className="p-4 align-top font-semibold text-zinc-300">
                    <span className="flex items-center gap-1.5">
                      {row.icon}
                      {row.label}
                    </span>
                  </th>
                  {columns.map((column) => (
                    <td key={column.campaignId} className="p-4 align-top">
                      <div className="space-y-1.5">
                        {row.render(column)}
                        {row.metric && isLeader(row.metric, column.campaignId) && (
                          <Badge className="border-emerald-800 bg-emerald-950 text-[10px] text-emerald-300">
                            {LEADER_LABELS[row.metric]}
                          </Badge>
                        )}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {comparison && comparison.missing.length > 0 && (
            <p className="border-t border-zinc-800 p-3 text-xs text-zinc-500">
              Not found: {comparison.missing.join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default CampaignSideBySideComparison;
