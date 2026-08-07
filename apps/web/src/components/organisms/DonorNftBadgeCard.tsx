"use client";

/**
 * DonorNftBadgeCard — Interactive 3D tilt donor NFT badge card (issue #530)
 *
 * Renders a single donor achievement badge with a CSS 3D tilt effect on
 * hover. The card displays the badge tier, achievement name, description,
 * donor address, token ID, and a visual rarity indicator.
 *
 * Accessibility:
 *   - role="article" with aria-label containing badge name
 *   - Focus-visible ring identical to the rest of the design system
 *   - 3D effect is disabled when prefers-reduced-motion is set
 *   - All decorative elements are aria-hidden
 *   - Keyboard-focusable (tabIndex=0) with focus-visible tilt activation
 */

import React, { type KeyboardEvent } from "react";
import { Award, ExternalLink, Shield, Star, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { sliceAddress } from "@/lib/utils";
import { useTilt, type UseTiltOptions } from "@/hooks/use-tilt";

// ── Types ─────────────────────────────────────────────────────────────────────

export type BadgeTier = "bronze" | "silver" | "gold" | "platinum" | "legendary";

export type BadgeRarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

export interface DonorNftBadge {
  /** On-chain token ID */
  tokenId: string;
  /** Display name of the achievement */
  name: string;
  /** Short description of what the badge represents */
  description: string;
  /** Badge tier */
  tier: BadgeTier;
  /** Rarity classification */
  rarity: BadgeRarity;
  /** Donor's Stellar address */
  donorAddress: string;
  /** ISO 8601 date the badge was minted */
  mintedAt: string;
  /** Optional: URL to the badge image / SVG */
  imageUrl?: string;
  /** Optional: Link to explore the token on Stellar */
  explorerUrl?: string;
  /** Total contribution amount that earned this badge */
  contributionAmount?: string;
  /** Token symbol of the contribution */
  contributionToken?: string;
}

export interface DonorNftBadgeCardProps {
  badge: DonorNftBadge;
  /** Whether the card is interactive (tilt + click). Default: true */
  interactive?: boolean;
  /** Called when the card is clicked. */
  onClick?: (badge: DonorNftBadge) => void;
  /** Additional className for the outer wrapper. */
  className?: string;
  /** Tilt options forwarded to useTilt. */
  tiltOptions?: UseTiltOptions;
}

// ── Tier config ───────────────────────────────────────────────────────────────

const TIER_CONFIG: Record<
  BadgeTier,
  { gradient: string; border: string; glow: string; label: string; icon: React.ElementType }
> = {
  bronze: {
    gradient: "from-amber-900/60 via-amber-800/40 to-amber-700/20",
    border: "border-amber-700/50",
    glow: "shadow-amber-900/30",
    label: "Bronze",
    icon: Shield,
  },
  silver: {
    gradient: "from-slate-700/60 via-slate-600/40 to-slate-500/20",
    border: "border-slate-500/50",
    glow: "shadow-slate-700/30",
    label: "Silver",
    icon: Shield,
  },
  gold: {
    gradient: "from-yellow-800/60 via-yellow-700/40 to-yellow-500/20",
    border: "border-yellow-600/50",
    glow: "shadow-yellow-700/40",
    label: "Gold",
    icon: Star,
  },
  platinum: {
    gradient: "from-purple-900/60 via-purple-700/40 to-purple-500/20",
    border: "border-purple-500/50",
    glow: "shadow-purple-700/40",
    label: "Platinum",
    icon: Zap,
  },
  legendary: {
    gradient: "from-fundable-deep-purple/80 via-fundable-purple/50 to-fundable-purple-2/30",
    border: "border-fundable-purple-2/60",
    glow: "shadow-fundable-purple/50",
    label: "Legendary",
    icon: Award,
  },
};

const RARITY_CONFIG: Record<BadgeRarity, { dot: string; label: string }> = {
  common:    { dot: "bg-slate-400",    label: "Common" },
  uncommon:  { dot: "bg-emerald-400",  label: "Uncommon" },
  rare:      { dot: "bg-blue-400",     label: "Rare" },
  epic:      { dot: "bg-purple-400",   label: "Epic" },
  legendary: { dot: "bg-yellow-400",   label: "Legendary" },
};

// ── Badge icon ────────────────────────────────────────────────────────────────

function BadgeIcon({
  tier,
  imageUrl,
}: {
  tier: BadgeTier;
  imageUrl?: string;
}) {
  const config = TIER_CONFIG[tier];
  const Icon = config.icon;

  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt=""
        aria-hidden="true"
        className="h-full w-full object-cover"
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex h-full w-full items-center justify-center",
        "bg-gradient-to-br",
        config.gradient
      )}
    >
      <Icon
        className={cn(
          "transition-transform duration-300",
          tier === "legendary" ? "h-12 w-12 text-fundable-purple-2" :
          tier === "platinum"  ? "h-10 w-10 text-purple-300" :
          tier === "gold"      ? "h-10 w-10 text-yellow-400" :
          tier === "silver"    ? "h-9 w-9 text-slate-300" :
          "h-9 w-9 text-amber-400"
        )}
      />
    </div>
  );
}

