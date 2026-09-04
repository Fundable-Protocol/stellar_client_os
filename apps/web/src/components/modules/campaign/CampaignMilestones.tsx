"use client";

import { motion } from "framer-motion";
import {
  CheckCircle2,
  Flag,
  Lock,
  Medal,
  PartyPopper,
  Rocket,
  Trophy,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  MILESTONE_PERCENTAGES,
  calculateFundingProgress,
  getAchievedMilestonePercentages,
  getNextMilestone,
  type MilestonePercentage,
} from "@/lib/campaign-milestones";

interface MilestoneMeta {
  title: string;
  description: string;
  Icon: LucideIcon;
  /** Accent color classes applied to an achieved badge. */
  accent: string;
  /** Classes for the per-milestone icon chip. */
  chip: string;
  /** Classes for the celebratory glow behind an achieved badge. */
  glow: string;
}

const MILESTONE_META: Record<MilestonePercentage, MilestoneMeta> = {
  25: {
    title: "Kickoff",
    description: "First 25% funded",
    Icon: Flag,
    accent: "border-emerald-500/50 bg-emerald-950/30 text-emerald-300",
    chip: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30",
    glow: "bg-emerald-500/20",
  },
  50: {
    title: "Halfway",
    description: "50% of goal reached",
    Icon: Medal,
    accent: "border-sky-500/50 bg-sky-950/30 text-sky-300",
    chip: "bg-sky-500/15 text-sky-300 ring-sky-400/30",
    glow: "bg-sky-500/20",
  },
  75: {
    title: "Almost There",
    description: "75% of goal reached",
    Icon: Rocket,
    accent: "border-violet-500/50 bg-violet-950/30 text-violet-300",
    chip: "bg-violet-500/15 text-violet-300 ring-violet-400/30",
    glow: "bg-violet-500/20",
  },
  100: {
    title: "Fully Funded",
    description: "Goal reached!",
    Icon: Trophy,
    accent: "border-amber-500/50 bg-amber-950/30 text-amber-300",
    chip: "bg-amber-500/15 text-amber-300 ring-amber-400/30",
    glow: "bg-amber-500/20",
  },
};

const SPARKLE_COLOR: Record<MilestonePercentage, string> = {
  25: "#34d399", // emerald-400
  50: "#38bdf8", // sky-400
  75: "#a78bfa", // violet-400
  100: "#fbbf24", // amber-400
};

export interface CampaignMilestonesProps {
  raisedAmount?: string | number;
  goalAmount?: string | number;
  className?: string;
}

/**
 * Funding milestone achievement badges.
 *
 * When funding reaches 25%, 50%, 75% and 100% of the campaign goal, the
 * corresponding badge unlocks and plays a celebratory animation. Every badge
 * uses its own custom icon and accent colour.
 */
