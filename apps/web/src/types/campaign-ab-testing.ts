/**
 * Campaign A/B Testing Types
 * 
 * Enables creators to test variants of campaign headlines, hero images, and CTA button text.
 * Supports configurable traffic splits (default 50/50) and manual or significance-based winner locking.
 */

export interface ABTestVariant {
  id: string;
  name: string;
  headline: string;
  heroImageUrl: string;
  ctaText: string;
  impressions: number;
  conversions: number;
}

export type TrafficSplit = Record<string, number>;

export type WinnerSelectionMode = "manual" | "significance";

export type ABTestStatus = "draft" | "active" | "paused" | "concluded";

export interface SignificanceResult {
  pValue: number;
  zScore: number;
  confidence: number; // 0 - 1.0 (e.g., 0.95 = 95%)
  isSignificant: boolean;
  winnerVariantId: string | null;
  sufficientData: boolean;
  minSampleSizeRequired: number;
  recommendation: string;
}

export interface ABTestConfig {
  id: string;
  campaignId: string;
  status: ABTestStatus;
  variants: ABTestVariant[];
  trafficSplit: TrafficSplit;
  winnerSelectionMode: WinnerSelectionMode;
  lockedWinnerId: string | null;
  significanceThreshold: number; // e.g. 0.95 for 95% confidence
  minSampleSize: number; // Minimum impressions per variant before auto-selection
  createdAt: string;
  updatedAt: string;
  concludedAt?: string;
}

export interface CreateABTestDTO {
  campaignId: string;
  variants: Array<{
    name?: string;
    headline: string;
    heroImageUrl: string;
    ctaText: string;
  }>;
  trafficSplit?: TrafficSplit;
  winnerSelectionMode?: WinnerSelectionMode;
  significanceThreshold?: number;
  minSampleSize?: number;
}
