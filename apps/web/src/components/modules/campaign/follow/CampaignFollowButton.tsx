"use client";

import React, { useState } from "react";
import { Bell, BellOff, Check, Settings2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  CampaignFollow,
  FollowChannel,
  FollowEvent,
  FollowFrequency,
  FOLLOW_CHANNELS,
  FOLLOW_EVENTS,
  FOLLOW_FREQUENCIES,
  validateFollowDestination,
} from "@/types/campaign-follow";
import { useCampaignFollow } from "@/hooks/use-campaign-follow";

export interface CampaignFollowButtonProps {
  campaignId: string;
  currentUserAddress?: string;
}

/**
 * Campaign Follow (v1) — Issue #942.
 * Lets any visitor follow a campaign to receive progress updates without
 * sponsoring it, with per-channel notification preferences.
 */
export function CampaignFollowButton({
  campaignId,
  currentUserAddress = "GD6W...X892",
}: CampaignFollowButtonProps) {
  const {
    followerCount,
    isFollowing,
    getFollow,
    follow,
    updatePrefs,
    unfollow,
  } = useCampaignFollow({ campaignId, currentUserAddress });
  const [editing, setEditing] = useState(false);

  const existing: CampaignFollow | null = isFollowing() ? getFollow() : null;
  const prefs = existing?.prefs;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {existing ? (
          <Button
            variant="outline"
            onClick={() => {
              unfollow();
              setEditing(false);
            }}
            className="w-full border-zinc-700 text-zinc-200 font-semibold hover:bg-zinc-800"
          >
            <BellOff className="mr-2 h-4 w-4" /> Following
          </Button>
        ) : (
          <Button
            onClick={() => follow()}
            className="w-full bg-zinc-800 font-bold text-zinc-50 hover:bg-zinc-700 shadow-md border border-zinc-700"
          >
            <Bell className="mr-2 h-4 w-4" /> Follow for Updates
          </Button>
        )}
        {existing && (
          <Button
            variant="outline"
            size="icon"
            aria-label="Notification preferences"
            title="Notification preferences"
            onClick={() => setEditing((v) => !v)}
            className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 shrink-0"
          >
            <Settings2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      <p className="flex items-center gap-1.5 text-[11px] text-zinc-500">
        <Users className="h-3 w-3" />
        {followerCount === 0
          ? "Be the first to follow — no sponsorship required."
          : `${followerCount} ${followerCount === 1 ? "follower" : "followers"} — get updates without sponsoring.`}
      </p>

      {editing && existing && (
        <FollowPrefsEditor
          campaignId={campaignId}
          current={prefs}
          onSave={(next) => {
            updatePrefs(next);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      )}
    </div>
  );
}

interface FollowPrefsEditorProps {
  campaignId: string;
  current: Partial<CampaignFollow["prefs"]> | undefined;
  onSave: (prefs: Partial<CampaignFollow["prefs"]>) => void;
  onCancel: () => void;
}

function FollowPrefsEditor({ current, onSave, onCancel }: FollowPrefsEditorProps) {
  const [channel, setChannel] = useState<FollowChannel>(current?.channel ?? "IN_APP");
  const [frequency, setFrequency] = useState<FollowFrequency>(
    current?.frequency ?? "INSTANT"
  );
  const [destination, setDestination] = useState(current?.destination ?? "");
  const [events, setEvents] = useState<FollowEvent[]>(
    current?.events?.length ? current.events : (Object.keys(FOLLOW_EVENTS) as FollowEvent[])
  );
  const [error, setError] = useState<string | null>(null);

  const toggleEvent = (event: FollowEvent) => {
    setEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  };

  const save = () => {
    setError(null);
    if (channel !== "IN_APP") {
      const trimmed = destination.trim();
      if (!validateFollowDestination(channel, trimmed)) {
        setError(`Enter a valid ${FOLLOW_CHANNELS[channel].label} destination (e.g. ${FOLLOW_CHANNELS[channel].hint})`);
        return;
      }
    }
    if (!events.length) {
      setError("Pick at least one update type.");
      return;
    }
    onSave({
      channel,
      frequency,
      destination: channel === "IN_APP" ? undefined : destination.trim(),
      events,
    });
  };

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-950/80 p-4 space-y-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-purple-400 mb-1.5">
          Notify me via
        </p>
        <div className="flex gap-2 flex-wrap">
          {(Object.keys(FOLLOW_CHANNELS) as FollowChannel[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setChannel(c)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors ${
                channel === c
                  ? "border-purple-500 bg-purple-950/60 text-purple-200"
                  : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500"
              }`}
            >
              {FOLLOW_CHANNELS[c].label}
            </button>
          ))}
        </div>
      </div>

      {channel !== "IN_APP" && (
        <Input
          placeholder={FOLLOW_CHANNELS[channel].hint}
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          className="text-xs font-mono"
          aria-label={`${FOLLOW_CHANNELS[channel].label} destination`}
        />
      )}

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-purple-400 mb-1.5">
          Frequency
        </p>
        <div className="flex gap-2 flex-wrap">
          {(Object.keys(FOLLOW_FREQUENCIES) as FollowFrequency[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFrequency(f)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors ${
                frequency === f
                  ? "border-emerald-500 bg-emerald-950/40 text-emerald-200"
                  : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500"
              }`}
            >
              {FOLLOW_FREQUENCIES[f]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-purple-400 mb-1.5">
          Update types
        </p>
        <div className="space-y-1.5">
          {(Object.keys(FOLLOW_EVENTS) as FollowEvent[]).map((event) => (
            <label
              key={event}
              className="flex cursor-pointer items-center gap-2 text-xs text-zinc-300"
            >
              <input
                type="checkbox"
                checked={events.includes(event)}
                onChange={() => toggleEvent(event)}
                className="h-3.5 w-3.5 accent-purple-600"
              />
              {FOLLOW_EVENTS[event]}
            </label>
          ))}
        </div>
      </div>

      {error != null && <p className="text-xs text-rose-400">{error}</p>}

      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="ghost" onClick={onCancel} className="text-xs text-zinc-400">
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={save}
          className="bg-purple-600 hover:bg-purple-700 text-white text-xs"
        >
          <Check className="mr-1 h-3.5 w-3.5" /> Save preferences
        </Button>
      </div>
    </div>
  );
}

/** Compact audience badge used beside the sponsor count in list contexts. */
export function CampaignFollowersBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <Badge variant="outline" className="text-[10px] text-zinc-300 border-zinc-700">
      <Users className="mr-1 h-3 w-3" /> {count} {count === 1 ? "follower" : "followers"}
    </Badge>
  );
}
