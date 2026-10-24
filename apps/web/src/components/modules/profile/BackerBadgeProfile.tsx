"use client";

import { useEffect, useState } from "react";

interface Badge { key: string; name: string; description: string; icon: string; awardedAt: number }
interface Profile { activity: { pledgeCount: number; campaignsBacked: number; totalPledged: string }; badges: Badge[] }

export function BackerBadgeProfile({ address }: { address: string }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  useEffect(() => {
    let active = true;
    fetch(`/api/backers/${encodeURIComponent(address)}/badges`).then((response) => response.ok ? response.json() : null).then((data) => { if (active) setProfile(data); }).catch(() => undefined);
    return () => { active = false; };
  }, [address]);
  if (!profile) return <p className="text-sm text-zinc-500" aria-live="polite">Loading backer badges…</p>;
  return (
    <section aria-labelledby="backer-badges-heading" className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <h2 id="backer-badges-heading" className="text-xl font-semibold">Backer recognition</h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{profile.activity.campaignsBacked} campaigns backed · {profile.activity.pledgeCount} pledges</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {profile.badges.length ? profile.badges.map((badge) => <article key={badge.key} className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-950/20"><span className="text-xl" aria-hidden="true">{badge.icon}</span><h3 className="font-medium">{badge.name}</h3><p className="text-sm text-zinc-600 dark:text-zinc-400">{badge.description}</p></article>) : <p className="text-sm text-zinc-500">Back a campaign to earn your first badge.</p>}
      </div>
    </section>
  );
}
