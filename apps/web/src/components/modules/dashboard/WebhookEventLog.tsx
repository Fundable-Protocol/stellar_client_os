"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw, Webhook } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWallet } from "@/providers/StellarWalletProvider";
import { useTranslation } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/translate";
import type { WebhookDeliveryStatus } from "@/types/webhook";

interface LoggedDelivery {
  id: string;
  event: string;
  timestamp: string;
  statusCode: number | null;
  errorMessage: string | null;
  attempt: number;
  maxAttempts?: number;
  status: WebhookDeliveryStatus;
}

const STATUS_STYLES: Record<WebhookDeliveryStatus, string> = {
  delivered: "bg-emerald-950/60 text-emerald-300 border-emerald-700/40",
  retrying: "bg-amber-950/60 text-amber-300 border-amber-700/40",
  failed: "bg-red-950/60 text-red-300 border-red-700/40",
};

const KNOWN_EVENTS = new Set([
  "pledge.created",
  "campaign.milestone_reached",
  "campaign.ended",
  "refund.requested",
  "webhook.test",
]);

/** Dashboard view of the creator's recent webhook deliveries (#1220). */
export function WebhookEventLog() {
  const { address } = useWallet();
  const { t, locale } = useTranslation();
  const [events, setEvents] = useState<LoggedDelivery[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    const base = `/api/creators/${encodeURIComponent(address)}/webhooks`;
    const headers = { "x-caller-address": address };
    try {
      const [configRes, eventsRes] = await Promise.all([
        fetch(base, { headers }),
        fetch(`${base}/events?limit=25`, { headers }),
      ]);
      const configData = configRes.ok ? ((await configRes.json()) as { config: unknown }) : null;
      const eventsData = eventsRes.ok ? ((await eventsRes.json()) as { events: LoggedDelivery[] }) : null;
      setConfigured(Boolean(configData?.config));
      setEvents(eventsData?.events ?? []);
    } catch {
      setConfigured(false);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!address) return null;

  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "medium" });

  return (
    <section aria-labelledby="webhook-log-title" className="mx-auto max-w-6xl rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 text-white">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 id="webhook-log-title" className="flex items-center gap-2 text-lg font-semibold">
            <Webhook aria-hidden="true" className="h-5 w-5 text-purple-400" /> {t("webhooks.log.title")}
          </h2>
          <p className="text-sm text-zinc-400">{t("webhooks.log.description")}</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
        >
          <RefreshCw aria-hidden="true" className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> {t("common.refresh")}
        </button>
      </div>

      {configured === false ? (
        <div className="space-y-2 text-sm text-zinc-400">
          <p>{t("webhooks.log.notConfigured")}</p>
          <Link href="/settings/webhooks" className="text-purple-300 underline-offset-2 hover:underline">
            {t("webhooks.log.configure")}
          </Link>
        </div>
      ) : events.length === 0 ? (
        <p className="text-sm text-zinc-400">{loading ? t("common.loading") : t("webhooks.log.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-start text-sm">
            <thead className="text-xs uppercase text-zinc-500">
              <tr>
                <th scope="col" className="py-2 pe-4 text-start font-medium">{t("webhooks.log.time")}</th>
                <th scope="col" className="py-2 pe-4 text-start font-medium">{t("webhooks.log.event")}</th>
                <th scope="col" className="py-2 pe-4 text-start font-medium">{t("webhooks.log.status")}</th>
                <th scope="col" className="py-2 pe-4 text-start font-medium">{t("webhooks.log.attempt")}</th>
                <th scope="col" className="py-2 text-start font-medium">{t("webhooks.log.response")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {events.map((entry) => (
                <tr key={`${entry.id}-${entry.attempt}`}>
                  <td className="whitespace-nowrap py-2 pe-4 text-zinc-300 tabular-nums">
                    {dateFormat.format(new Date(entry.timestamp))}
                  </td>
                  <td className="py-2 pe-4">
                    <span className="text-zinc-100">
                      {KNOWN_EVENTS.has(entry.event) ? t(`webhooks.events.${entry.event.replace(".", "_")}` as MessageKey) : entry.event}
                    </span>
                    <code className="ms-2 text-[10px] text-zinc-500">{entry.event}</code>
                  </td>
                  <td className="py-2 pe-4">
                    <span className={cn("rounded-full border px-2 py-0.5 text-xs", STATUS_STYLES[entry.status])}>
                      {t(`webhooks.log.${entry.status}`)}
                    </span>
                  </td>
                  <td className="py-2 pe-4 text-zinc-300 tabular-nums">
                    {entry.maxAttempts
                      ? t("webhooks.log.attemptOf", { attempt: entry.attempt, max: entry.maxAttempts })
                      : entry.attempt}
                  </td>
                  <td className="max-w-xs truncate py-2 text-zinc-400" title={entry.errorMessage ?? undefined}>
                    {entry.statusCode ?? entry.errorMessage ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
