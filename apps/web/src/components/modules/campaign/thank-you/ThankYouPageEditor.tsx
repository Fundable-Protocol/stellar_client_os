"use client";

import { useEffect, useRef, useState } from "react";
import { useWallet } from "@/providers/StellarWalletProvider";
import {
  PledgeThankYouContent,
  type PledgeThankYouDetails,
} from "./PledgeThankYouContent";

const EMPTY_DETAILS: PledgeThankYouDetails = {
  greeting: "",
  body: "",
  imageUrl: "",
  videoUrl: "",
  nextSteps: "",
};

export function ThankYouPageEditor({ campaignId }: { campaignId: string }) {
  const { address } = useWallet();
  const [details, setDetails] = useState<PledgeThankYouDetails>(EMPTY_DETAILS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/campaigns/${campaignId}/thank-you`)
      .then(async (response) => {
        const body = (await response.json()) as PledgeThankYouDetails & { error?: string };
        if (!response.ok) throw new Error(body.error ?? "Could not load thank-you page settings.");
        if (active) setDetails({ ...EMPTY_DETAILS, ...body });
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load thank-you page settings.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [campaignId]);

  const update = (field: keyof PledgeThankYouDetails, value: string) => {
    setSaved(false);
    setDetails((current) => ({ ...current, [field]: value }));
  };

  const formatSelection = (marker: "**" | "*") => {
    const textarea = bodyRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    if (start === end) return;
    const body = details.body ?? "";
    update("body", `${body.slice(0, start)}${marker}${body.slice(start, end)}${marker}${body.slice(end)}`);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!address) {
      setError("Connect the creator wallet to save these settings.");
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/thank-you`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creatorAddress: address, ...details }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not save thank-you page settings.");
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save thank-you page settings.");
    } finally {
      setSaving(false);
    }
  };

  const inputClass = "mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100";
  if (loading) return <p className="p-8 text-zinc-300">Loading thank-you page settings…</p>;

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6 text-zinc-100">
      <header>
        <h1 className="text-2xl font-bold">Post-pledge thank-you page</h1>
        <p className="mt-2 text-sm text-zinc-400">Add a personal message, campaign image or video, and clear next steps for backers.</p>
      </header>
      {error && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p>}
      {saved && <p role="status" className="text-sm text-emerald-300">Thank-you page settings saved.</p>}
      <form onSubmit={save} className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
          <label className="block text-sm font-medium">Greeting
            <input value={details.greeting} maxLength={240} onChange={(event) => update("greeting", event.target.value)} className={inputClass} placeholder="Thank you for supporting us!" />
          </label>
          <div>
            <label htmlFor="thank-you-message" className="block text-sm font-medium">Rich-text message</label>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => formatSelection("**")} className="rounded border border-zinc-700 px-2 py-1 text-xs font-bold">Bold selected text</button>
              <button type="button" onClick={() => formatSelection("*")} className="rounded border border-zinc-700 px-2 py-1 text-xs italic">Italic selected text</button>
            </div>
            <textarea id="thank-you-message" ref={bodyRef} value={details.body} maxLength={2000} rows={6} onChange={(event) => update("body", event.target.value)} className={inputClass} placeholder="Write your personal message. Select text and use the formatting buttons." />
            <p className="text-right text-xs text-zinc-500">{(details.body ?? "").length}/2000</p>
          </div>
          <label className="block text-sm font-medium">Image URL (HTTPS)
            <input type="url" value={details.imageUrl} onChange={(event) => update("imageUrl", event.target.value)} className={inputClass} placeholder="https://example.com/campaign.jpg" />
          </label>
          <label className="block text-sm font-medium">Video URL (YouTube or Vimeo)
            <input type="url" value={details.videoUrl} onChange={(event) => update("videoUrl", event.target.value)} className={inputClass} placeholder="https://youtu.be/..." />
          </label>
          <label className="block text-sm font-medium">Next steps for backers
            <textarea value={details.nextSteps} maxLength={1000} rows={3} onChange={(event) => update("nextSteps", event.target.value)} className={inputClass} placeholder="Tell backers what happens next." />
          </label>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => setPreview((value) => !value)} className="rounded-lg border border-zinc-600 px-4 py-2 text-sm font-semibold">
              {preview ? "Hide preview" : "Preview"}
            </button>
            <button type="submit" disabled={saving} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {saving ? "Saving…" : "Save thank-you page"}
            </button>
          </div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-5">
          <h2 className="text-lg font-semibold">Backer view preview</h2>
          {preview ? (
            <PledgeThankYouContent details={details} />
          ) : (
            <p className="mt-3 text-sm text-zinc-500">Select Preview to see how this page will appear after a pledge.</p>
          )}
        </div>
      </form>
    </main>
  );
}
