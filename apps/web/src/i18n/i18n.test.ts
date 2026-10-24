import { describe, expect, it } from "vitest";
import {
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
  it("supports English, French, Spanish, Portuguese and Arabic", () => {
    expect([...UI_LOCALES].sort()).toEqual(["ar", "en", "es", "fr", "pt"]);
  });

  it("marks only Arabic as right-to-left", () => {
    expect(getTextDirection("ar")).toBe("rtl");
    for (const locale of UI_LOCALES.filter((l) => l !== "ar")) {
      expect(getTextDirection(locale)).toBe("ltr");
    }
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
    expect(translate("es", "seo.characterCount", { count: 12, max: 60 })).toBe("12 / 60 caracteres");
  });

  it("falls back to the key for unknown paths", () => {
    expect(translate("ar", "nav.missing" as never)).toBe("nav.missing");
  });

  it("leaves unknown placeholders untouched", () => {
    expect(interpolate("{a} and {b}", { a: 1 })).toBe("1 and {b}");
  });
});
