"use client";

import React, { useState } from "react";
import {
  MessageCircle,
  Users,
  ExternalLink,
  Trash2,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  CommunityPlatform,
  CommunitySpace,
  COMMUNITY_PLATFORMS,
} from "@/types/campaign-community";
import { useCampaignCommunity } from "@/hooks/use-campaign-community";

export interface BackerCommunityProps {
  campaignId: string;
  currentUserAddress?: string;
  canManage?: bool;
}

const PLATFORM_ICON: Record<CommunityPlatform, React.ReactNode> = {
  DISCORD: <MessageCircle className="h-4 w-4 text-indigo-400" />,
  TELEGRAM: <MessageCircle className="h-4 w-4 text-sky-400" />,
};

export function BackerCommunity({
  campaignId,
  currentUserAddress = "GD6W...X892",
  canManage = true,
}: BackerCommunityProps) {
  const community = useCampaignCommunity({ campaignId, currentUserAddress });
  const [adding, setAdding] = useState(false);
  const [platform, setPlatform] = useState<CommunityPlatform>("DISCORD");
  const [name, setName] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const startAdd = () => {
    setAdding(true);
    setName("");
    setInviteUrl("");
    setError(null);
  };

  const submit = () => {
    setError(null);
    const result = community.createSpace({
      platform,
      name,
      inviteUrl,
      visibility: "BACKERS_ONLY",
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setAdding(false);
  };

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
            <Users className="h-5 w-5 text-purple-400" />
            Backer Community
          </h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            Discord servers and Telegram groups for backers of this campaign.
          </p>
        </div>
        {canManage && !adding && (
          <Button size="sm" variant="outline" onClick={startAdd}
            className="border-purple-600/40 text-purple-300 hover:bg-purple-950/40 text-xs">
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Link space
          </Button>
        )}
      </div>

      {adding && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-950/80 p-4 space-y-3">
          <div className="flex gap-2">
            {(Object.keys(COMMUNITY_PLATFORMS) as CommunityPlatform[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPlatform(p)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold border ${
                  platform === p
                    ? "border-purple-500 bg-purple-950/60 text-purple-200"
                    : "border-zinc-700 bg-zinc-900 text-zinc-400"
                }`}
              >
                {COMMUNITY_PLATFORMS[p].label}
              </button>
            ))}
          </div>
          <Input
            placeholder="Space name (e.g. Save the Amazon — Discord)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="text-xs"
          />
          <Input
            placeholder={COMMUNITY_PLATFORMS[platform].urlHint}
            value={inviteUrl}
            onChange={(e) => setInviteUrl(e.target.value)}
            className="text-xs font-mono"
          />
          {error != null && <p className="text-xs text-rose-400">{error}</p>}
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}
              className="text-xs text-zinc-400">
              Cancel
            </Button>
            <Button size="sm" onClick={submit}
              className="bg-purple-600 hover:bg-purple-700 text-white text-xs">
              Link space
            </Button>
          </div>
        </div>
      )}

      {community.spaces.isEmpty ? (
        <p className="text-xs text-zinc-500 py-2">
          No community spaces linked yet.
        </p>
      ) : (
        <div className="space-y-2.5">
          {community.spaces.map((space: CommunitySpace) => (
            <CommunitySpaceCard
              key={space.id}
              space={space}
              joined={community.hasJoined(space.id)}
              canManage={canManage}
              onJoin={() => community.joinSpace(space.id)}
              onLeave={() => community.leaveSpace(space.id)}
              onRemove={() => community.removeSpace(space.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

interface CommunitySpaceCardProps {
  space: CommunitySpace;
  joined: boolean;
  canManage: boolean;
  onJoin: () => void;
  onLeave: () => void;
  onRemove: () => void;
}

function CommunitySpaceCard({
  space,
  joined,
  canManage,
  onJoin,
  onLeave,
  onRemove,
}: CommunitySpaceCardProps) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/60 p-3.5">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800">
          {PLATFORM_ICON[space.platform]}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-zinc-100 text-sm truncate">
              {space.name}
            </span>
            <Badge variant="outline" className="text-[10px] text-zinc-400">
              {COMMUNITY_PLATFORMS[space.platform].label}
            </Badge>
            {space.visibility === "BACKERS_ONLY" && (
              <Badge variant="outline" className="text-[10px] text-amber-400">
                Backers only
              </Badge>
            )}
          </div>
          {space.description != null && (
            <p className="text-[11px] text-zinc-500 mt-0.5 truncate">
              {space.description}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {space.memberCount != null && (
          <span className="flex items-center gap-1 text-[11px] text-zinc-500">
            <Users className="h-3 w-3" /> {space.memberCount}
          </span>
        )}
        <Button
          size="sm"
          variant={joined ? "outline" : "default"}
          onClick={joined ? onLeave : onJoin}
          className={joined
            ? "border-zinc-700 text-zinc-300 text-xs"
            : "bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-xs font-semibold"}
        >
          {joined ? "Joined" : "Join"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => window.open(space.inviteUrl, "_blank")}
          className="text-zinc-500 hover:text-zinc-200"
          title="Open invite"
        >
          <ExternalLink className="h-4 w-4" />
        </Button>
        {canManage && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onRemove}
            className="text-zinc-500 hover:text-rose-400"
            title="Unlink space"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
