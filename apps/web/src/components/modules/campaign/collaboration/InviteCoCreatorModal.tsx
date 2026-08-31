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
  onGenerateInvite: (role: CoCreatorRole, expiresInDays: number) => CoCreatorInvite;
  onCopyLink: (token: string) => void;
  copiedToken: string | null;
  getShareableUrl: (token: string) => string;
}

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
  const [generatedInvite, setGeneratedInvite] = useState<CoCreatorInvite | null>(null);

  const handleCreate = () => {
    const invite = onGenerateInvite(selectedRole, expirationDays);
    setGeneratedInvite(invite);
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
            Generate a shareable link allowing other users to co-manage <strong>"{campaignTitle}"</strong> with edit permissions.
          </DialogDescription>
        </DialogHeader>

        {!generatedInvite ? (
          <div className="space-y-5 py-2">
            <div>
              <Label className="text-xs font-semibold text-zinc-300">Assign Role & Permissions</Label>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {[
                  {
                    role: "CO_CREATOR" as CoCreatorRole,
                    title: "Co-Creator",
                    desc: "Full edit permissions (details, goals, timeline & team)",
                  },
                  {
                    role: "EDITOR" as CoCreatorRole,
                    title: "Editor",
                    desc: "Edit story & timeline only",
                  },
                  {
                    role: "VIEWER" as CoCreatorRole,
                    title: "Viewer",
                    desc: "Read-only access to campaign analytics",
                  },
                ].map((r) => (
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
              className="w-full bg-purple-600 font-semibold text-white hover:bg-purple-700"
            >
              Generate Shareable Invite Link
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