export function CampaignMilestones({
  raisedAmount,
  goalAmount,
  className,
}: CampaignMilestonesProps) {
  const progress = calculateFundingProgress(raisedAmount ?? 0, goalAmount ?? 0);
  const achieved = getAchievedMilestonePercentages(progress);
  const next = getNextMilestone(progress);
  const fullyFunded = progress >= 100;

  return (
    <section
      aria-labelledby="campaign-milestones-heading"
      className={cn(
        "rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5",
        className
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3
            id="campaign-milestones-heading"
            className="text-base font-semibold text-zinc-100"
          >
            Funding Milestones
          </h3>
          <p className="text-xs text-zinc-400">
            {achieved.length > 0
              ? `${achieved.length} of ${MILESTONE_PERCENTAGES.length} milestones unlocked`
              : "Unlock badges as funding grows"}
          </p>
        </div>

        {fullyFunded ? (
          <span
            data-testid="milestone-status"
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-950/40 px-3 py-1 text-xs font-semibold text-amber-300"
          >
            <PartyPopper className="h-3.5 w-3.5" aria-hidden="true" />
            Goal achieved
          </span>
        ) : (
          <span
            data-testid="milestone-status"
            className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-800/60 px-3 py-1 text-xs font-medium text-zinc-400"
          >
            Next at {next}%
          </span>
        )}
      </div>

      {/* Overall progress track with milestone tick markers. */}
      <div className="mt-5">
        <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-zinc-500">
          <span>{progress}%</span>
          <span>Target 100%</span>
        </div>
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-zinc-800">
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-purple-500 via-indigo-500 to-emerald-400"
            initial={false}
            animate={{ width: `${progress}%` }}
            transition={{ ease: "easeOut", duration: 0.6 }}
            data-testid="milestone-progress-bar"
          />
        </div>
      </div>

      <div
        className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4"
        data-testid="milestone-grid"
      >
        {MILESTONE_PERCENTAGES.map((percentage) => {
          const meta = MILESTONE_META[percentage];
          const isAchieved = achieved.includes(percentage);
          return (
            <MilestoneBadge
              key={percentage}
              percentage={percentage}
              meta={meta}
              achieved={isAchieved}
              isNext={next === percentage}
            />
          );
        })}
      </div>
    </section>
  );
}

interface MilestoneBadgeProps {
  percentage: MilestonePercentage;
  meta: MilestoneMeta;
  achieved: boolean;
  isNext: boolean;
}

function MilestoneBadge({
  percentage,
  meta,
  achieved,
  isNext,
}: MilestoneBadgeProps) {
  const { Icon, title, description, accent, chip, glow } = meta;

  return (
    <motion.div
      initial={false}
      animate={
        achieved
          ? { scale: [0.85, 1.06, 1], opacity: [0, 1, 1] }
          : { scale: 1, opacity: 1 }
      }
      transition={
        achieved
          ? { duration: 0.55, ease: "easeOut" }
          : { duration: 0.2 }
      }
      role="img"
      aria-label={`${percentage}% milestone — ${title}, ${achieved ? "achieved" : "locked"}`}
      data-testid={`milestone-${percentage}`}
      data-achieved={achieved}
      className={cn(
        "relative flex flex-col items-center gap-1 rounded-xl border p-3 text-center transition-colors",
        achieved
          ? accent
          : "border-zinc-800 bg-zinc-950/40 text-zinc-600",
        isNext && !achieved && "border-purple-500/50 bg-purple-950/20 ring-1 ring-purple-500/20"
      )}
    >
      {/* Celebratory glow + ring pulse for achieved milestones */}
      {achieved && (
        <>
          <motion.span
            aria-hidden="true"
            className={cn("pointer-events-none absolute inset-0 rounded-xl opacity-0 blur-xl", glow)}
            animate={{ opacity: [0, 0.5, 0] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-xl ring-2 ring-inset"
            style={{ ["--ring-color" as string]: SPARKLE_COLOR[percentage], borderColor: SPARKLE_COLOR[percentage] }}
            animate={{ opacity: [0.7, 0, 0.7], scale: [1, 1.08, 1] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
          />
          <SparkleBurst color={SPARKLE_COLOR[percentage]} />
        </>
      )}

      <span
        className={cn(
          "relative flex h-10 w-10 items-center justify-center rounded-full",
          achieved ? cn("ring-1", chip) : "bg-zinc-900 text-zinc-600"
        )}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
        {achieved ? (
          <CheckCircle2
            className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-zinc-950 text-emerald-400"
            aria-hidden="true"
          />
        ) : (
          <Lock className="absolute -bottom-1 -right-1 h-3.5 w-3.5 text-zinc-600" aria-hidden="true" />
        )}
      </span>

      <span className={cn("text-xs font-semibold", achieved ? "text-current" : "text-zinc-500")}>
        {percentage}%
      </span>
      <span className="text-[11px] leading-tight text-zinc-500">
        {title}
      </span>
      <span className="sr-only">{achieved ? "Achieved" : "Locked"} · {description}</span>
    </motion.div>
  );
}

/**
 * Small celebratory particle burst rendered for achieved badges.
 */
function SparkleBurst({ color }: { color: string }) {
  const particles = Array.from({ length: 8 });
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0">
      {particles.map((_, i) => {
        const angle = (i / particles.length) * Math.PI * 2;
        const distance = 26;
        const x = Math.cos(angle) * distance;
        const y = Math.sin(angle) * distance;
        return (
          <motion.span
            key={i}
            className="absolute left-1/2 top-1/2 h-1 w-1 rounded-full"
            style={{ backgroundColor: color }}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
            animate={{ x, y, opacity: [0, 1, 0], scale: [0, 1, 0.5] }}
            transition={{
              duration: 1.4,
              delay: 0.15 + i * 0.02,
              repeat: Infinity,
              repeatDelay: 1.6,
              ease: "easeOut",
            }}
          />
        );
      })}
    </span>
  );
}

export default CampaignMilestones;
