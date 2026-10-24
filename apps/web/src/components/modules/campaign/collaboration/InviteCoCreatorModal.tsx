"use client";

import React, { useState } from "react";
import { UserPlus, Copy, Check, Link as LinkIcon, Shield, Clock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CoCreatorRole, CoCreatorInvite } from "@/types/collaboration";

export interface InviteCoCreatorModalProps {
  campaignTitle: string;
  onGenerateInvite: (role: CoCreatorRole, expiresInDays: number, inviteeEmail?: string) => Promise<CoCreatorInvite>;
  onCopyLink: (token: string) => void;
  copiedToken: string | null;
  getShareableUrl: (token: string) => string;
}

const ROLE_OPTIONS: Array<{ role: CoCreatorRole; title: string; desc: string }> = [
  { role: "CO_CREATOR", title: "Co-Creator", desc: "Full edit permissions (details, goals, timeline & team)" },
  { role: "EDITOR", title: "Editor", desc: "Edit story & timeline only" },
  { role: "ANALYST", title: "Analyst", desc: "Read-only analytics & milestone proof review" },
  { role: "SUPPORT", title: "Support", desc: "Handle supporter questions & moderation" },
  { role: "VIEWER", title: "Viewer", desc: "Read-only access to campaign analytics" },
];

export function InviteCoCreatorModal({
  campaignTitle,
  onGenerateInvite,
  onCopyLink,
  copiedToken,
  getShareableUrl,
}: InviteCoCreatorModalProps) {
  const [open, setOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<CoCreatorRole>("CO_CREATOR");
  const [expirationDays, setExpirationDays] = useState(7);
  const [inviteeEmail, setInviteeEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [generatedInvite, setGeneratedInvite] = useState<CoCreatorInvite | null>(null);

  const handleCreate = async () => {
    const email = inviteeEmail.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError("Enter a valid email address or leave it blank to share a link.");
      return;
    }
    setEmailError(null);
    setSubmitting(true);
    try {
      const invite = await onGenerateInvite(selectedRole, expirationDays, email || undefined);
      setGeneratedInvite(invite);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-purple-600 font-medium text-white hover:bg-purple-700 shadow-md shadow-purple-900/20">
          <UserPlus className="mr-2 h-4 w-4" />
          Invite Co-Creator
        </Button>
      </DialogTrigger>

      <DialogContent className="border-zinc-800 bg-zinc-900 text-zinc-100 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold text-zinc-50">
            <UserPlus className="h-5 w-5 text-purple-400" />
            Invite Co-Creators & Editors
          </DialogTitle>
          <DialogDescription className="text-zinc-400 text-xs">
            Generate a shareable link allowing other users to co-manage <strong>&ldquo;{campaignTitle}&rdquo;</strong> with edit permissions.
          </DialogDescription>
        </DialogHeader>

        {!generatedInvite ? (
          <div className="space-y-5 py-2">
            <div>
              <Label className="text-xs font-semibold text-zinc-300">Assign Role & Permissions</Label>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
                {ROLE_OPTIONS.map((r) => (
                  <button
                    key={r.role}
                    type="button"
                    onClick={() => setSelectedRole(r.role)}
                    className={`flex flex-col text-left p-3 rounded-lg border text-xs transition-all ${
                      selectedRole === r.role
                        ? "border-purple-500 bg-purple-950/30 text-purple-200"
                        : "border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    <span className="font-semibold text-zinc-100 mb-1 flex items-center justify-between">
                      {r.title}
                      {selectedRole === r.role && <Shield className="h-3.5 w-3.5 text-purple-400" />}
                    </span>
                    <span className="text-[10px] text-zinc-400 leading-snug">{r.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold text-zinc-300" htmlFor="invitee-email">
                Invite by email <span className="text-zinc-500 font-normal">(optional)</span>
              </Label>
              <input
                id="invitee-email"
                type="email"
                value={inviteeEmail}
                onChange={(e) => setInviteeEmail(e.target.value)}
                placeholder="teammate@example.org"
                className="mt-1.5 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 focus:border-purple-500 focus:outline-none"
              />
              {emailError ? (
                <p className="mt-1 text-[11px] text-rose-400">{emailError}</p>
              ) : (
                <p className="mt-1 text-[10px] text-zinc-500">
                  Add an email and Fundable will send the invitation link directly. Leave blank to copy a shareable link.
                </p>
              )}
            </div>

            <div>
              <Label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-zinc-400" />
                Link Expiration Time
              </Label>
              <select
                value={expirationDays}
                onChange={(e) => setExpirationDays(Number(e.target.value))}
                className="mt-1.5 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 focus:border-purple-500 focus:outline-none"
              >
                <option value={1}>Expires in 24 Hours</option>
                <option value={7}>Expires in 7 Days</option>
                <option value={30}>Expires in 30 Days</option>
                <option value={365}>Never Expires (1 Year)</option>
              </select>
            </div>

            <Button
              onClick={handleCreate}
              disabled={submitting}
              className="w-full bg-purple-600 font-semibold text-white hover:bg-purple-700 disabled:opacity-60"
            >
              {submitting ? "Generating…" : "Generate Shareable Invite Link"}
            </Button>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-purple-800/40 bg-purple-950/20 p-4 space-y-3">
              <span className="text-[11px] font-semibold text-purple-300 uppercase tracking-wider block">
                Shareable Invite Link Generated!
              </span>

              <div className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950 p-2 text-xs font-mono text-zinc-300 overflow-x-auto">
                <LinkIcon className="h-4 w-4 text-purple-400 shrink-0" />
                <span className="truncate">{getShareableUrl(generatedInvite.token)}</span>
              </div>

              <Button
                onClick={() => onCopyLink(generatedInvite.token)}
                className="w-full bg-purple-600 text-white hover:bg-purple-700 text-xs font-semibold"
              >
                {copiedToken === generatedInvite.token ? (
                  <>
                    <Check className="mr-1.5 h-4 w-4 text-emerald-300" /> Copied to Clipboard!
                  </>
                ) : (
                  <>
                    <Copy className="mr-1.5 h-4 w-4" /> Copy Invite Link
                  </>
                )}
              </Button>
            </div>

            <Button
              variant="outline"
              onClick={() => setGeneratedInvite(null)}
              className="w-full border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-xs"
            >
              Create Another Invite Link
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
