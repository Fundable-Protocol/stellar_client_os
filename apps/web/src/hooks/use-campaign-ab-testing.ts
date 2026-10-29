"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { ABTestConfig, ABTestVariant } from "@/types/campaign-ab-testing";
import { campaignABTestingService } from "@/services/campaign-ab-testing.service";

export interface UseCampaignABTestingOptions {
  campaignId: string;
  defaultHeadline: string;
  defaultHeroImageUrl?: string;
  defaultCtaText?: string;
  testConfig?: ABTestConfig;
  visitorId?: string;
}

export interface UseCampaignABTestingResult {
  variant: ABTestVariant | null;
  activeHeadline: string;
  activeHeroImageUrl?: string;
  activeCtaText: string;
  isABTestingActive: boolean;
  isWinnerLocked: boolean;
  variantId: string | null;
  trackConversion: () => void;
}

export function useCampaignABTesting({
  campaignId,
  defaultHeadline,
  defaultHeroImageUrl,
  defaultCtaText = "Back This Campaign",
  testConfig,
  visitorId,
}: UseCampaignABTestingOptions): UseCampaignABTestingResult {
  const [config, setConfig] = useState<ABTestConfig | undefined>(() => {
    return testConfig || campaignABTestingService.getTestByCampaignId(campaignId);
  });

  const [selectedVariant, setSelectedVariant] = useState<ABTestVariant | null>(null);

  // Generate or retrieve persistent visitor ID for stable assignment
  const stableVisitorId = useMemo(() => {
    if (visitorId) return visitorId;
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("stellar_ab_visitor_id");
      if (stored) return stored;
      const created = `visitor-${Math.random().toString(36).substring(2, 9)}`;
      localStorage.setItem("stellar_ab_visitor_id", created);
      return created;
    }
    return `visitor-${campaignId}`;
  }, [campaignId, visitorId]);

  useEffect(() => {
    const currentConfig = testConfig || campaignABTestingService.getTestByCampaignId(campaignId);
    if (!currentConfig || currentConfig.status === "draft") {
      setSelectedVariant(null);
      return;
    }

    setConfig(currentConfig);

    // If winner is locked, always pick locked winner
    if (currentConfig.lockedWinnerId) {
      const winner = currentConfig.variants.find((v) => v.id === currentConfig.lockedWinnerId);
      if (winner) {
        setSelectedVariant(winner);
        return;
      }
    }

    // Deterministic pseudo-random number based on hash of visitorId + campaignId
    let hash = 0;
    const combinedKey = `${stableVisitorId}:${campaignId}`;
    for (let i = 0; i < combinedKey.length; i++) {
      hash = (hash << 5) - hash + combinedKey.charCodeAt(i);
      hash |= 0;
    }
    const normalizedRand = Math.abs(hash % 10000) / 10000;

    const assigned = campaignABTestingService.routeTraffic(currentConfig, normalizedRand);
    setSelectedVariant(assigned);

    // Record impression once per session
    if (typeof window !== "undefined") {
      const impressionKey = `ab_impression_${currentConfig.id}_${assigned.id}`;
      if (!sessionStorage.getItem(impressionKey)) {
        campaignABTestingService.recordImpression(currentConfig.id, assigned.id);
        sessionStorage.setItem(impressionKey, "1");
      }
    }
  }, [campaignId, testConfig, stableVisitorId]);

  const trackConversion = useCallback(() => {
    if (!config || !selectedVariant) return;

    if (typeof window !== "undefined") {
      const conversionKey = `ab_conv_${config.id}_${selectedVariant.id}`;
      if (!sessionStorage.getItem(conversionKey)) {
        campaignABTestingService.recordConversion(config.id, selectedVariant.id);
        sessionStorage.setItem(conversionKey, "1");
      }
    } else {
      campaignABTestingService.recordConversion(config.id, selectedVariant.id);
    }
  }, [config, selectedVariant]);

  const isABTestingActive = Boolean(config && config.status === "active");
  const isWinnerLocked = Boolean(config && config.lockedWinnerId);

  return {
    variant: selectedVariant,
    activeHeadline: selectedVariant?.headline || defaultHeadline,
    activeHeroImageUrl: selectedVariant?.heroImageUrl || defaultHeroImageUrl,
    activeCtaText: selectedVariant?.ctaText || defaultCtaText,
    isABTestingActive,
    isWinnerLocked,
    variantId: selectedVariant?.id || null,
    trackConversion,
  };
}
