import type { ReactNode } from "react";

export type ActionType =
  | "all"
  | "stream_created"
  | "stream_cancelled"
  | "withdrawal"
  | "payment"
  | "split"
  | "admin_change"
  | "upgrade"
  | "pause"
  | "resume";

export interface AuditFilters {
  actionType: ActionType;
  dateRange: "7d" | "30d" | "custom";
  customStart: string;
  customEnd: string;
  search: string;
  user: string;
  resource: string;
}

export const DEFAULT_FILTERS: AuditFilters = {
  actionType: "all",
  dateRange: "30d",
  customStart: "",
  customEnd: "",
  search: "",
  user: "",
  resource: "",
};

interface FilterPanelProps {
  filters: AuditFilters;
  onChange: (filters: AuditFilters) => void;
  onReset: () => void;
  totalResults: number;
}

export function FilterPanel({
  filters,
  onChange,
  onReset,
  totalResults,
}: FilterPanelProps) {
  const updateField = <K extends keyof AuditFilters>(key: K, value: AuditFilters[K]) => {
    onChange({ ...filters, [key]: value });
  };

  return (
    <aside className="rounded-2xl border border-white/10 bg-[#111827] p-4 text-sm text-slate-200">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">Filters</h2>
        <span className="text-xs text-slate-400">{totalResults} results</span>
      </div>

      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">Search</label>
          <input
            value={filters.search}
            onChange={(event) => updateField("search", event.target.value)}
            className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none ring-0"
            placeholder="Search actions"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">Action</label>
          <select
            value={filters.actionType}
            onChange={(event) => updateField("actionType", event.target.value as ActionType)}
            className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none"
          >
            <option value="all">All</option>
            <option value="stream_created">stream created</option>
            <option value="stream_cancelled">stream cancelled</option>
            <option value="withdrawal">withdrawal</option>
            <option value="payment">payment</option>
            <option value="split">split</option>
            <option value="admin_change">admin change</option>
            <option value="upgrade">upgrade</option>
            <option value="pause">pause</option>
            <option value="resume">resume</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">Date range</label>
          <select
            value={filters.dateRange}
            onChange={(event) => updateField("dateRange", event.target.value as AuditFilters["dateRange"])}
            className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="custom">Custom range</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wide text-slate-400">From</label>
            <input
              type="date"
              value={filters.customStart}
              onChange={(event) => updateField("customStart", event.target.value)}
              className="w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-2 text-sm text-white outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wide text-slate-400">To</label>
            <input
              type="date"
              value={filters.customEnd}
              onChange={(event) => updateField("customEnd", event.target.value)}
              className="w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-2 text-sm text-white outline-none"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">User</label>
          <input
            value={filters.user}
            onChange={(event) => updateField("user", event.target.value)}
            className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none"
            placeholder="alice@stellar.org"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">Resource</label>
          <input
            value={filters.resource}
            onChange={(event) => updateField("resource", event.target.value)}
            className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none"
            placeholder="stream-..."
          />
        </div>

        <button
          type="button"
          onClick={onReset}
          className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700"
        >
          Reset filters
        </button>
      </div>
    </aside>
  );
}

export type AuditFilterPanelProps = FilterPanelProps;
export const __auditFilterPanelPlaceholder = true;
