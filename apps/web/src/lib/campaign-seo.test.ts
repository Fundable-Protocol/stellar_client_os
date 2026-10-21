import { describe, expect, it } from "vitest";
import {
  SEO_DESCRIPTION_RANGE,
  SEO_TITLE_RANGE,
  getSeoLengthStatus,
  resolveCampaignSeo,
  truncateForPreview,
  validateCampaignSeo,
} from "./campaign-seo";

describe("getSeoLengthStatus", () => {
  it("classifies lengths against the recommended range", () => {
    expect(getSeoLengthStatus(0, SEO_TITLE_RANGE)).toBe("empty");
    expect(getSeoLengthStatus(10, SEO_TITLE_RANGE)).toBe("short");
    expect(getSeoLengthStatus(45, SEO_TITLE_RANGE)).toBe("good");
    expect(getSeoLengthStatus(60, SEO_TITLE_RANGE)).toBe("good");
    expect(getSeoLengthStatus(61, SEO_TITLE_RANGE)).toBe("long");
    expect(getSeoLengthStatus(161, SEO_DESCRIPTION_RANGE)).toBe("long");
  });
});

describe("truncateForPreview", () => {
  it("leaves short text alone and collapses whitespace", () => {
    expect(truncateForPreview("  Plant   trees  ", 60)).toBe("Plant trees");
  });

  it("cuts at a word boundary with an ellipsis", () => {
    const result = truncateForPreview("Restore mangrove forests along the Lagos lagoon coastline", 30);
    expect(result.endsWith("…")).toBe(true);
    expect(result.length).toBeLessThanOrEqual(30);
    expect(result).toBe("Restore mangrove forests…");
  });
});

describe("validateCampaignSeo", () => {
  it("normalizes values and drops empty fields", () => {
    const result = validateCampaignSeo({ title: "  Grow  a forest ", description: "", ogImageUrl: " https://cdn.example.com/og.png " });
    expect(result).toEqual({ ok: true, value: { title: "Grow a forest", ogImageUrl: "https://cdn.example.com/og.png" } });
  });

  it("rejects non-http image URLs and over-limit text", () => {
    const result = validateCampaignSeo({
      title: "x".repeat(121),
      description: "y".repeat(321),
      ogImageUrl: "javascript:alert(1)",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual(["description", "ogImageUrl", "title"]);
    }
  });

  it("allows text above the recommended range but within the hard limit", () => {
    expect(validateCampaignSeo({ title: "x".repeat(80) }).ok).toBe(true);
  });
});

describe("resolveCampaignSeo", () => {
  it("prefers creator overrides", () => {
    expect(
      resolveCampaignSeo(
        { title: "Custom", description: "Custom description", ogImageUrl: "https://x.test/a.png" },
        { name: "Campaign", description: "Default" },
      ),
    ).toEqual({ title: "Custom", description: "Custom description", ogImageUrl: "https://x.test/a.png" });
  });

  it("falls back to the campaign name and a truncated description", () => {
    const resolved = resolveCampaignSeo(null, { name: "Campaign", description: "word ".repeat(80) });
    expect(resolved.title).toBe("Campaign");
    expect(resolved.description.length).toBeLessThanOrEqual(SEO_DESCRIPTION_RANGE.max);
    expect(resolved.ogImageUrl).toBeUndefined();
  });
});
