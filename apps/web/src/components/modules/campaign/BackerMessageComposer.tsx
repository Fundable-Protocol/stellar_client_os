"use client";

/**
 * Backer Message Composer — Issue #1206
 *
 * Displayed in the creator dashboard. Allows the campaign creator to:
 *  - Send a direct message to an individual backer
 *  - Broadcast to all backers in a specific reward tier
 *  - Broadcast to all backers on the campaign
 *
 * Acceptance Criteria:
 * - Message composer in creator dashboard
 * - Subject + body fields
 * - Recipient type selector (individual / tier / all backers)
 * - Shows sent-message history
 */

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Inbox,
  Loader2,
  MessageSquare,
  Send,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  BackerMessage,
  MESSAGE_BODY_MAX_LENGTH,
  MESSAGE_SUBJECT_MAX_LENGTH,
  MessageRecipientType,
  RECIPIENT_TYPE_LABELS,
  SendMessageInput,
} from "@/types/backer-messaging";

export interface BackerMessageComposerProps {
  campaignId: string;
  creatorAddress: string;
}

interface RewardTierOption {
  id: string;
  name: string;
}

export function BackerMessageComposer({ campaignId, creatorAddress }: BackerMessageComposerProps) {
  const [tiers, setTiers] = useState<RewardTierOption[]>([]);
  const [sentMessages, setSentMessages] = useState<BackerMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Composer state
  const [recipientType, setRecipientType] = useState<MessageRecipientType>("ALL_BACKERS");
  const [tierId, setTierId] = useState("");
  const [backerAddress, setBackerAddress] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load reward tiers for the tier selector
  useEffect(() => {
    fetch(`/api/campaigns/${campaignId}/reward-tiers`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success && Array.isArray(data.rewardTiers)) {
          setTiers(data.rewardTiers.map((t: { id: string; name: string }) => ({ id: t.id, name: t.name })));
        }
      })
      .catch(() => {/* non-fatal */});
  }, [campaignId]);

  // Load sent message history
  const loadHistory = useCallback(async () => {
    try {
      setLoadingHistory(true);
      const res = await fetch(`/api/campaigns/${campaignId}/messages`);
      const data = await res.json();
      if (data.success && Array.isArray(data.messages)) {
        setSentMessages(data.messages);
      }
    } catch {
      /* non-fatal */
    } finally {
      setLoadingHistory(false);
    }
  }, [campaignId]);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  const handleSend = async () => {
    if (!subject.trim()) { setError("Subject is required."); return; }
    if (!body.trim()) { setError("Message body is required."); return; }
    if (recipientType === "TIER" && !tierId) { setError("Please select a reward tier."); return; }
    if (recipientType === "INDIVIDUAL" && !backerAddress.trim()) {
      setError("Please enter the backer's wallet address.");
      return;
    }

    setError(null);
    setSending(true);
    try {
      const payload: SendMessageInput = {
        campaignId,
        creatorAddress,
        recipientType,
        subject: subject.trim(),
        body: body.trim(),
        ...(recipientType === "TIER" ? { tierId } : {}),
        ...(recipientType === "INDIVIDUAL" ? { backerAddress: backerAddress.trim() } : {}),
      };

      const res = await fetch(`/api/campaigns/${campaignId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error ?? "Failed to send message.");
        return;
      }

      setSent(true);
      setSubject("");
      setBody("");
      setBackerAddress("");
      await loadHistory();
      setTimeout(() => setSent(false), 4000);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <MessageSquare className="h-5 w-5 text-fundable-purple-2" />
        <h2 className="text-xl font-bold text-zinc-950 dark:text-white">Message Backers</h2>
      </div>

      {/* Composer */}
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60 space-y-4">
        {/* Recipient type */}
        <div>
          <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
            Send to
          </label>
          <div className="flex flex-wrap gap-2">
            {(["ALL_BACKERS", "TIER", "INDIVIDUAL"] as MessageRecipientType[]).map((type) => (
              <button
                key={type}
                type="button"
                aria-pressed={recipientType === type}
                onClick={() => { setRecipientType(type); setError(null); }}
                className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition ${
                  recipientType === type
                    ? "border-purple-600 bg-purple-600 text-white"
                    : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                }`}
              >
                {RECIPIENT_TYPE_LABELS[type]}
              </button>
            ))}
          </div>
        </div>

        {/* Tier selector */}
        {recipientType === "TIER" && (
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Reward tier
            </label>
            <div className="relative">
              <select
                value={tierId}
                onChange={(e) => setTierId(e.target.value)}
                className="w-full appearance-none rounded-md border border-zinc-300 bg-white px-3 py-2 pr-8 text-sm text-zinc-900 focus:border-purple-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                <option value="">Select a tier…</option>
                {tiers.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-2.5 h-4 w-4 text-zinc-400" />
            </div>
          </div>
        )}

        {/* Individual backer address */}
        {recipientType === "INDIVIDUAL" && (
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Backer wallet address
            </label>
            <Input
              data-testid="message-backer-address"
              placeholder="G…"
              value={backerAddress}
              onChange={(e) => setBackerAddress(e.target.value)}
            />
          </div>
        )}

        {/* Subject */}
        <div>
          <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
            Subject
          </label>
          <Input
            data-testid="message-subject"
            maxLength={MESSAGE_SUBJECT_MAX_LENGTH}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Update on your campaign…"
          />
          <p className="mt-1 text-right text-[11px] text-zinc-400">
            {subject.length}/{MESSAGE_SUBJECT_MAX_LENGTH}
          </p>
        </div>

        {/* Body */}
        <div>
          <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
            Message
          </label>
          <textarea
            data-testid="message-body"
            rows={6}
            maxLength={MESSAGE_BODY_MAX_LENGTH}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your message to backers here…"
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-purple-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <p className="mt-1 text-right text-[11px] text-zinc-400">
            {body.length}/{MESSAGE_BODY_MAX_LENGTH}
          </p>
        </div>

        {error && (
          <p role="alert" className="text-xs text-red-500">{error}</p>
        )}

        {sent && (
          <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            Message sent successfully!
          </div>
        )}

        <Button
          data-testid="message-send"
          onClick={handleSend}
          disabled={sending}
          className="flex items-center gap-2"
        >
          {sending ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
          ) : (
            <><Send className="h-4 w-4" /> Send message</>
          )}
        </Button>
      </div>

      {/* Sent message history */}
      <div>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          <Inbox className="h-4 w-4" />
          Sent messages
        </h3>

        {loadingHistory ? (
          <p className="text-xs text-zinc-500">Loading history…</p>
        ) : sentMessages.length === 0 ? (
          <p className="text-xs text-zinc-500">No messages sent yet.</p>
        ) : (
          <ol className="space-y-2">
            {sentMessages.map((msg) => (
              <li
                key={msg.id}
                className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/60"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {msg.subject}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-500">
                      <Users className="h-3 w-3" />
                      {RECIPIENT_TYPE_LABELS[msg.recipientType]}
                      {msg.recipientCount != null && ` · ${msg.recipientCount} recipient${msg.recipientCount === 1 ? "" : "s"}`}
                      {msg.sentAt && ` · ${new Date(msg.sentAt).toLocaleDateString()}`}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      msg.status === "SENT"
                        ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400 text-[10px]"
                        : msg.status === "FAILED"
                        ? "border-red-500/40 text-red-500 text-[10px]"
                        : "border-zinc-400/40 text-zinc-500 text-[10px]"
                    }
                  >
                    {msg.status}
                  </Badge>
                </div>
                <p className="mt-2 line-clamp-2 text-xs text-zinc-600 dark:text-zinc-400">
                  {msg.body}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
