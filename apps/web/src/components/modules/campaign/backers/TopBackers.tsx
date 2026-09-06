"use client";

import React, { useState } from "react";
import {
  AlertCircle,
  EyeOff,
  Lock,
  Medal,
  Sparkles,
  Star,
  Trophy,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ANONYMOUS_BACKER_LABEL,
  BackerVisibility,
  HIDDEN_AMOUNT_LABEL,
  MAX_FEATURED_BACKERS,
  TOP_BACKERS_LIMIT,
  TopBackerEntry,
  backerInitials,
  formatBackerAmount,
} from "@/types/campaign-backers";
import { useTopBackers } from "@/hooks/use-top-backers";

export interface TopBackersProps {
  campaignId: string;
  campaignTitle?: string;
  /** Address of the person looking at the page. */
  viewerAddress?: string;
  /** Campaign creator address — only they can feature backers. */
  creatorAddress?: string;
  /** Defaults to {@link TOP_BACKERS_LIMIT} (top 10). */
  limit?: number;
  /** Override creator detection (e.g. while the wallet is still connecting). */
  canManage?: boolean;
}

const RANK_STYLES: Record<number, string> = {
  1: "border-amber-500/60 bg-amber-500/15 text-amber-300",
  2: "border-zinc-400/50 bg-zinc-400/10 text-zinc-200",
  3: "border-orange-700/60 bg-orange-800/20 text-orange-300",
};

const VISIBILITY_OPTIONS: { value: BackerVisibility; label: string; hint: string }[] = [
  { value: "PUBLIC", label: "Public", hint: "Name, address and amount are shown" },
  { value: "ANONYMOUS", label: "Anonymous", hint: "Keep your rank, hide your identity" },
  { value: "PRIVATE", label: "Private", hint: "Leave the leaderboard entirely" },
];

/**
 * Top backers leaderboard for the campaign detail page.
 *
 * Shows the top `limit` (default 10) backers ranked by total contribution,
 * lets the campaign creator feature up to {@link MAX_FEATURED_BACKERS} of them,
 * and renders every row through the backer's own privacy preference.
 */
