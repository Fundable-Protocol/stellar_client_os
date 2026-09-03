"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Sponsor, SponsorTier, INITIAL_MOCK_SPONSORS, calculateSponsorTier } from "@/types/sponsor";

export interface UseSponsorWallOptions {
  campaignId: string;
  enableLiveUpdates?: boolean;
  pollIntervalMs?: number;
}

const SAMPLE_NAMES = [
  "Nova Stellar Fund", "Cosmos Capital", "Aria Thorne", "Zane Sterling",
  "BioTree Foundation", "Solaris Global", "Lyra Vance", "Hyperion Eco"
];

export function useSponsorWall({
  campaignId,
  enableLiveUpdates = true,
  pollIntervalMs = 6000,
}: UseSponsorWallOptions) {
  const [sponsors, setSponsors] = useState<Sponsor[]>(INITIAL_MOCK_SPONSORS);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTier, setSelectedTier] = useState<SponsorTier | "ALL">("ALL");
  const [sortBy, setSortBy] = useState<"RECENT" | "AMOUNT">("RECENT");
  const [isLiveActive, setIsLiveActive] = useState(enableLiveUpdates);
  const [latestNewSponsor, setLatestNewSponsor] = useState<Sponsor | null>(null);

  // Simulated live incoming sponsorship stream
  useEffect(() => {
    if (!isLiveActive) return;

    const interval = setInterval(() => {
      const randomAmount = Math.floor(Math.random() * 3000) + 100;
      const amountStr = randomAmount.toString();
      const randomName = SAMPLE_NAMES[Math.floor(Math.random() * SAMPLE_NAMES.length)];
      const randomAddr = `G${Math.random().toString(36).substring(2, 6).toUpperCase()}...${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      const newSponsor: Sponsor = {
        id: `sp-${Date.now()}`,
        campaignId,
        name: randomName,
        address: randomAddr,
        amount: amountStr,
        token: Math.random() > 0.5 ? "XLM" : "USDC",
        tier: calculateSponsorTier(amountStr),
        sponsoredAt: Date.now(),
        message: "Live sponsorship via Stellar Client OS!",
        isRecent: true,
      };

      setSponsors((prev) => [newSponsor, ...prev]);
      setLatestNewSponsor(newSponsor);

      // Reset recent glow highlight after 4 seconds
      setTimeout(() => {
        setSponsors((prev) =>
          prev.map((s) => (s.id === newSponsor.id ? { ...s, isRecent: false } : s))
        );
      }, 4000);
    }, pollIntervalMs);

    return () => clearInterval(interval);
  }, [isLiveActive, campaignId, pollIntervalMs]);

  const addSponsor = useCallback((sponsor: Omit<Sponsor, "id" | "sponsoredAt" | "tier">) => {
    const tier = calculateSponsorTier(sponsor.amount);
    const newEntry: Sponsor = {
      ...sponsor,
      id: `sp-${Date.now()}`,
      tier,
      sponsoredAt: Date.now(),
      isRecent: true,
    };

    setSponsors((prev) => [newEntry, ...prev]);
    setLatestNewSponsor(newEntry);
  }, []);

  const filteredSponsors = useMemo(() => {
    return sponsors
      .filter((s) => {
        if (selectedTier !== "ALL" && s.tier !== selectedTier) return false;
        if (searchQuery.trim()) {
          const query = searchQuery.toLowerCase();
          const nameMatch = s.name?.toLowerCase().includes(query);
          const addrMatch = s.address.toLowerCase().includes(query);
          if (!nameMatch && !addrMatch) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "AMOUNT") {
          return parseFloat(b.amount) - parseFloat(a.amount);
        }
        return b.sponsoredAt - a.sponsoredAt;
      });
  }, [sponsors, selectedTier, searchQuery, sortBy]);

  const stats = useMemo(() => {
    const totalSponsors = sponsors.length;
    const totalRaised = sponsors.reduce((acc, s) => acc + parseFloat(s.amount), 0);
    const highestSponsorship = sponsors.reduce(
      (max, s) => Math.max(max, parseFloat(s.amount)),
      0
    );

    return {
      totalSponsors,
      totalRaised,
      highestSponsorship,
    };
  }, [sponsors]);

  return {
    sponsors: filteredSponsors,
    allSponsors: sponsors,
    stats,
    searchQuery,
    setSearchQuery,
    selectedTier,
    setSelectedTier,
    sortBy,
    setSortBy,
    isLiveActive,
    setIsLiveActive,
    latestNewSponsor,
    addSponsor,
  };
}
