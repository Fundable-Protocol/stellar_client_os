"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Shield, Sparkles, CheckCircle2, AlertCircle, ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CoCreatorInvite } from "@/types/collaboration";
import { collaborationService } from "@/services/campaign-collaboration.service";

export default function AcceptInvitePage() {
  const params = useParams();
  const router = useRouter();
  const token = (params?.token as string) || "";

  const [invite, setInvite] = useState<CoCreatorInvite | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [stellarAddress, setStellarAddress] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [acceptedSuccess, setAcceptedSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (token) {
      const found = collaborationService.getInviteByToken(token);
      if (found) {
        setInvite(found);
      } else {
        setErrorMsg("This campaign invite link is invalid or has expired.");
      }
    }
    setLoading(false);
  }, [token]);

  const handleAccept = () => {
    if (!token || !name.trim() || !stellarAddress.trim()) return;

    setIsSubmitting(true);
    setErrorMsg(null);

    const result = collaborationService.acceptInvite(token, {
      name,
      stellarAddress,
    });

    if (result.success) {
      setAcceptedSuccess(true);
    } else {
      setErrorMsg(result.error || "Failed to accept invite.");
    }
    setIsSubmitting(false);
  };

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
        {acceptedSuccess ? (
          <div className="text-center space-y-4 py-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h2 className="text-2xl font-bold text-zinc-50">Invitation Accepted!</h2>
            <p className="text-sm text-zinc-300">
              You are now a official <strong className="text-purple-400">{invite?.role}</strong> for campaign{" "}
              <strong className="text-zinc-100">"{invite?.campaignTitle}"</strong>.
            </p>
            <div className="pt-4">
              <Button
                onClick={() => router.push(`/campaigns/${invite?.campaignId || "camp-101"}`)}
                className="w-full bg-purple-600 text-white hover:bg-purple-700 font-semibold"
              >
                Go to Campaign Dashboard
              </Button>
            </div>
          </div>
        ) : errorMsg && !invite ? (
          <div className="text-center space-y-4 py-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-500/20 text-rose-400">
              <AlertCircle className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-bold text-zinc-50">Invite Unavailable</h2>
            <p className="text-xs text-rose-300">{errorMsg}</p>
            <Button
              variant="outline"
              onClick={() => router.push("/campaigns")}
              className="mt-4 border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Campaigns
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="border-b border-zinc-800 pb-4 text-center">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-purple-600/20 text-purple-400">
                <Sparkles className="h-6 w-6" />
              </div>
              <h2 className="text-xl font-bold text-zinc-50">Co-Creator Invitation</h2>
              <p className="mt-1 text-xs text-zinc-400">
                You have been invited by <strong>{invite?.invitedByName}</strong> to co-manage:
              </p>
              <h3 className="mt-2 text-base font-semibold text-purple-300">"{invite?.campaignTitle}"</h3>
              <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-purple-500/30 bg-purple-950/40 px-3 py-1 text-xs font-semibold text-purple-200">
                <Shield className="h-3.5 w-3.5 text-purple-400" />
                Offered Role: {invite?.role}
              </div>
            </div>

            {errorMsg && <p className="text-xs text-rose-400 text-center">{errorMsg}</p>}

            <div className="space-y-4">
              <div>
                <Label htmlFor="name" className="text-xs text-zinc-300">Your Full Name / Alias</Label>
                <Input
                  id="name"
                  placeholder="e.g. Dr. Maya Lin"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 border-zinc-700 bg-zinc-950 text-xs text-zinc-100"
                />
              </div>

              <div>
                <Label htmlFor="stellarAddress" className="text-xs text-zinc-300">Your Stellar Address</Label>
                <Input
                  id="stellarAddress"
                  placeholder="GB88...K992"
                  value={stellarAddress}
                  onChange={(e) => setStellarAddress(e.target.value)}
                  className="mt-1 border-zinc-700 bg-zinc-950 text-xs text-zinc-100 font-mono"
                />
              </div>

              <Button
                onClick={handleAccept}
                disabled={!name.trim() || !stellarAddress.trim() || isSubmitting}
                className="w-full bg-purple-600 text-white font-semibold hover:bg-purple-700"
              >
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Accept Invitation & Join Team"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
