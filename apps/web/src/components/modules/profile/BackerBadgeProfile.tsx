"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@/providers/StellarWalletProvider";

interface Badge {
  key: string;
  name: string;
  description: string;
  icon: string;
  awardedAt: number;
  metadataUri: string;
}

interface ProfilePrivacy {
  showBadgeShowcase: boolean;
  profilePrivate: boolean;
}

interface Profile {
  activity: { pledgeCount: number; campaignsBacked: number; totalPledged: string };
  badges: Badge[];
  privacy: ProfilePrivacy;
  isOwner?: boolean;
}

export interface BackerBadgeProfileProps {
  address?: string;
}

function formatMintDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function BackerBadgeProfile({ address: addressProp }: BackerBadgeProfileProps) {
  const { address: walletAddress } = useWallet();
  const address = addressProp ?? walletAddress ?? "";
  const [profile, setProfile] = useState<Profile | null>(null);
  const [hidden, setHidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingPrivacy, setSavingPrivacy] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!address) {
      setProfile(null);
      setHidden(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    setHidden(false);
    const viewer = walletAddress && walletAddress.toLowerCase() === address.toLowerCase() ? walletAddress : walletAddress ?? "";
    const query = viewer ? `?viewer=${encodeURIComponent(viewer)}` : "";
    try {
      const response = await fetch(`/api/backers/${encodeURIComponent(address)}/badges${query}`);
      if (response.status === 403) {
        setHidden(true);
        setProfile(null);
        return;
      }
      if (!response.ok) {
        setProfile(null);
        return;
      }
      setProfile((await response.json()) as Profile);
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [address, walletAddress]);

  useEffect(() => {
    let active = true;
    void (async () => {
      await loadProfile();
      if (!active) return;
    })();
    return () => {
      active = false;
    };
  }, [loadProfile]);

  const updatePrivacy = async (patch: Partial<ProfilePrivacy>) => {
    if (!address || !walletAddress) return;
    setSavingPrivacy(true);
    try {
      const response = await fetch(`/api/backers/${encodeURIComponent(address)}/badges`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ viewerAddress: walletAddress, ...patch }),
      });
      if (response.ok) {
        const data = (await response.json()) as { profile: Profile };
        setProfile(data.profile);
      }
    } finally {
      setSavingPrivacy(false);
    }
  };

  if (!address) {
    return (
      <p className="text-sm text-zinc-500" aria-live="polite">
        Connect your wallet to view backer badges.
      </p>
    );
  }

  if (loading) {
    return <p className="text-sm text-zinc-500" aria-live="polite">Loading backer badges…</p>;
  }

  if (hidden) {
    return (
      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-sm text-zinc-500">This backer has made their profile private.</p>
      </section>
    );
  }

  if (!profile) {
    return <p className="text-sm text-zinc-500" role="alert">Unable to load backer badges.</p>;
  }

  const showcaseHiddenFromPublic = !profile.privacy.showBadgeShowcase && !profile.isOwner;

  return (
    <section
      aria-labelledby="backer-badges-heading"
      className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="backer-badges-heading" className="text-xl font-semibold">Backer recognition</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {profile.activity.campaignsBacked} campaigns backed · {profile.activity.pledgeCount} pledges
          </p>
        </div>
        {profile.isOwner && (
          <fieldset className="space-y-2 text-sm" disabled={savingPrivacy}>
            <legend className="sr-only">Badge showcase privacy</legend>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={profile.privacy.showBadgeShowcase}
                onChange={(event) => updatePrivacy({ showBadgeShowcase: event.target.checked })}
              />
              Show badge showcase on public profile
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={profile.privacy.profilePrivate}
                onChange={(event) => updatePrivacy({ profilePrivate: event.target.checked })}
              />
              Make profile private
            </label>
          </fieldset>
        )}
      </div>

      {showcaseHiddenFromPublic ? (
        <p className="mt-4 text-sm text-zinc-500">Badge showcase is hidden.</p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {profile.badges.length ? (
            profile.badges.map((badge) => (
              <article
                key={badge.key}
                className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-950/20"
              >
                <span className="text-xl" aria-hidden="true">{badge.icon}</span>
                <h3 className="font-medium">{badge.name}</h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">{badge.description}</p>
                <p className="mt-2 text-xs text-zinc-500">Minted {formatMintDate(badge.awardedAt)}</p>
                <a
                  href={badge.metadataUri}
                  className="mt-2 inline-block text-xs font-medium text-amber-800 underline dark:text-amber-200"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View Stellar NFT metadata
                </a>
              </article>
            ))
          ) : (
            <p className="text-sm text-zinc-500">Back a campaign to earn your first badge.</p>
          )}
        </div>
      )}

      {profile.isOwner && !profile.privacy.showBadgeShowcase && profile.badges.length > 0 && (
        <p className="mt-4 text-xs text-zinc-500">
          Your badges are hidden from visitors. Only you can see them here.
        </p>
      )}
    </section>
  );
}
