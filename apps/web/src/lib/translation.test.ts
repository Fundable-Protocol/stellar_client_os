import { describe, expect, it } from "vitest";
import { InMemoryCampaignDataSource, createCampaign } from "@/services/campaign.service";
import {
  autoTranslate,
  localizeCampaign,
  localeFromAcceptLanguage,
  normalizeTranslationLocale,
  SUPPORTED_TRANSLATION_LOCALES,
  validateLocalizedContentMap,
} from "./translation";

describe("campaign localization", () => {
  it("supports more than 20 locales, including requested major languages", () => {
    expect(SUPPORTED_TRANSLATION_LOCALES.length).toBeGreaterThanOrEqual(20);
    expect(SUPPORTED_TRANSLATION_LOCALES).toEqual(expect.arrayContaining(["es", "fr", "de", "zh", "ja", "pt", "ar"]));
  });

  it("normalizes language tags and rejects malformed or unsupported languages", () => {
    expect(normalizeTranslationLocale("es-MX")).toBe("es");
    expect(normalizeTranslationLocale("zh_Hans_CN")).toBe("zh");
    expect(normalizeTranslationLocale("not a language")).toBeNull();
    expect(normalizeTranslationLocale("xx")).toBeNull();
  });

  it("negotiates a supported Accept-Language by quality", () => {
    expect(localeFromAcceptLanguage("xx;q=1, fr-CA;q=0.8, en;q=0.4")).toBe("fr");
    expect(localeFromAcceptLanguage("xx;q=1, *;q=0.5")).toBeNull();
  });

  it("uses reviewed translations and falls back field-by-field to source content", async () => {
    const campaign = await createCampaign({
      creator: "creator-1",
      name: "Mangrove restoration",
      description: "Restore coastal forests",
      language: "en",
      goalAmount: "100",
      localizedContent: { es: { title: "Restauración de manglares", description: "Restaurar bosques costeros" } },
    }, new InMemoryCampaignDataSource());

    expect(localizeCampaign(campaign, "es-MX")).toMatchObject({
      name: "Restauración de manglares",
      description: "Restaurar bosques costeros",
      localization: {
        requestedLanguage: "es",
        resolvedLanguage: "es",
        isFallback: false,
        direction: "ltr",
      },
    });
    expect(localizeCampaign(campaign, "fr")).toMatchObject({
      name: "Mangrove restoration",
      description: "Restore coastal forests",
      localization: {
        requestedLanguage: "fr",
        resolvedLanguage: "en",
        isFallback: true,
        fallbackFields: ["name", "description"],
      },
    });
  });

  it("marks Arabic as RTL and preserves multilingual Unicode copy", async () => {
    const arabicTitle = "استعادة غابات المانغروف";
    const campaign = await createCampaign({
      creator: "creator-1",
      name: "Mangrove restoration",
      goalAmount: "100",
      localizedContent: { ar: { title: arabicTitle, description: "نعمل على استعادة الغابات الساحلية" } },
    }, new InMemoryCampaignDataSource());

    expect(localizeCampaign(campaign, "ar")).toMatchObject({
      name: arabicTitle,
      description: "نعمل على استعادة الغابات الساحلية",
      localization: { direction: "rtl", isFallback: false },
    });
    expect(localizeCampaign(campaign, "ja").localization.direction).toBe("ltr");
  });

  it("validates supported locale maps and never fabricates auto-translations", () => {
    expect(validateLocalizedContentMap({ fr: { title: "Forêts restaurées" } })).toBe(true);
    expect(validateLocalizedContentMap({ xx: { title: "Unknown locale" } })).toBe(false);
    expect(validateLocalizedContentMap({ ar: { title: 7 } })).toBe(false);
    expect(autoTranslate("source text")).toEqual({});
  });
});
