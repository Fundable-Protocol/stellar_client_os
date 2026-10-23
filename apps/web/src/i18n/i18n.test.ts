import { describe, expect, it } from "vitest";
import {
  getLanguageDirection,
  getTextDirection,
  resolveUiLocale,
  uiLocaleFromAcceptLanguage,
  UI_LOCALES,
} from "./config";
import { interpolate, MESSAGES, translate } from "./translate";

function leafKeys(node: unknown, prefix = ""): string[] {
  if (typeof node === "string") return [prefix];
  return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
    leafKeys(value, prefix ? `${prefix}.${key}` : key),
  );
}

function placeholders(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

describe("UI locale config", () => {
  it("supports English, French, Spanish, Portuguese, Arabic and Hebrew", () => {
    expect([...UI_LOCALES].sort()).toEqual(["ar", "en", "es", "fr", "he", "pt"]);
  });

  it("marks Arabic and Hebrew as right-to-left", () => {
    expect(getTextDirection("ar")).toBe("rtl");
    expect(getTextDirection("he")).toBe("rtl");
    for (const locale of UI_LOCALES.filter((l) => l !== "ar" && l !== "he")) {
      expect(getTextDirection(locale)).toBe("ltr");
    }
  });

  it("resolves Hebrew tags to the Hebrew catalogue", () => {
    expect(resolveUiLocale("he")).toBe("he");
    expect(resolveUiLocale("he-IL")).toBe("he");
    expect(uiLocaleFromAcceptLanguage("he-IL,ar;q=0.8")).toBe("he");
  });

  it("resolves regional tags and falls back to English", () => {
    expect(resolveUiLocale("pt-BR")).toBe("pt");
    expect(resolveUiLocale("fr_CA")).toBe("fr");
    expect(resolveUiLocale("de")).toBe("en");
    expect(resolveUiLocale(undefined)).toBe("en");
  });

  it("honours Accept-Language q-weights", () => {
    expect(uiLocaleFromAcceptLanguage("de-DE,de;q=0.9,es;q=0.8,fr;q=0.7")).toBe("es");
    expect(uiLocaleFromAcceptLanguage("ar-SA")).toBe("ar");
    expect(uiLocaleFromAcceptLanguage("fr;q=0.2,pt;q=0.9")).toBe("pt");
    expect(uiLocaleFromAcceptLanguage("ja,zh;q=0.5")).toBe("en");
    expect(uiLocaleFromAcceptLanguage(null)).toBe("en");
  });
});

describe("campaign content direction", () => {
  it("marks Arabic, Persian, Hebrew and Urdu campaign copy as RTL", () => {
    for (const language of ["ar", "fa", "he", "ur"]) {
      expect(getLanguageDirection(language)).toBe("rtl");
    }
  });

  it("normalises regional tags before resolving direction", () => {
    expect(getLanguageDirection("he-IL")).toBe("rtl");
    expect(getLanguageDirection("AR_eg")).toBe("rtl");
    expect(getLanguageDirection("en-US")).toBe("ltr");
    expect(getLanguageDirection("")).toBe("ltr");
    expect(getLanguageDirection(null)).toBe("ltr");
  });
});

describe("message catalogues", () => {
  const englishKeys = leafKeys(MESSAGES.en).sort();

  it.each(UI_LOCALES.filter((l) => l !== "en"))("%s has exactly the English keys", (locale) => {
    expect(leafKeys(MESSAGES[locale]).sort()).toEqual(englishKeys);
  });

  it.each(UI_LOCALES.filter((l) => l !== "en"))("%s keeps every interpolation placeholder", (locale) => {
    for (const key of englishKeys) {
      const english = translate("en", key as never);
      const localized = translate(locale, key as never);
      expect({ key, placeholders: placeholders(localized) }).toEqual({ key, placeholders: placeholders(english) });
    }
  });

  it("never uses dots inside a key segment (they would break path lookup)", () => {
    const segments = (node: unknown): string[] =>
      typeof node === "string"
        ? []
        : Object.entries(node as Record<string, unknown>).flatMap(([key, value]) => [key, ...segments(value)]);
    for (const locale of UI_LOCALES) {
      expect(segments(MESSAGES[locale]).filter((key) => key.includes("."))).toEqual([]);
    }
  });

  it("has no empty translations", () => {
    for (const locale of UI_LOCALES) {
      for (const key of englishKeys) {
        expect(translate(locale, key as never).trim(), `${locale}:${key}`).not.toBe("");
      }
    }
  });
});

describe("translate", () => {
  it("returns the localized string with values interpolated", () => {
    expect(translate("fr", "nav.home")).toBe("Accueil");
    expect(translate("he", "nav.home")).toBe("בית");
    expect(translate("es", "seo.characterCount", { count: 12, max: 60 })).toBe("12 / 60 caracteres");
  });

  it("translates the Arabic and Hebrew pledge checkout and error states", () => {
    expect(translate("ar", "pledge.submit", { amount: "10 XLM" })).toContain("10 XLM");
    expect(translate("he", "pledge.backToCampaign")).toBe("חזרה לקמפיין");
    expect(translate("he", "errors.genericTitle")).toBe("משהו השתבש");
    expect(translate("ar", "campaign.progress.valuetext", {
      percentage: 40,
      raised: 400,
      goal: 1000,
      currency: "XLM",
    })).toContain("40");
  });

  it("falls back to the key for unknown paths", () => {
    expect(translate("ar", "nav.missing" as never)).toBe("nav.missing");
  });

  it("leaves unknown placeholders untouched", () => {
    expect(interpolate("{a} and {b}", { a: 1 })).toBe("1 and {b}");
  });
});
