"use client";

import { useState, useEffect } from "react";
import { CampaignRecord } from "@/services/campaign.service";
import { useSyncQueue } from "./use-sync-queue";

export function useCampaigns() {
  const defaultCampaigns = [
    {
      id: "camp-101",
      title: "Save the Amazon RainForest Reserve",
      category: "Environmental & Reforestation",
      raisedAmount: "33,850",
      goalAmount: "50,000",
      token: "XLM",
      sponsorCount: 6,
      collaboratorCount: 2,
      status: "ACTIVE",
      description: "Protecting 50,000 hectares of primary rainforest through community-led guardianship and carbon streaming.",
      endDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(), // Expires in 5 days
    },
    {
      id: "camp-102",
      title: "Clean Water Wells for Sub-Saharan Communities",
      category: "Community & Social Impact",
      raisedAmount: "18,200",
      goalAmount: "25,000",
      token: "USDC",
      sponsorCount: 14,
      collaboratorCount: 3,
      status: "ACTIVE",
      description: "Installing 12 solar-powered water filtration wells across rural farming villages.",
    },
  ];

  const [campaigns, setCampaigns] = useState<any[]>(defaultCampaigns);
  const [isLoading, setIsLoading] = useState(true);
  const { isOnline } = useSyncQueue();

  useEffect(() => {
    // 1. Load from cache first for fast offline access
    const cached = localStorage.getItem("campaigns_cache");
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.length > 0) {
          setCampaigns(parsed);
        }
      } catch (e) {
        console.error("Failed to parse cached campaigns", e);
      }
    }

    // 2. Fetch fresh data if online
    const fetchCampaigns = async () => {
      if (!navigator.onLine) {
        setIsLoading(false);
        return;
      }
      
      try {
        const res = await fetch("/api/campaigns");
        if (res.ok) {
          const { data } = await res.json();
          // Map backend records to UI format if needed
          const formatted = data.map((c: any) => ({
            id: c.id,
            title: c.name,
            category: "General", // Placeholder if not in API
            raisedAmount: c.raisedAmount || "0",
            goalAmount: c.goalAmount,
            token: "XLM",
            sponsorCount: c.sponsorCount || 0,
            collaboratorCount: 0,
            status: c.status,
            description: c.description || "",
            endDate: c.endDate || c.deadline ? new Date(c.deadline || c.endDate).toISOString() : undefined,
          }));
          
          if (formatted.length > 0) {
            setCampaigns(formatted);
            localStorage.setItem("campaigns_cache", JSON.stringify(formatted));
          }
        }
      } catch (e) {
        console.error("Failed to fetch campaigns", e);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCampaigns();
  }, [isOnline]);

  return { campaigns, isLoading };
}
