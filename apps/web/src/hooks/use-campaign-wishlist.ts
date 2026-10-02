"use client";

import { useState, useEffect } from "react";
import { useSyncQueue } from "./use-sync-queue";

export function useCampaignWishlist() {
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("campaign_wishlist");
    if (stored) {
      try {
        setWishlist(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to parse wishlist from local storage", e);
      }
    }
    setIsLoaded(true);
  }, []);

  const { enqueue } = useSyncQueue({
    storageKey: "wishlist_sync_queue",
    onSync: async (item) => {
      // In a real implementation, this would call an API to sync the wishlist state
      console.log(`Syncing wishlist action: ${item.label}`);
      // Simulate network request
      await new Promise(resolve => setTimeout(resolve, 800));
      return true;
    }
  });

  const toggleWishlist = (campaignId: string) => {
    const isWished = wishlist.includes(campaignId);
    const newWishlist = isWished 
      ? wishlist.filter(id => id !== campaignId) 
      : [...wishlist, campaignId];
    
    setWishlist(newWishlist);
    localStorage.setItem("campaign_wishlist", JSON.stringify(newWishlist));
    
    enqueue({
      label: isWished ? `Remove campaign ${campaignId} from wishlist` : `Add campaign ${campaignId} to wishlist`,
      description: campaignId,
    });
  };

  const isInWishlist = (campaignId: string) => wishlist.includes(campaignId);

  return { wishlist, toggleWishlist, isInWishlist, isLoaded };
}
