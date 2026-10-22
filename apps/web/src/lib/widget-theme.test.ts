import { describe, expect, it } from "vitest";
import {
  buildEmbedSnippet,
  buildWebComponentSnippet,
  campaignFundingToken,
  daysRemaining,
  progressPercent,
  resolveWidgetTheme,
  widgetIframeSrc,
  WIDGET_IFRAME_MIN_HEIGHT,
  WIDGET_THEMES,
  type CampaignRecord,
} from "./widget-theme";

const campaign = (overrides: Partial<CampaignRecord> = {}): CampaignRecord => ({
  id: "c1",
  creator: "creator-1",
  name: "Mangrove restoration",
  status: "ACTIVE",
  goalAmount: "1000",
  raisedAmount: "250",
  sponsorCount: 1,
  treeCount: 10,
  createdAt: 1_000,
  updatedAt: 1_000,
  statusChangedAt: 1_000,
  sponsors: [],
  statusHistory: [],
  ...overrides,
});

describe("resolveWidgetTheme", () => {
  it("accepts known themes and falls back to light", () => {
    expect(resolveWidgetTheme("dark")).toBe("dark");
    expect(resolveWidgetTheme("forest")).toBe("forest");
    expect(resolveWidgetTheme("light")).toBe("light");
    expect(resolveWidgetTheme("neon")).toBe("light");
    expect(resolveWidgetTheme(undefined)).toBe("light");
    expect(resolveWidgetTheme(["dark", "light"])).toBe("dark");
  });
});

describe("progressPercent", () => {
  it("computes clamped BigInt-safe progress", () => {
    expect(progressPercent(campaign({ goalAmount: "1000", raisedAmount: "250" }))).toBe(25);
    expect(progressPercent(campaign({ goalAmount: "1000", raisedAmount: "10000" }))).toBe(100);
    expect(progressPercent(campaign({ goalAmount: "1000", raisedAmount: "0" }))).toBe(0);
    expect(progressPercent(campaign({ goalAmount: "0", raisedAmount: "500" }))).toBe(0);
    expect(progressPercent(campaign({ goalAmount: "9000000000000000000", raisedAmount: "1" }))).toBe(0);
  });
});

describe("iframe src + snippet", () => {
  it("builds the embeddable src against the API route", () => {
    expect(widgetIframeSrc("c-123", "https://fundable.example/")).toBe(
      "https://fundable.example/api/campaigns/c-123/widget?theme=auto",
    );
    expect(widgetIframeSrc("c-123", "https://x.dev", "forest")).toBe(
      "https://x.dev/api/campaigns/c-123/widget?theme=forest",
    );
  });

  it("produces a copy-paste iframe snippet with default height", () => {
    const snippet = buildEmbedSnippet("c1", "https://fundable.example", "dark");
    expect(snippet).toContain('src="https://fundable.example/api/campaigns/c1/widget?theme=dark"');
    expect(snippet).toContain(`height="${WIDGET_IFRAME_MIN_HEIGHT}"`);
    expect(snippet.startsWith("<iframe")).toBe(true);
  });

  it("defaults embeds to host-aware auto theme and builds a custom-element snippet", () => {
    expect(widgetIframeSrc("c1", "https://fundable.example")).toContain(
      "/api/campaigns/c1/widget?theme=auto",
    );
    const iframeSnippet = buildEmbedSnippet("c1", "https://fundable.example");
    expect(iframeSnippet).toContain("theme=auto");
    expect(iframeSnippet).toContain("MutationObserver");
    expect(iframeSnippet).toContain('width="100%"');
    expect(buildWebComponentSnippet("c1", "https://fundable.example", "dark")).toContain(
      '<fundable-widget campaign-id="c1" theme="dark"></fundable-widget>',
    );
    expect(buildWebComponentSnippet("c1", "https://fundable.example")).toContain(
      "/fundable-widget.js",
    );
    expect(() => widgetIframeSrc("bad/id", "https://fundable.example")).toThrow(
      "Invalid campaign identifier",
    );
    expect(() => widgetIframeSrc("c1", "javascript:alert(1)")).toThrow(
      "Invalid widget base URL",
    );
  });

  it("calculates days remaining for seconds and milliseconds deadlines", () => {
    const now = 1_700_000_000_000;
    expect(daysRemaining(now / 1000 + 86_400, now)).toBe(1);
    expect(daysRemaining(now + 60_000, now)).toBe(1);
    expect(daysRemaining(now - 1, now)).toBe(0);
    expect(daysRemaining(undefined, now)).toBeNull();
  });

  it("labels a single observed token and distinguishes mixed or unknown currencies", () => {
    expect(campaignFundingToken()).toBe("unknown");
    expect(campaignFundingToken([{ token: "XLM" }])).toBe("XLM");
    expect(campaignFundingToken([{ token: "USDC" }, { token: "XLM" }, { token: "USDC" }])).toBe("mixed");
    expect(campaignFundingToken([], { totalsByToken: { XLM: "0", USDC: "25" } })).toBe("USDC");
    expect(campaignFundingToken([], { totalsByToken: { XLM: "25", USDC: "25" } })).toBe("mixed");
    expect(campaignFundingToken([{ token: "EUR" }])).toBe("unknown");
  });

  it("keeps theme token tables complete", () => {
    for (const tokens of Object.values(WIDGET_THEMES)) {
      for (const value of Object.values(tokens)) {
        expect(value).toBeTruthy();
      }
    }
  });
});
