import type { AuditEvent } from "./event-timeline";

interface EventDetailsProps {
  event: AuditEvent;
  onClose: () => void;
}

export function EventDetails({ event, onClose }: EventDetailsProps) {
  return (
    <aside className="rounded-2xl border border-white/10 bg-[#111827] p-4 text-sm text-slate-200">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">Event details</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-white/10 bg-slate-900 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
        >
          Close
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400">Action</p>
          <p className="mt-1 text-white">{event.actionType}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400">Title</p>
          <p className="mt-1 text-white">{event.title}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400">Timestamp</p>
          <p className="mt-1 text-white">{new Date(event.timestamp).toLocaleString()}</p>
        </div>
        {event.user ? (
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">User</p>
            <p className="mt-1 text-white">{event.user}</p>
          </div>
        ) : null}
        {event.resource ? (
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Resource</p>
            <p className="mt-1 text-white">{event.resource}</p>
          </div>
        ) : null}
        {event.txHash ? (
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Tx hash</p>
            <p className="mt-1 break-all text-white">{event.txHash}</p>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

export const __auditEventDetailsPlaceholder = true;
