"use client";

/**
 * Invite-by-email modal for the ambassador program.
 *
 * The creator enters the ambassador's email address and the tier they are
 * recruited into; the API sends the invitation email and returns the invite
 * link so it can also be shared manually.
 */

import { useCallback, useState } from "react";
import { AlertCircle, CheckCircle2, Copy, Loader2, Mail, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AMBASSADOR_TIERS, AMBASSADOR_TIER_ORDER } from "@/services/campaign-ambassador.service";
import type { AmbassadorTier } from "@/types/ambassador";

export interface AmbassadorInviteModalProps {
  campaignId: string;
  campaignTitle?: string;
  /** Wallet address of the creator — sent to the API for authorization. */
  creatorAddress: string;
  /** Called after a successful invitation. */
  onInvited?: (invite: { token: string; email: string; tier: AmbassadorTier }) => void;
  trigger?: React.ReactNode;
}

export function AmbassadorInviteModal({
  campaignId,
  campaignTitle,
  creatorAddress,
  onInvited,
  trigger,
}: AmbassadorInviteModalProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [tier, setTier] = useState<AmbassadorTier>("SEED");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(async () => {
    if (!email.trim()) {
      setError("An email address is required.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/ambassadors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creatorAddress,
          email: email.trim(),
          name: name.trim() || undefined,
          tier,
          campaignTitle,
          invitedByName: "The campaign team",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to send the invitation");

      setInviteLink(json.inviteLink ?? null);
      onInvited?.(json.invite);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send the invitation");
    } finally {
      setSending(false);
    }
  }, [campaignId, creatorAddress, email, name, onInvited, tier, campaignTitle]);

  const copyLink = useCallback(async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Could not copy the link. Copy it manually instead.");
    }
  }, [inviteLink]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button" className="bg-purple-600 text-white hover:bg-purple-500">
            <Mail className="h-4 w-4" /> Invite ambassador
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite an ambassador</DialogTitle>
          <DialogDescription>
            Send an invitation by email. The ambassador joins the program through a unique link and
            starts earning rewards as they bring in backers.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label htmlFor="ambassador-email" className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              Email address
            </label>
            <Input
              id="ambassador-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="ambassador@example.com"
              className="mt-1.5 bg-zinc-950 border-zinc-800 text-zinc-100"
            />
          </div>

          <div>
            <label htmlFor="ambassador-name" className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              Name (optional)
            </label>
            <Input
              id="ambassador-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Alex Rivera"
              className="mt-1.5 bg-zinc-950 border-zinc-800 text-zinc-100"
            />
          </div>

          <div>
            <label htmlFor="ambassador-tier" className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              Starting tier
            </label>
            <select
              id="ambassador-tier"
              value={tier}
              onChange={(event) => setTier(event.target.value as AmbassadorTier)}
              className="mt-1.5 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
            >
              {AMBASSADOR_TIER_ORDER.map((option) => (
                <option key={option} value={option}>
                  {AMBASSADOR_TIERS[option].label} — from {AMBASSADOR_TIERS[option].minPledgeAmount}{" "}
                  pledged
                </option>
              ))}
            </select>
          </div>

          {error && (
            <p role="alert" className="flex items-center gap-2 text-xs text-red-400">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
            </p>
          )}

          {inviteLink && (
            <div className="space-y-2 rounded-lg border border-emerald-900/60 bg-emerald-950/20 p-3">
              <p className="flex items-center gap-2 text-xs text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" /> Invitation sent to {email}
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded bg-zinc-950 px-2 py-1 text-[11px] text-zinc-400">
                  {inviteLink}
                </code>
                <Button type="button" size="sm" variant="outline" onClick={() => void copyLink()}>
                  <Copy className="h-3.5 w-3.5" /> {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)} className="text-zinc-400">
            Close
          </Button>
          <Button
            type="button"
            onClick={() => void send()}
            disabled={sending}
            className="bg-purple-600 text-white hover:bg-purple-500"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Send invitation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AmbassadorInviteModal;
