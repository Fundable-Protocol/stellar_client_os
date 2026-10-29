"use client";

import React, { useEffect, useState } from "react";
import { BadgeCheck, ShieldCheck } from "lucide-react";
import {
  CREATOR_VERIFICATION_STEP_DETAILS,
  CREATOR_VERIFICATION_STEPS,
  VERIFIED_CREATOR_BADGE_LABEL,
  describeVerification,
  summarizeCreatorVerification,
  type CampaignVerificationSummary,
  type CreatorVerificationFlags,
} from "@/lib/creator-verification";

export interface CreatorVerificationBadgeProps {
  /** Summary (or raw flags) from the campaign / search API. Missing data renders as unverified. */
  verification?: CreatorVerificationFlags | CampaignVerificationSummary | null;
  size?: "sm" | "md";
  /** Show a subdued "n of 3" chip for partially verified creators (default true). */
  showPartial?: boolean;
  /** Show a muted "Not verified" chip when the creator has no verifications (default false). */
  showUnverified?: boolean;
  className?: string;
}

function completedStepsText(summary: CampaignVerificationSummary): string {
  const labels = CREATOR_VERIFICATION_STEPS.filter((step) => summary.badges.includes(step)).map(
    (step) => CREATOR_VERIFICATION_STEP_DETAILS[step].badgeLabel.toLowerCase(),
  );
  if (labels.length === 0) return "No identity checks completed";
  const text = labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
  return `${text.charAt(0).toUpperCase()}${text.slice(1)} verified`;
}

/**
 * Backer-facing creator identity verification badge.
 *
 * - verified (email + phone + government ID): prominent "Verified Creator" pill
 * - partial: subdued "n of 3 checks" chip (optional)
 * - unverified: nothing by default — verification is optional for creators
 */
export function CreatorVerificationBadge({
  verification,
  size = "sm",
  showPartial = true,
  showUnverified = false,
  className = "",
}: CreatorVerificationBadgeProps) {
  const summary = summarizeCreatorVerification(verification ?? {});
  const textSize = size === "md" ? "text-xs px-2.5 py-1" : "text-[10px] px-2 py-0.5";
  const iconSize = size === "md" ? "h-3.5 w-3.5" : "h-3 w-3";
  const detail = completedStepsText(summary);

  if (summary.status === "verified") {
    return (
      <span
        role="status"
        data-testid="creator-verification-badge"
        data-verification-status="verified"
        aria-label={`${VERIFIED_CREATOR_BADGE_LABEL}: email, phone and government ID verified`}
        title="This creator verified their email, phone number and government ID"
        className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-emerald-500/50 bg-emerald-950/50 font-semibold text-emerald-300 ${textSize} ${className}`}
      >
        <BadgeCheck className={iconSize} aria-hidden="true" />
        {VERIFIED_CREATOR_BADGE_LABEL}
      </span>
    );
  }

  if (summary.status === "partial" && showPartial) {
    return (
      <span
        role="status"
        data-testid="creator-verification-badge"
        data-verification-status="partial"
        aria-label={`Creator partially verified: ${detail}`}
        title={detail}
        className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-zinc-600/60 bg-zinc-900/60 font-medium text-zinc-300 ${textSize} ${className}`}
      >
        <ShieldCheck className={iconSize} aria-hidden="true" />
        {describeVerification(summary)}
      </span>
    );
  }

  if (summary.status === "unverified" && showUnverified) {
    return (
      <span
        data-testid="creator-verification-badge"
        data-verification-status="unverified"
        title="This creator has not completed optional identity verification"
        className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-zinc-800 font-medium text-zinc-500 ${textSize} ${className}`}
      >
        Not verified
      </span>
    );
  }

  return null;
}

/** Loads a creator's verification status from the public API and renders the badge. */
export function CampaignCreatorVerificationBadge({
  creator,
  ...badgeProps
}: { creator: string } & Omit<CreatorVerificationBadgeProps, "verification">) {
  const [summary, setSummary] = useState<CampaignVerificationSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/creators/${encodeURIComponent(creator)}/verification`);
        if (!res?.ok) return;
        const data = await res.json();
        if (!cancelled) setSummary(data?.verification?.summary ?? null);
      } catch {
        // Verification is optional; failing to load it must not affect the page.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [creator]);

  return <CreatorVerificationBadge verification={summary} {...badgeProps} />;
}

export default CreatorVerificationBadge;
