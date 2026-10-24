"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { Copy, KeyRound, Send, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/translate";

const EVENTS = ["pledge.created", "campaign.milestone_reached", "campaign.ended", "refund.requested"] as const;
type CreatorEvent = (typeof EVENTS)[number];

interface WebhookConfig {
  id: string;
  url: string;
  events: CreatorEvent[];
  enabled: boolean;
  secretPreview: string;
}

type Feedback = { type: "success" | "error"; message: string } | null;

/** Creator settings for the lifecycle webhook endpoint (#1220). */
export function CreatorWebhookSettings({ creatorAddress }: { creatorAddress: string }) {
  const { t } = useTranslation();
  const ids = useId();
  const [config, setConfig] = useState<WebhookConfig | null>(null);
  const [maxAttempts, setMaxAttempts] = useState(5);
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [events, setEvents] = useState<CreatorEvent[]>([...EVENTS]);
  const [enabled, setEnabled] = useState(true);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const endpoint = `/api/creators/${encodeURIComponent(creatorAddress)}/webhooks`;
  const headers = { "Content-Type": "application/json", "x-caller-address": creatorAddress };

  const applyConfig = useCallback((next: WebhookConfig | null) => {
    setConfig(next);
    if (next) {
      setUrl(next.url);
      setEvents(next.events);
      setEnabled(next.enabled);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(endpoint, { headers: { "x-caller-address": creatorAddress } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { config: WebhookConfig | null; maxAttempts?: number } | null) => {
        if (cancelled || !data) return;
        applyConfig(data.config);
        if (data.maxAttempts) setMaxAttempts(data.maxAttempts);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [endpoint, creatorAddress, applyConfig]);

  const request = async (method: string, path = "", body?: Record<string, unknown>) => {
    const res = await fetch(`${endpoint}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : t("common.somethingWentWrong"));
    return data;
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setFeedback(null);
    try {
      await action();
    } catch (err) {
      setFeedback({ type: "error", message: err instanceof Error ? err.message : t("common.somethingWentWrong") });
    } finally {
      setBusy(false);
    }
  };

  const save = (rotateSecret = false) =>
    run(async () => {
      const data = await request("PUT", "", {
        url,
        events,
        enabled,
        ...(secret.trim() && { secret: secret.trim() }),
        ...(rotateSecret && { rotateSecret: true }),
      });
      applyConfig(data.config as WebhookConfig);
      setSecret("");
      setRevealedSecret(typeof data.secret === "string" ? data.secret : null);
      setCopied(false);
      setFeedback({ type: "success", message: t("webhooks.saved") });
    });

  const remove = () =>
    run(async () => {
      await request("DELETE");
      setConfig(null);
      setUrl("");
      setEvents([...EVENTS]);
      setEnabled(true);
      setRevealedSecret(null);
      setFeedback({ type: "success", message: t("webhooks.removed") });
    });

  const sendTest = () =>
    run(async () => {
      await request("POST", "/test");
      setFeedback({ type: "success", message: t("webhooks.testQueued") });
    });

  const toggleEvent = (event: CreatorEvent) =>
    setEvents((current) => (current.includes(event) ? current.filter((e) => e !== event) : [...current, event]));

  const inputClass =
    "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none";

  if (loading) return <p className="text-sm text-zinc-400">{t("common.loading")}</p>;

  return (
    <section aria-labelledby={`${ids}-title`} className="space-y-5 rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
      <h2 id={`${ids}-title`} className="text-lg font-semibold text-zinc-100">
        {t("webhooks.configTitle")}
      </h2>

      <div>
        <label htmlFor={`${ids}-url`} className="mb-1 block text-sm font-medium text-zinc-300">
          {t("webhooks.urlLabel")}
        </label>
        <input
          id={`${ids}-url`}
          type="url"
          inputMode="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t("webhooks.urlPlaceholder")}
          className={cn(inputClass, "ltr-isolate")}
        />
      </div>

      <div>
        <label htmlFor={`${ids}-secret`} className="mb-1 block text-sm font-medium text-zinc-300">
          {t("webhooks.secretLabel")}
        </label>
        <input
          id={`${ids}-secret`}
          type="password"
          autoComplete="new-password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder={t("webhooks.secretPlaceholder")}
          aria-describedby={`${ids}-secret-hint`}
          className={inputClass}
        />
        <p id={`${ids}-secret-hint`} className="mt-1 text-xs text-zinc-500">
          {t("webhooks.secretHint")}
        </p>
        {config && (
          <p className="mt-1 text-xs text-zinc-400">
            {t("webhooks.secretMasked", { secret: config.secretPreview })}
          </p>
        )}
        {revealedSecret && (
          <div role="status" className="mt-3 space-y-2 rounded-lg border border-amber-600/40 bg-amber-950/30 p-3">
            <p className="text-xs text-amber-200">{t("webhooks.secretRevealOnce")}</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded bg-black/40 px-2 py-1 text-xs text-amber-100">{revealedSecret}</code>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(revealedSecret).then(() => setCopied(true));
                }}
                className="inline-flex items-center gap-1 rounded-md border border-amber-600/40 px-2 py-1 text-xs text-amber-200 hover:bg-amber-900/40"
              >
                <Copy aria-hidden="true" className="h-3.5 w-3.5" /> {copied ? t("common.copied") : t("common.copy")}
              </button>
            </div>
          </div>
        )}
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-zinc-300">{t("webhooks.eventsLabel")}</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {EVENTS.map((event) => (
            <label key={event} className="flex items-center gap-2 rounded-lg border border-zinc-800 px-3 py-2 text-sm text-zinc-200">
              <input
                type="checkbox"
                checked={events.includes(event)}
                onChange={() => toggleEvent(event)}
                className="accent-purple-500"
              />
              <span>{t(`webhooks.events.${event.replace(".", "_")}` as MessageKey)}</span>
              <code className="ms-auto text-[10px] text-zinc-500">{event}</code>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex items-center gap-2 text-sm text-zinc-200">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="accent-purple-500" />
        {t("webhooks.enabled")}
      </label>

      <p className="text-xs text-zinc-500">{t("webhooks.retryPolicy", { count: maxAttempts })}</p>

      {feedback && (
        <p role={feedback.type === "error" ? "alert" : "status"} className={cn("text-sm", feedback.type === "error" ? "text-red-400" : "text-emerald-400")}>
          {feedback.message}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy || !url.trim() || events.length === 0}
          onClick={() => save()}
          className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50"
        >
          {busy ? t("common.saving") : t("common.save")}
        </button>
        {config && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={sendTest}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
            >
              <Send aria-hidden="true" className="h-4 w-4" /> {t("webhooks.sendTest")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => save(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
            >
              <KeyRound aria-hidden="true" className="h-4 w-4" /> {t("webhooks.rotateSecret")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={remove}
              className="ms-auto inline-flex items-center gap-1.5 rounded-lg border border-red-700/50 px-3 py-2 text-sm text-red-300 hover:bg-red-950/40 disabled:opacity-50"
            >
              <Trash2 aria-hidden="true" className="h-4 w-4" /> {t("common.remove")}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
