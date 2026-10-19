"use client";

import { useState, useEffect, useCallback } from "react";
import { CampaignRecord } from "@/services/campaign.service";
import { useSyncQueue } from "./use-sync-queue";
import { donationService } from "@/services/donation.service";
import { graphqlClient } from "@/lib/graphql-client";

// ---------------------------------------------------------------------------
// Page size used when fetching from the API.
// Virtual scrolling makes it safe to load large pages because only the
// currently-visible cards are in the DOM.  We fetch up to 500 at a time and
// append on scroll (infinite load pattern) to support 10k+ campaign lists
// without a single blocking request.
// ---------------------------------------------------------------------------
const PAGE_SIZE = 500;

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
  const [hasMore, setHasMore] = useState(true);
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

    // 2. Fetch fresh data if online — loads in large pages to support virtual
    //    scrolling over 10k+ campaigns (issue #914).
    const fetchCampaigns = async () => {
      if (!navigator.onLine) {
        setIsLoading(false);
        return;
      }

      let offset = 0;
      const accumulated: any[] = [];

      try {
        while (true) {
          const res = await fetch(`/api/campaigns?limit=${PAGE_SIZE}&offset=${offset}`);
          if (!res.ok) break;

          const { data, pagination } = await res.json();

          // Map backend records to UI format
          const formatted = (data as any[]).map((c) => ({
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
            treeSpecies: c.treeSpecies,
            region: c.region,
            location: c.location,
            gpsLocations: c.gpsLocations,
            isStaffPick: Boolean(c.isStaffPick),
            staffPickReason: c.staffPickReason,
            charityBadge: c.charityBadge,
            endDate: c.endDate || c.deadline ? new Date(c.deadline || c.endDate).toISOString() : undefined,
          }));

          accumulated.push(...formatted);
          offset += PAGE_SIZE;

          // Stop when the API returns fewer items than the page size,
          // meaning we've fetched all available campaigns.
          if (!data || data.length < PAGE_SIZE) {
            setHasMore(false);
            break;
          }
        }

        if (accumulated.length > 0) {
          setCampaigns(accumulated);
          localStorage.setItem("campaigns_cache", JSON.stringify(accumulated));
        }
      } catch (e) {
        console.error("Failed to fetch campaigns", e);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCampaigns();
  }, [isOnline]);

  return { campaigns, isLoading, hasMore };
}

// ---------------------------------------------------------------------------
// Tax receipts (issue #1233)
// Fetches the downloadable tax receipts for a backer's eligible (charitable /
// non-profit) campaign contributions and exposes a helper to download the PDF.
// ---------------------------------------------------------------------------
const TAX_RECEIPTS_QUERY = `
  query TaxReceipts($backerAddress: String!) {
    taxReceipts(backerAddress: $backerAddress) {
      id
      reference
      campaignId
      campaignTitle
      amount
      currency
      issuedAt
    }
  }
`;

export interface TaxReceipt {
  id: string;
  reference: string;
  campaignId: string;
  campaignTitle: string;
  amount: string;
  currency: string;
  issuedAt: string;
}

export function useTaxReceipts(backerAddress?: string) {
  const [receipts, setReceipts] = useState<TaxReceipt[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!backerAddress) {
      setReceipts([]);
      return;
    }

    let cancelled = false;

    const fetchReceipts = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const data = await graphqlClient.request<{ taxReceipts: TaxReceipt[] }>(
          TAX_RECEIPTS_QUERY,
          { backerAddress },
        );

        if (!cancelled) {
          setReceipts(data?.taxReceipts ?? []);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e : new Error("Failed to load tax receipts"));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchReceipts();

    return () => {
      cancelled = true;
    };
  }, [backerAddress]);

  const downloadReceipt = useCallback(
    async (receiptId: string) => {
      const receipt = receipts.find((r) => r.id === receiptId);
      const reference = receipt?.reference ?? receiptId;

      const pdfBytes = await donationService.downloadTaxReceipt(receiptId);
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);

      try {
        const link = document.createElement("a");
        link.href = url;
        link.download = `${reference}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
      } finally {
        URL.revokeObjectURL(url);
      }
    },
    [receipts],
  );

  return { receipts, isLoading, error, downloadReceipt };
}

