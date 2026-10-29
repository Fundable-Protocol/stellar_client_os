import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCampaignABTesting } from "./use-campaign-ab-testing";
import { campaignABTestingService } from "@/services/campaign-ab-testing.service";

describe("useCampaignABTesting", () => {
  beforeEach(() => {
    if (typeof window !== "undefined") {
      localStorage.clear();
      sessionStorage.clear();
    }
  });

  it("returns default values when no test exists", () => {
    const { result } = renderHook(() =>
      useCampaignABTesting({
        campaignId: "non-existent-campaign",
        defaultHeadline: "Default Title",
        defaultHeroImageUrl: "https://example.com/img.png",
        defaultCtaText: "Back Now",
      })
    );

    expect(result.current.activeHeadline).toBe("Default Title");
    expect(result.current.activeHeroImageUrl).toBe("https://example.com/img.png");
    expect(result.current.activeCtaText).toBe("Back Now");
    expect(result.current.isABTestingActive).toBe(false);
    expect(result.current.variant).toBeNull();
  });

  it("serves variant based on test config and split", () => {
    const test = campaignABTestingService.createTest({
      campaignId: "camp-test-hook",
      variants: [
        {
          name: "Variant A",
          headline: "Headline A",
          heroImageUrl: "https://example.com/a.png",
          ctaText: "CTA A",
        },
        {
          name: "Variant B",
          headline: "Headline B",
          heroImageUrl: "https://example.com/b.png",
          ctaText: "CTA B",
        },
      ],
    });

    const { result } = renderHook(() =>
      useCampaignABTesting({
        campaignId: "camp-test-hook",
        defaultHeadline: "Fallback Title",
        testConfig: test,
      })
    );

    expect(result.current.isABTestingActive).toBe(true);
    expect(result.current.variant).toBeDefined();
    expect(["Headline A", "Headline B"]).toContain(result.current.activeHeadline);
  });

  it("always returns locked winner", () => {
    const test = campaignABTestingService.createTest({
      campaignId: "camp-locked-test",
      variants: [
        {
          name: "Variant A",
          headline: "Headline A",
          heroImageUrl: "https://example.com/a.png",
          ctaText: "CTA A",
        },
        {
          name: "Variant B",
          headline: "Headline B (Winner)",
          heroImageUrl: "https://example.com/b.png",
          ctaText: "CTA B",
        },
      ],
    });

    const [, vB] = test.variants;
    campaignABTestingService.lockWinner(test.id, vB.id);

    const { result } = renderHook(() =>
      useCampaignABTesting({
        campaignId: "camp-locked-test",
        defaultHeadline: "Fallback Title",
        testConfig: test,
      })
    );

    expect(result.current.isWinnerLocked).toBe(true);
    expect(result.current.variantId).toBe(vB.id);
    expect(result.current.activeHeadline).toBe("Headline B (Winner)");
  });

  it("tracks conversion on active variant", () => {
    const test = campaignABTestingService.createTest({
      campaignId: "camp-conv-test",
      variants: [
        {
          name: "Variant A",
          headline: "Headline A",
          heroImageUrl: "https://example.com/a.png",
          ctaText: "CTA A",
        },
        {
          name: "Variant B",
          headline: "Headline B",
          heroImageUrl: "https://example.com/b.png",
          ctaText: "CTA B",
        },
      ],
    });

    const { result } = renderHook(() =>
      useCampaignABTesting({
        campaignId: "camp-conv-test",
        defaultHeadline: "Fallback Title",
        testConfig: test,
      })
    );

    const activeVarId = result.current.variantId!;
    expect(activeVarId).toBeDefined();

    act(() => {
      result.current.trackConversion();
    });

    const activeVar = test.variants.find((v) => v.id === activeVarId)!;
    expect(activeVar.conversions).toBeGreaterThanOrEqual(1);
  });
});
