"use client";

/**
 * LinkedInBadge — displays a creator's LinkedIn profile as a professional
 * credibility badge on their campaign page.
 *
 * Two usage modes:
 *  1. `<LinkedInBadge data={...} />` — render from pre-fetched data.
 *  2. `<CreatorLinkedInBadge address={...} />` — auto-fetch from the API.
 *
 * The badge shows:
 *  • Avatar (falls back to initials)
 *  • Full name with a "LinkedIn Verified" label
 *  • Professional headline
 *  • Top endorsed skills (up to 5)
 *
 * Accessibility: all interactive elements have aria-labels; the skill list uses
 * a proper `<ul>` so screen readers can enumerate the items.
 */

import React, { useEffect, useState } from "react";
import { ExternalLink, Linkedin } from "lucide-react";
import type { LinkedInConnection } from "@/services/linkedin.service";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PublicLinkedInData = Omit<LinkedInConnection, "accessToken">;

export interface LinkedInBadgeProps {
  /** Pre-loaded public LinkedIn data */
  data: PublicLinkedInData;
  /** Maximum number of skills to display */
  maxSkills?: number;
  /** Extra CSS classes applied to the root element */
  className?: string;
}

// ---------------------------------------------------------------------------
// Pure presentational component
// ---------------------------------------------------------------------------

export function LinkedInBadge({ data, maxSkills = 5, className = "" }: LinkedInBadgeProps) {
  const { profile, skills } = data;
  const topSkills = skills.slice(0, maxSkills);
  const initials = profile.name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div
      className={`rounded-xl border border-[#0077b5]/30 bg-white shadow-sm overflow-hidden ${className}`}
      data-testid="linkedin-badge"
      aria-label="LinkedIn professional profile badge"
    >
      {/* Header bar */}
      <div className="flex items-center gap-2 bg-[#0077b5] px-4 py-2">
        <Linkedin className="h-4 w-4 text-white" aria-hidden="true" />
        <span className="text-xs font-semibold text-white tracking-wide uppercase">
          LinkedIn Verified
        </span>
      </div>

      {/* Profile body */}
      <div className="p-4 flex items-start gap-3">
        {/* Avatar */}
        <a
          href={profile.profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`View ${profile.name}'s LinkedIn profile`}
          className="flex-shrink-0"
        >
          {profile.pictureUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={profile.pictureUrl}
              alt={`${profile.name} LinkedIn avatar`}
              className="h-12 w-12 rounded-full object-cover ring-2 ring-[#0077b5]/30"
              loading="lazy"
            />
          ) : (
            <div
              className="h-12 w-12 rounded-full bg-[#0077b5] flex items-center justify-center text-white text-sm font-bold ring-2 ring-[#0077b5]/30"
              aria-hidden="true"
            >
              {initials || "LI"}
            </div>
          )}
        </a>

        {/* Name + headline */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <a
              href={profile.profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-gray-900 hover:text-[#0077b5] transition-colors truncate"
              aria-label={`Open ${profile.name}'s LinkedIn profile in a new tab`}
            >
              {profile.name}
            </a>
            <ExternalLink
              className="h-3 w-3 text-gray-400 flex-shrink-0"
              aria-hidden="true"
            />
          </div>

          {profile.headline && (
            <p className="mt-0.5 text-xs text-gray-500 leading-snug line-clamp-2">
              {profile.headline}
            </p>
          )}
        </div>
      </div>

      {/* Skills section */}
      {topSkills.length > 0 && (
        <div className="px-4 pb-4">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Top Skills
          </p>
          <ul
            className="flex flex-wrap gap-1.5"
            aria-label={`${profile.name}'s top LinkedIn skills`}
          >
            {topSkills.map((skill) => (
              <li
                key={skill.name}
                className="inline-flex items-center gap-1 rounded-full bg-[#0077b5]/10 px-2.5 py-0.5 text-[11px] font-medium text-[#0077b5]"
              >
                {skill.name}
                {skill.endorsementCount > 0 && (
                  <span
                    className="text-[10px] font-bold text-[#0077b5]/70"
                    aria-label={`${skill.endorsementCount} endorsements`}
                  >
                    {skill.endorsementCount}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Data-fetching wrapper
// ---------------------------------------------------------------------------

interface CreatorLinkedInBadgeProps {
  /** Creator's Stellar address */
  address: string;
  maxSkills?: number;
  className?: string;
}

/**
 * Fetches LinkedIn data for a creator address and renders the badge.
 * Renders nothing while loading and gracefully disappears if the creator has
 * no LinkedIn connection.
 */
export function CreatorLinkedInBadge({
  address,
  maxSkills,
  className,
}: CreatorLinkedInBadgeProps) {
  const [data, setData] = useState<PublicLinkedInData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!address) return;

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(
          `/api/creators/${encodeURIComponent(address)}/linkedin`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const json = (await res.json()) as {
          connected: boolean;
          data: PublicLinkedInData | null;
        };
        if (!cancelled && json.connected && json.data) {
          setData(json.data);
        }
      } catch {
        // Badge is optional — silently degrade
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [address]);

  if (loading) {
    return (
      <div
        className="rounded-xl border border-gray-200 bg-gray-50 h-28 animate-pulse"
        aria-busy="true"
        aria-label="Loading LinkedIn profile"
        data-testid="linkedin-badge-skeleton"
      />
    );
  }

  if (!data) return null;

  return <LinkedInBadge data={data} maxSkills={maxSkills} className={className} />;
}
