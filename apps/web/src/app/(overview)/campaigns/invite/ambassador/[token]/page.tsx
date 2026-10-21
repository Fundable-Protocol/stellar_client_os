"use client";

/**
 * /campaigns/invite/ambassador/[token]
 *
 * Landing page of an ambassador invitation. The ambassador confirms their
 * details and joins the program, which returns their unique referral code.
 */

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Copy,
  Loader2,
  Megaphone,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AMBASSADOR_TIERS } from "@/services/campaign-ambassador.service";
import type { AmbassadorTier } from "@/types/ambassador";

interface InviteView {
  token: string;
  campaignId: string;
  campaignTitle: string;
  name?: string;
  email: string;
  tier: AmbassadorTier;
  invitedByName: string;
  expiresAt: number;
  status: string;
}

export default function AcceptAmbassadorInvitePage() {
  const params = useParams();
  const router = useRouter();
  const token = (params?.token as string) || "";

  const [invite, setInvite] = useState<InviteView | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [stellarAddress, setStellarAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<{ referralCode: string; campaignId: string } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!token) {
        setNotFound("This invitation link is invalid.");
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`/api/ambassadors/invite/${encodeURIComponent(token)}`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setNotFound(json.error ?? "This invitation is invalid or has expired.");
          return;
        }
        setInvite(json.invite);
        setName(json.invite.name ?? "");
      } catch {
        if (!cancelled) setNotFound("This invitation is invalid or has expired.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const accept = useCallback(async () => {
    if (!name.trim()) {
      setFormError("Please enter your name.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch(`/api/ambassadors/invite/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), stellarAddress: stellarAddress.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to accept the invitation");
      setAccepted({
        referralCode: json.referralCode ?? "",
        campaignId: json.ambassador?.campaignId ?? invite?.campaignId ?? "",
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to accept the invitation");
    } finally {
      setSubmitting(false);
    }
  }, [invite?.campaignId, name, stellarAddress, token]);

  const copyCode = useCallback(async () => {
    if (!accepted?.referralCode) return;
    try {
      await navigator.clipboard.writeText(accepted.referralCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setFormError("Could not copy the code. Copy it manually instead.");
    }
  }, [accepted?.referralCode]);

  if (loading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-lg px-4 py-12">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/90 p-6 shadow-2xl backdrop-blur-md">
        {accepted ? (
          <div className="space-y-4 py-4 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h2 className="text-2xl font-bold text-zinc-50">Welcome to the program!</h2>
            <p className="text-sm text-zinc-300">
              You are now an ambassador for{" "}
              <strong className="text-zinc-100">&ldquo;{invite?.campaignTitle}&rdquo;</strong>.
            </p>
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
              <p className="text-xs uppercase tracking-wider text-zinc-500">Your referral code</p>
              <p className="mt-1 font-mono text-xl font-bold text-purple-300">
                {accepted.referralCode}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3 border-zinc-700 text-zinc-300"
                onClick={() => void copyCode()}
              >
                <Copy className="h-3.5 w-3.5" /> {copied ? "Copied" : "Copy code"}
              </Button>
            </div>
            <Button
              type="button"
              onClick={() => router.push(`/campaigns/${accepted.campaignId || "camp-101"}`)}
              className="w-full bg-purple-600 font-semibold text-white hover:bg-purple-700"
            >
              Go to the campaign
            </Button>
          </div>
        ) : notFound ? (
          <div className="space-y-4 py-4 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-500/20 text-rose-400">
              <AlertCircle className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-bold text-zinc-50">Invitation unavailable</h2>
            <p className="text-xs text-rose-300">{notFound}</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/campaigns")}
              className="mt-4 border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to campaigns
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="border-b border-zinc-800 pb-4 text-center">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-purple-600/20 text-purple-400">
                <Megaphone className="h-6 w-6" />
              </div>
              <h2 className="text-xl font-bold text-zinc-50">Ambassador invitation</h2>
              <p className="mt-1 text-xs text-zinc-400">
                <strong>{invite?.invitedByName}</strong> invited you to promote:
              </p>
              <h3 className="mt-2 text-base font-semibold text-purple-300">
                &ldquo;{invite?.campaignTitle}&rdquo;
              </h3>
              {invite && (
                <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-purple-500/30 bg-purple-950/40 px-3 py-1 text-xs font-semibold text-purple-200">
                  <Sparkles className="h-3.5 w-3.5 text-purple-400" />
                  {AMBASSADOR_TIERS[invite.tier].label} tier ·{" "}
                  {AMBASSADOR_TIERS[invite.tier].commissionRateBps / 100}% commission
                </div>
              )}
            </div>

            {formError && (
              <p role="alert" className="text-center text-xs text-rose-400">
                {formError}
              </p>
            )}

            <div className="space-y-4">
              <div>
                <Label htmlFor="ambassador-name" className="text-xs text-zinc-300">
                  Your name or alias
                </Label>
                <Input
                  id="ambassador-name"
                  placeholder="e.g. Dr. Maya Lin"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="mt-1 border-zinc-700 bg-zinc-950 text-xs text-zinc-100"
                />
              </div>

              <div>
                <Label htmlFor="ambassador-address" className="text-xs text-zinc-300">
                  Your Stellar address (optional)
                </Label>
                <Input
                  id="ambassador-address"
                  placeholder="GB88...K992"
                  value={stellarAddress}
                  onChange={(event) => setStellarAddress(event.target.value)}
                  className="mt-1 border-zinc-700 bg-zinc-950 font-mono text-xs text-zinc-100"
                />
              </div>

              {invite && (
                <p className="text-[11px] text-zinc-500">
                  Invitation sent to <Badge variant="outline">{invite.email}</Badge>
                </p>
              )}

              <Button
                type="button"
                onClick={() => void accept()}
                disabled={!name.trim() || submitting}
                className="w-full bg-purple-600 font-semibold text-white hover:bg-purple-700"
              >
                {submitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  "Accept invitation & join the program"
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