export function TopBackers({
  campaignId,
  campaignTitle,
  viewerAddress,
  creatorAddress,
  limit = TOP_BACKERS_LIMIT,
  canManage,
}: TopBackersProps) {
  const {
    backers,
    totalBackers,
    privateBackers,
    totalAmount,
    featuredCount,
    isCreator,
    myEntry,
    myPrivacy,
    error,
    toggleFeatured,
    setPrivacy,
  } = useTopBackers({ campaignId, viewerAddress, creatorAddress, limit });

  const [privacyDraft, setPrivacyDraft] = useState<BackerVisibility | null>(null);

  const canFeature = canManage ?? isCreator;
  const featureSlotsLeft = MAX_FEATURED_BACKERS - featuredCount;

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-400" />
            Top {limit} Backers
          </h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            {campaignTitle ? `${campaignTitle} · ` : ""}Ranked by total contribution.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-zinc-700 text-zinc-300 text-[11px]">
            <Users className="mr-1 h-3 w-3" /> {totalBackers} backers
          </Badge>
          <Badge variant="outline" className="border-zinc-700 text-zinc-300 text-[11px]">
            {formatBackerAmount(totalAmount)} raised
          </Badge>
          {canFeature && (
            <Badge variant="outline" className="border-purple-600/50 text-purple-300 text-[11px]">
              <Sparkles className="mr-1 h-3 w-3" /> {featuredCount}/{MAX_FEATURED_BACKERS} featured
            </Badge>
          )}
        </div>
      </div>

      {error != null && (
        <p role="alert" className="flex items-center gap-1.5 rounded-md border border-rose-900/50 bg-rose-950/40 px-3 py-2 text-xs text-rose-300">
          <AlertCircle className="h-3.5 w-3.5" /> {error}
        </p>
      )}

      {backers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-950/40 px-4 py-8 text-center">
          <p className="text-sm text-zinc-300">No backers yet</p>
          <p className="mt-1 text-xs text-zinc-500">
            The top {limit} backers by amount will appear here as soon as the first contribution lands.
          </p>
        </div>
      ) : (
        <ol className="space-y-2" aria-label={`Top ${limit} backers by amount`}>
          {backers.map((entry) => (
            <BackerRow
              key={`${entry.rank}-${entry.backerAddress}`}
              entry={entry}
              canFeature={canFeature}
              featureDisabled={featureSlotsLeft <= 0 && !entry.isFeatured}
              onToggleFeatured={() => toggleFeatured(entry.backerAddress)}
            />
          ))}
        </ol>
      )}

      {myEntry && (
        <div className="rounded-lg border border-purple-900/40 bg-purple-950/20 p-4 space-y-2">
          <p className="text-xs font-semibold text-purple-200 flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5" /> Your privacy preference
          </p>
          <div className="flex flex-wrap gap-2">
            {VISIBILITY_OPTIONS.map((option) => {
              const active = (privacyDraft ?? myPrivacy?.visibility ?? "PUBLIC") === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  title={option.hint}
                  onClick={() => {
                    setPrivacyDraft(option.value);
                    if (viewerAddress) setPrivacy(viewerAddress, { visibility: option.value });
                  }}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold border ${
                    active
                      ? "border-purple-500 bg-purple-900/50 text-purple-100"
                      : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-zinc-500">
            Choosing Private removes you from the leaderboard; choosing Anonymous keeps your rank but
            hides your name and address. Backers who hide their identity can never be featured.
          </p>
        </div>
      )}

      <p className="text-[11px] text-zinc-500 leading-relaxed">
        {privateBackers > 0
          ? `${privateBackers} backer${privateBackers === 1 ? "" : "s"} keep${privateBackers === 1 ? "s" : ""} their support private and ${privateBackers === 1 ? "is" : "are"} not ranked here. `
          : ""}
        Backers control their own visibility — anonymous backers keep their rank with their identity
        hidden{canFeature ? `, and only the campaign creator can feature up to ${MAX_FEATURED_BACKERS} backers` : ""}.
      </p>
    </section>
  );
}

interface BackerRowProps {
  entry: TopBackerEntry;
  canFeature: boolean;
  featureDisabled: boolean;
  onToggleFeatured: () => void;
}

function BackerRow({ entry, canFeature, featureDisabled, onToggleFeatured }: BackerRowProps) {
  // Identity is hidden for public viewers of an anonymous row; creators and the
  // backer themselves still resolve it, so the badge is keyed off the
  // preference rather than the rendered name.
  const identityHidden = entry.displayName === ANONYMOUS_BACKER_LABEL;
  const isAnonymous = entry.visibility === "ANONYMOUS";
  const isPrivate = entry.visibility === "PRIVATE";

  return (
    <li
      data-testid={`backer-row-${entry.rank}`}
      className={`flex items-center gap-3 rounded-lg border p-3 ${
        entry.isFeatured
          ? "border-amber-600/50 bg-amber-950/20"
          : "border-zinc-800 bg-zinc-950/50"
      }`}
    >
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border text-xs font-bold ${
          RANK_STYLES[entry.rank] ?? "border-zinc-700 bg-zinc-900 text-zinc-400"
        }`}
        aria-hidden="true"
      >
        {entry.rank <= 3 ? <Medal className="h-4 w-4" /> : entry.rank}
      </div>

      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-xs font-semibold text-zinc-300"
        aria-hidden="true"
      >
        {identityHidden ? (
          <EyeOff className="h-4 w-4 text-zinc-500" />
        ) : (
          backerInitials(entry.displayName, entry.backerAddress)
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-zinc-100">
            {entry.isFeatured && <Star className="mr-1 inline h-3.5 w-3.5 fill-amber-400 text-amber-400" />}
            {entry.displayName}
          </span>
          {entry.isFeatured && (
            <Badge className="bg-amber-600/90 text-white text-[10px] px-1.5 py-0">Featured</Badge>
          )}
          {isAnonymous && (
            <Badge variant="outline" className="border-zinc-600 text-zinc-400 text-[10px] px-1.5 py-0">
              <EyeOff className="mr-1 h-2.5 w-2.5" /> Anonymous
            </Badge>
          )}
          {isPrivate && (
            <Badge variant="outline" className="border-zinc-600 text-zinc-400 text-[10px] px-1.5 py-0">
              <Lock className="mr-1 h-2.5 w-2.5" /> Private
            </Badge>
          )}
          {entry.isSelf && (
            <Badge className="bg-purple-600 text-white text-[10px] px-1.5 py-0">You</Badge>
          )}
        </div>
        <p className="truncate text-[11px] text-zinc-500">
          {entry.backerAddress} · {entry.contributionCount} contribution{entry.contributionCount === 1 ? "" : "s"}
        </p>
        {entry.featureNote && (
          <p className="mt-1 text-[11px] italic text-amber-200/80">&ldquo;{entry.featureNote}&rdquo;</p>
        )}
        {!entry.featureNote && entry.message && (
          <p className="mt-1 truncate text-[11px] italic text-zinc-400">&ldquo;{entry.message}&rdquo;</p>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-sm font-bold text-zinc-100">
          {entry.totalAmount === null ? (
            <span className="text-xs font-medium text-zinc-500">{HIDDEN_AMOUNT_LABEL}</span>
          ) : (
            <>
              {formatBackerAmount(entry.totalAmount)}
              <span className="ml-1 text-[11px] font-medium text-zinc-400">{entry.token}</span>
            </>
          )}
        </span>
        {canFeature && (
          <Button
            type="button"
            size="xs"
            variant="outline"
            aria-pressed={entry.isFeatured}
            disabled={featureDisabled}
            onClick={onToggleFeatured}
            className="border-zinc-700 text-[10px] text-zinc-300 hover:bg-zinc-800"
          >
            <Star className={entry.isFeatured ? "fill-amber-400 text-amber-400" : ""} />
            {entry.isFeatured ? "Un-feature" : "Feature"}
          </Button>
        )}
      </div>
    </li>
  );
}

export default TopBackers;
