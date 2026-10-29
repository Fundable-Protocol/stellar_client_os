"use client";

import { useEffect, useState } from "react";

export default function PledgeRecoveryOptOutPage() {
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token") ?? "");
  }, []);

  const optOut = async () => {
    setSubmitting(true);
    try {
      const response = await fetch("/api/pledge-recovery/opt-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to update email preferences.");
      setMessage("You have opted out of abandoned pledge reminder emails.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update email preferences.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-xl font-bold text-zinc-950 dark:text-white">Pledge reminder preferences</h1>
        {message ? (
          <p role="status" className="mt-4 text-sm text-zinc-600 dark:text-zinc-300">{message}</p>
        ) : (
          <>
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
              Confirm that you no longer want to receive abandoned pledge reminders.
            </p>
            <button
              type="button"
              onClick={optOut}
              disabled={!token || submitting}
              className="mt-5 rounded-md bg-fundable-purple-2 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {submitting ? "Updating..." : "Opt out of reminders"}
            </button>
            {!token && <p className="mt-3 text-sm text-rose-600">This opt-out link is missing its token.</p>}
          </>
        )}
      </section>
    </main>
  );
}
