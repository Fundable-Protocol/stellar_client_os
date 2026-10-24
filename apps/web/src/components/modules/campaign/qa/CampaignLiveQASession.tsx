"use client";

import { useEffect, useState } from "react";
import { CalendarClock, MessageSquare, Mic2, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CampaignLiveQASession as LiveQASession } from "@/services/campaign-live-qa.service";

const SESSION_DURATION_MS = 60 * 60 * 1000;

function defaultScheduleValue() {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  date.setMinutes(0, 0, 0);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export interface CampaignLiveQASessionProps {
  campaignId: string;
  creatorAddress: string;
  viewerAddress: string;
  isCreator: boolean;
}

export function CampaignLiveQASession({
  campaignId,
  creatorAddress,
  viewerAddress,
  isCreator,
}: CampaignLiveQASessionProps) {
  const [session, setSession] = useState<LiveQASession | null>(null);
  const [topic, setTopic] = useState("");
  const [scheduledAt, setScheduledAt] = useState(defaultScheduleValue);
  const [question, setQuestion] = useState("");
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({});
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/qa/live`, { cache: "no-store" });
        if (!response.ok) throw new Error("Unable to load the Q&A session.");
        const data = await response.json() as { session: LiveQASession | null };
        if (!cancelled) setSession(data.session);
      } catch {
        if (!cancelled) setError("Could not load live Q&A. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void refresh();
    const poll = window.setInterval(() => void refresh(), 5_000);
    const clock = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
      window.clearInterval(clock);
    };
  }, [campaignId]);

  const sendAction = async (payload: Record<string, string>) => {
    setError("");
    const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/qa/live`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, actorAddress: viewerAddress }),
    });
    const data = await response.json() as { error?: string };
    if (!response.ok) throw new Error(data.error ?? "Unable to update the Q&A session.");
    const updated = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/qa/live`, { cache: "no-store" });
    if (!updated.ok) throw new Error("Your update was saved, but the session could not be refreshed.");
    const sessionData = await updated.json() as { session: LiveQASession | null };
    setSession(sessionData.session);
  };

  const submit = async (payload: Record<string, string>, onSuccess?: () => void) => {
    try {
      await sendAction(payload);
      onSuccess?.();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to update the Q&A session.");
    }
  };

  const scheduledTime = session ? Date.parse(session.scheduledAt) : 0;
  const isLive = Boolean(session && now >= scheduledTime && now < scheduledTime + SESSION_DURATION_MS);
  const hasEnded = Boolean(session && now >= scheduledTime + SESSION_DURATION_MS);
  const canParticipate = Boolean(session && !hasEnded);
  const sortedQuestions = [...(session?.questions ?? [])].sort((left, right) => right.upvotes - left.upvotes || left.createdAt - right.createdAt);

  return (
    <section aria-labelledby="live-qa-title" className="space-y-5 border-b border-zinc-800 pb-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="live-qa-title" className="flex items-center gap-2 text-lg font-bold text-zinc-100">
            <Mic2 className="h-5 w-5 text-emerald-400" /> Live campaign Q&amp;A
          </h2>
          <p className="mt-1 text-xs text-zinc-400">Questions are ranked by backer votes. The creator answers during the session.</p>
        </div>
        {session && (
          <span className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold ${isLive ? "border-emerald-700 bg-emerald-950/40 text-emerald-300" : hasEnded ? "border-zinc-700 text-zinc-400" : "border-sky-800 bg-sky-950/30 text-sky-300"}`}>
            {isLive ? <span className="h-2 w-2 rounded-full bg-emerald-400" /> : <CalendarClock className="h-3.5 w-3.5" />}
            {isLive ? "Live now" : hasEnded ? "Session ended" : "Scheduled"}
          </span>
        )}
      </div>

      {isCreator && (
        <form
          className="grid gap-3 border-y border-zinc-800 py-4 sm:grid-cols-[minmax(0,1fr)_220px_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            void submit({ action: "schedule", topic, scheduledAt: new Date(scheduledAt).toISOString() }, () => setTopic(""));
          }}
        >
          <label className="space-y-1.5 text-xs font-medium text-zinc-300">
            Session topic
            <Input value={topic} onChange={(event) => setTopic(event.target.value)} maxLength={160} placeholder={session?.topic ?? "What should backers ask about?"} required />
          </label>
          <label className="space-y-1.5 text-xs font-medium text-zinc-300">
            Date and time
            <Input type="datetime-local" value={scheduledAt} min={defaultScheduleValue()} onChange={(event) => setScheduledAt(event.target.value)} required />
          </label>
          <Button type="submit" disabled={!topic.trim() || !scheduledAt} size="sm" className="bg-emerald-700 text-white hover:bg-emerald-600">
            <CalendarClock className="mr-1.5 h-4 w-4" /> {session ? "Update session" : "Schedule Q&A"}
          </Button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-zinc-500">Loading session...</p>
      ) : session ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <strong className="text-zinc-100">{session.topic}</strong>
          <span className="text-zinc-500">{new Date(session.scheduledAt).toLocaleString()}</span>
          {isCreator && session.createdBy !== creatorAddress && <span className="text-amber-400">This session belongs to another creator.</span>}
        </div>
      ) : (
        <p className="text-sm text-zinc-500">No live Q&amp;A is scheduled yet.</p>
      )}

      {session && canParticipate && (
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            void submit({ action: "ask", content: question }, () => setQuestion(""));
          }}
        >
          <Input value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={500} placeholder="Submit a question for the session" required />
          <Button type="submit" disabled={!question.trim()} size="sm" className="bg-zinc-100 text-zinc-900 hover:bg-white">
            <MessageSquare className="mr-1.5 h-4 w-4" /> Submit question
          </Button>
        </form>
      )}

      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}

      {session && sortedQuestions.length > 0 && (
        <ol className="space-y-3" aria-label="Questions ranked by votes">
          {sortedQuestions.map((item, index) => (
            <li key={item.id} className="grid gap-3 border-t border-zinc-800 pt-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <span className="min-w-6 pt-0.5 text-xs font-bold tabular-nums text-zinc-500">{index + 1}.</span>
                  <p className="text-sm leading-relaxed text-zinc-200">{item.content}</p>
                </div>
                {item.answer ? (
                  <p className="ml-8 border-l-2 border-emerald-700 pl-3 text-sm text-emerald-200">{item.answer.content}</p>
                ) : isCreator && isLive ? (
                  <form
                    className="ml-8 flex flex-col gap-2 sm:flex-row"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const content = answerDrafts[item.id] ?? "";
                      void submit({ action: "answer", questionId: item.id, content }, () => setAnswerDrafts((drafts) => ({ ...drafts, [item.id]: "" })));
                    }}
                  >
                    <Input value={answerDrafts[item.id] ?? ""} onChange={(event) => setAnswerDrafts((drafts) => ({ ...drafts, [item.id]: event.target.value }))} maxLength={1000} placeholder="Creator answer" required />
                    <Button type="submit" size="sm" disabled={!(answerDrafts[item.id] ?? "").trim()}>Answer live</Button>
                  </form>
                ) : null}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canParticipate || item.upvotedBy.includes(viewerAddress)}
                onClick={() => void submit({ action: "upvote", questionId: item.id })}
                aria-label={`Upvote question, ${item.upvotes} votes`}
              >
                <ThumbsUp className="mr-1.5 h-3.5 w-3.5" /> {item.upvotes}
              </Button>
            </li>
          ))}
        </ol>
      )}

      {session && sortedQuestions.length === 0 && <p className="text-sm text-zinc-500">No questions yet. Backers can submit questions before or during the session.</p>}
    </section>
  );
}