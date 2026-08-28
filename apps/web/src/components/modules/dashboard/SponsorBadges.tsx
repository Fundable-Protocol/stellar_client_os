import React from "react";

export type SponsorBadge = "Bronze" | "Silver" | "Gold" | "Platinum";

const BADGES: Array<{ name: SponsorBadge; threshold: number; className: string }> = [
  { name: "Bronze", threshold: 1, className: "border-amber-700/50 bg-amber-950/30 text-amber-300" },
  { name: "Silver", threshold: 10, className: "border-slate-500/50 bg-slate-800/50 text-slate-200" },
  { name: "Gold", threshold: 50, className: "border-yellow-500/50 bg-yellow-950/30 text-yellow-300" },
  { name: "Platinum", threshold: 100, className: "border-cyan-400/50 bg-cyan-950/30 text-cyan-200" },
];

export function getSponsorBadge(totalTrees: number): SponsorBadge | null {
  return [...BADGES].reverse().find((badge) => totalTrees >= badge.threshold)?.name ?? null;
}

export function SponsorBadges({ totalTrees }: { totalTrees: number }) {
  const safeTotal = Math.max(0, Math.floor(totalTrees));
  const earned = getSponsorBadge(safeTotal);
  const next = BADGES.find((badge) => safeTotal < badge.threshold);
  const progress = next ? Math.min(100, Math.round((safeTotal / next.threshold) * 100)) : 100;

  return (
    <section aria-labelledby="sponsor-badges-heading" className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 mb-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="sponsor-badges-heading" className="text-lg font-semibold text-white">Sponsor badges</h3>
          <p className="text-sm text-zinc-400">Milestones are calculated from your sponsored trees.</p>
        </div>
        <p className="text-sm font-medium text-zinc-300" data-testid="sponsor-badge-status">
          {earned ? `${earned} badge earned` : "Start your badge journey"}
        </p>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {BADGES.map((badge) => {
          const isEarned = safeTotal >= badge.threshold;
          return (
            <div key={badge.name} className={`rounded-xl border p-3 ${isEarned ? badge.className : "border-zinc-800 text-zinc-600"}`} aria-label={`${badge.name} badge, ${isEarned ? "earned" : "locked"}`}>
              <p className="font-semibold">{badge.name}</p>
              <p className="mt-1 text-xs">{badge.threshold} {badge.threshold === 1 ? "tree" : "trees"}</p>
              <p className="mt-2 text-xs">{isEarned ? "Earned" : "Locked"}</p>
            </div>
          );
        })}
      </div>
      {next && (
        <div className="mt-5" aria-label={`Progress to ${next.name}`}>
          <div className="mb-1 flex justify-between text-xs text-zinc-400"><span>{safeTotal} / {next.threshold} trees</span><span>{progress}%</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-zinc-800"><div className="h-full rounded-full bg-cyan-400 transition-all" style={{ width: `${progress}%` }} /></div>
        </div>
      )}
    </section>
  );
}

export default SponsorBadges;
