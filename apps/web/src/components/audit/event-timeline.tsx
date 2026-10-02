import type { ReactNode } from "react";

export type AuditEvent = {
  id: string;
  actionType: string;
  title: string;
  description?: string;
  timestamp: string;
  user?: string;
  resource?: string;
  txHash?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
};

interface EventTimelineProps {
  events: AuditEvent[];
  selectedId: string | null;
  onSelect: (event: AuditEvent) => void;
  page: number;
  pageSize: number;
}

export function EventTimeline({ events, selectedId, onSelect, page, pageSize }: EventTimelineProps) {
  const start = (page - 1) * pageSize;
  const visible = events.slice(start, start + pageSize);

  return (
    <div className="rounded-2xl border border-white/10 bg-[#111827] p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">Event timeline</h2>
        <span className="text-xs text-slate-400">{events.length} events</span>
      </div>

      <div className="space-y-3">
        {visible.map((event) => (
          <button
            key={event.id}
            type="button"
            onClick={() => onSelect(event)}
            className={`w-full rounded-xl border p-3 text-left transition-colors ${
              selectedId === event.id
                ? "border-violet-500/60 bg-violet-500/10"
                : "border-white/10 bg-slate-900/80 hover:border-white/20 hover:bg-slate-900"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-white">{event.title}</p>
                <p className="mt-1 text-xs text-slate-400">{event.actionType}</p>
              </div>
              <span className="text-[10px] uppercase tracking-wide text-slate-400">
                {new Date(event.timestamp).toLocaleDateString()}
              </span>
            </div>
            {event.description ? <p className="mt-2 text-xs text-slate-300">{event.description}</p> : null}
            <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-slate-400">
              {event.user ? <span>User: {event.user}</span> : null}
              {event.resource ? <span>Resource: {event.resource}</span> : null}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export const __auditEventTimelinePlaceholder = true;
