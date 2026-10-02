"use client";

import React from "react";
import { Users, Shield, Trash2, Key, Link as LinkIcon, Check, Copy, Crown, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCampaignCollaboration } from "@/hooks/use-campaign-collaboration";
import { InviteCoCreatorModal } from "./InviteCoCreatorModal";
import { CoCreatorRole, formatTruncatedAddress } from "@/types/collaboration";

export interface CampaignCollaborationProps {
  campaignId: string;
  campaignTitle?: string;
  currentUserAddress?: string;
}

const ROLE_BADGES: Record<CoCreatorRole, { label: string; badgeClass: string; icon: React.ReactNode }> = {
  OWNER: {
    label: "Owner",
    badgeClass: "bg-amber-500/20 text-amber-300 border-amber-500/40",
    icon: <Crown className="mr-1 h-3 w-3 inline text-amber-400" />,
  },
  CO_CREATOR: {
    label: "Co-Creator",
    badgeClass: "bg-purple-500/20 text-purple-300 border-purple-500/40",
    icon: <Sparkles className="mr-1 h-3 w-3 inline text-purple-400" />,
  },
  EDITOR: {
    label: "Editor",
    badgeClass: "bg-blue-500/20 text-blue-300 border-blue-500/40",
    icon: <Shield className="mr-1 h-3 w-3 inline text-blue-400" />,
  },
  VIEWER: {
    label: "Viewer",
    badgeClass: "bg-zinc-700/40 text-zinc-300 border-zinc-700",
    icon: null,
  },
};

export function CampaignCollaboration({
  campaignId,
  campaignTitle = "Save the Amazon RainForest Reserve",
  currentUserAddress = "GD6W...X892",
}: CampaignCollaborationProps) {
  const collab = useCampaignCollaboration({ campaignId, campaignTitle, currentUserAddress });

  return (
    <section className="space-y-6 rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 backdrop-blur-md">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800 pb-5">
        <div>
          <h2 className="text-xl font-bold text-zinc-50 flex items-center gap-2">
            <Users className="h-5 w-5 text-purple-400" />
            Campaign Team & Co-Creators
          </h2>
          <p className="mt-1 text-xs text-zinc-400">
            Invite co-creators, manage editing permissions, and share access links for {campaignTitle}.
          </p>
        </div>

        {collab.userPermissions.canManageCollaborators && (
          <InviteCoCreatorModal
            campaignTitle={campaignTitle}
            onGenerateInvite={collab.createInvite}
            onCopyLink={collab.copyInviteLink}
            copiedToken={collab.copiedToken}
            getShareableUrl={collab.getShareableUrl}
          />
        )}
      </div>

      {/* Permission Summary Card */}
      <div className="rounded-lg border border-purple-900/40 bg-purple-950/20 p-4 text-xs">
        <div className="flex items-center justify-between font-semibold text-purple-200 mb-2">
          <span className="flex items-center gap-1.5">
            <Shield className="h-4 w-4 text-purple-400" />
            Your Permission Level: {collab.currentUserRole}
          </span>
          <Badge variant="outline" className="border-purple-500/50 text-purple-300">
            {collab.userPermissions.canEditDetails ? "Full Edit Access" : "Read Only"}
          </Badge>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-zinc-300 pt-2 border-t border-purple-900/30">
          <div>Edit Details: <span className={collab.userPermissions.canEditDetails ? "text-emerald-400 font-semibold" : "text-rose-400"}>{collab.userPermissions.canEditDetails ? "Yes" : "No"}</span></div>
          <div>Edit Goals: <span className={collab.userPermissions.canEditGoals ? "text-emerald-400 font-semibold" : "text-rose-400"}>{collab.userPermissions.canEditGoals ? "Yes" : "No"}</span></div>
          <div>Manage Team: <span className={collab.userPermissions.canManageCollaborators ? "text-emerald-400 font-semibold" : "text-rose-400"}>{collab.userPermissions.canManageCollaborators ? "Yes" : "No"}</span></div>
          <div>Withdraw Funds: <span className={collab.userPermissions.canWithdrawFunds ? "text-emerald-400 font-semibold" : "text-rose-400"}>{collab.userPermissions.canWithdrawFunds ? "Yes" : "No"}</span></div>
        </div>
      </div>

      {/* Collaborators List */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
          Active Team Members ({collab.collaborators.length})
        </h3>

        <div className="space-y-2.5">
          {collab.collaborators.map((c) => {
            const roleInfo = ROLE_BADGES[c.role];
            return (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/60 p-3.5 text-xs transition-colors hover:border-zinc-700"
              >
                <div className="flex items-center gap-3">
                  {c.avatarUrl ? (
                    <img
                      src={c.avatarUrl}
                      alt={c.name}
                      className="h-9 w-9 rounded-full object-cover border border-zinc-700"
                    />
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-purple-950 text-purple-300 font-semibold border border-purple-800">
                      {c.name.substring(0, 2).toUpperCase()}
                    </div>
                  )}

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-zinc-100 text-sm">{c.name}</span>
                      <Badge variant="outline" className={`text-[10px] uppercase font-semibold ${roleInfo.badgeClass}`}>
                        {roleInfo.icon}
                        {roleInfo.label}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-zinc-400 mt-0.5">
                      <span className="font-mono">{formatTruncatedAddress(c.stellarAddress)}</span>
                      {c.email && <span>{c.email}</span>}
                    </div>
                  </div>
                </div>

                {collab.userPermissions.canManageCollaborators && c.role !== "OWNER" && (
                  <div className="flex items-center gap-2">
                    <select
                      value={c.role}
                      onChange={(e) => collab.updateRole(c.id, e.target.value as CoCreatorRole)}
                      className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-200 focus:outline-none"
                    >
                      <option value="CO_CREATOR">Co-Creator</option>
                      <option value="EDITOR">Editor</option>
                      <option value="VIEWER">Viewer</option>
                    </select>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => collab.removeCollaborator(c.id)}
                      className="text-zinc-500 hover:text-rose-400"
                      title="Revoke access"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Active Invites List */}
      {collab.activeInvites.length > 0 && (
        <div className="space-y-3 pt-4 border-t border-zinc-800">
          <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
            <Key className="h-4 w-4 text-purple-400" />
            Active Shareable Invite Tokens
          </h3>

          <div className="space-y-2">
            {collab.activeInvites.map((inv) => (
              <div
                key={inv.token}
                className="flex items-center justify-between rounded-lg border border-purple-900/30 bg-purple-950/10 p-3 text-xs"
              >
                <div className="flex items-center gap-2 font-mono text-zinc-300">
                  <LinkIcon className="h-3.5 w-3.5 text-purple-400" />
                  <span className="truncate max-w-xs">{inv.token}</span>
                  <Badge variant="outline" className="border-purple-500/40 text-purple-300 text-[10px]">
                    Role: {inv.role}
                  </Badge>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => collab.copyInviteLink(inv.token)}
                  className="border-zinc-700 bg-zinc-900 text-[11px] text-zinc-200 hover:bg-zinc-800"
                >
                  {collab.copiedToken === inv.token ? (
                    <>
                      <Check className="mr-1 h-3.5 w-3.5 text-emerald-400" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="mr-1 h-3.5 w-3.5" /> Copy Link
                    </>
                  )}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export default CampaignCollaboration;