// ── Main card component ───────────────────────────────────────────────────────

export function DonorNftBadgeCard({
  badge,
  interactive = true,
  onClick,
  className,
  tiltOptions,
}: DonorNftBadgeCardProps) {
  const { ref, style, glareStyle, isHovered, isActive } = useTilt({
    maxTilt: 12,
    scale: 1.04,
    glare: true,
    maxGlare: 0.2,
    ...tiltOptions,
    disabled: !interactive || tiltOptions?.disabled,
  });

  const tierConfig = TIER_CONFIG[badge.tier];
  const rarityConfig = RARITY_CONFIG[badge.rarity];

  const handleClick = () => onClick?.(badge);
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick?.(badge);
    }
  };

  return (
    <div
      ref={ref}
      role="article"
      aria-label={`${badge.name} — ${tierConfig.label} tier NFT badge`}
      tabIndex={interactive ? 0 : undefined}
      data-testid="nft-badge-card"
      data-tier={badge.tier}
      data-rarity={badge.rarity}
      onClick={interactive ? handleClick : undefined}
      onKeyDown={interactive ? handleKeyDown : undefined}
      style={style}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border",
        "bg-fundable-dark/90 backdrop-blur-sm",
        "transition-shadow duration-300",
        tierConfig.border,
        isHovered && isActive && `shadow-2xl ${tierConfig.glow}`,
        interactive && "cursor-pointer select-none",
        interactive && "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fundable-purple-2 focus-visible:ring-offset-2 focus-visible:ring-offset-fundable-dark",
        className
      )}
    >
      {/* Glare overlay */}
      <div style={glareStyle} aria-hidden="true" />

      {/* Badge image / icon */}
      <div
        className={cn(
          "relative aspect-square w-full overflow-hidden",
          "bg-gradient-to-br",
          tierConfig.gradient
        )}
        aria-hidden="true"
      >
        <BadgeIcon tier={badge.tier} imageUrl={badge.imageUrl} />

        {/* Tier label pill — top left */}
        <div
          aria-hidden="true"
          className={cn(
            "absolute left-3 top-3 rounded-full border px-2 py-0.5",
            "text-xs font-semibold backdrop-blur-sm",
            tierConfig.border,
            tier_text_color(badge.tier)
          )}
        >
          {tierConfig.label}
        </div>

        {/* Token ID — top right */}
        <div
          aria-hidden="true"
          className="absolute right-3 top-3 rounded-full border border-white/10 bg-black/40 px-2 py-0.5 text-xs text-white/60 backdrop-blur-sm"
        >
          #{badge.tokenId}
        </div>
      </div>

      {/* Card content */}
      <div className="flex flex-1 flex-col gap-2 p-4">
        {/* Name + rarity */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-bold leading-tight text-white">
            {badge.name}
          </h3>
          <span
            aria-label={`Rarity: ${rarityConfig.label}`}
            className="flex shrink-0 items-center gap-1 text-xs text-white/50"
          >
            <span
              aria-hidden="true"
              className={cn("h-2 w-2 rounded-full", rarityConfig.dot)}
            />
            {rarityConfig.label}
          </span>
        </div>

        {/* Description */}
        <p className="line-clamp-2 text-xs text-white/60">{badge.description}</p>

        {/* Contribution amount (if provided) */}
        {badge.contributionAmount && (
          <div className="flex items-center gap-1 text-xs">
            <span className="text-white/40">Contribution:</span>
            <span className="font-semibold text-fundable-purple-2">
              {badge.contributionAmount}
              {badge.contributionToken && (
                <span className="ml-1 text-white/50">{badge.contributionToken}</span>
              )}
            </span>
          </div>
        )}

        {/* Donor address */}
        <div className="mt-auto flex items-center justify-between pt-2 border-t border-white/10">
          <span
            aria-label={`Donor address: ${badge.donorAddress}`}
            className="font-mono text-xs text-white/40"
            title={badge.donorAddress}
          >
            {sliceAddress(badge.donorAddress, 4, 5)}
          </span>

          <div className="flex items-center gap-2">
            <time
              dateTime={badge.mintedAt}
              className="text-xs text-white/30"
            >
              {new Date(badge.mintedAt).toLocaleDateString("en-US", {
                month: "short",
                year: "numeric",
              })}
            </time>

            {badge.explorerUrl && (
              <a
                href={badge.explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`View ${badge.name} on Stellar explorer`}
                onClick={(e) => e.stopPropagation()}
                className={cn(
                  "rounded-sm p-0.5 text-white/30 hover:text-white/70",
                  "focus-visible:outline-none focus-visible:ring-2",
                  "focus-visible:ring-fundable-purple-2 transition-colors"
                )}
              >
                <ExternalLink aria-hidden="true" className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function tier_text_color(tier: BadgeTier): string {
  return {
    bronze:    "text-amber-400",
    silver:    "text-slate-300",
    gold:      "text-yellow-400",
    platinum:  "text-purple-300",
    legendary: "text-fundable-purple-2",
  }[tier];
}

export default DonorNftBadgeCard;
