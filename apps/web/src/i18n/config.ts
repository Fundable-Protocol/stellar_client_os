/**
 * Platform UI localisation config (#1202).
 *
 * This is the set of languages the *interface* is translated into. It is
 * deliberately separate from `SUPPORTED_TRANSLATION_LOCALES` in
 * `lib/translation.ts`, which covers creator-supplied campaign copy.
 */
export const UI_LOCALES = ["en", "fr", "es", "pt", "ar", "he"] as const;

export type UiLocale = (typeof UI_LOCALES)[number];

export const DEFAULT_UI_LOCALE: UiLocale = "en";

/** Cookie read by the root layout so the first server render has the right lang/dir. */
export const UI_LOCALE_COOKIE = "fundable-locale";

export const RTL_UI_LOCALES: ReadonlySet<UiLocale> = new Set(["ar", "he"]);

/** Native-language names shown in the language picker. */
export const UI_LOCALE_LABELS: Record<UiLocale, string> = {
  en: "English",
  fr: "Français",
  es: "Español",
  pt: "Português",
  ar: "العربية",
  he: "עברית",
};

export type TextDirection = "ltr" | "rtl";

/**
 * Languages whose campaign copy is written right-to-left. Wider than the UI
 * locale set because creators can translate campaign content into any
 * supported campaign language.
 */
const RTL_LANGUAGE_CODES: ReadonlySet<string> = new Set(["ar", "fa", "he", "ur"]);

/** Resolve the text direction of a campaign content language. */
export function getLanguageDirection(language: string | null | undefined): TextDirection {
  if (!language) return "ltr";
  const base = language.trim().replaceAll("_", "-").split("-")[0].toLowerCase();
  return RTL_LANGUAGE_CODES.has(base) ? "rtl" : "ltr";
}

export function isUiLocale(value: unknown): value is UiLocale {
  return typeof value === "string" && (UI_LOCALES as readonly string[]).includes(value);
}

export function getTextDirection(locale: UiLocale): TextDirection {
  return RTL_UI_LOCALES.has(locale) ? "rtl" : "ltr";
}

/**
 * BCP-47 tag used for `Intl` number/date formatting. Arabic and Hebrew use
 * regional tags so numerals and separators match native expectations.
 */
export function uiIntlLocale(locale: UiLocale): string {
  return locale === "ar" ? "ar-EG" : locale === "he" ? "he-IL" : locale;
}

/**
 * Resolve a cookie value or BCP-47 tag ("pt-BR", "fr_CA") to a supported UI
 * locale, falling back to the default.
 */
export function resolveUiLocale(value: string | null | undefined): UiLocale {
  if (!value) return DEFAULT_UI_LOCALE;
  const base = value.trim().replaceAll("_", "-").split("-")[0].toLowerCase();
  return isUiLocale(base) ? base : DEFAULT_UI_LOCALE;
}

/** Pick the best UI locale from an Accept-Language header, honouring q-weights. */
export function uiLocaleFromAcceptLanguage(header: string | null | undefined): UiLocale {
  if (!header) return DEFAULT_UI_LOCALE;
  const ranked = header
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const weight = q ? Number(q.slice(2)) : 1;
      return { tag, weight: Number.isFinite(weight) ? weight : 0, index };
    })
    .filter((entry) => entry.tag && entry.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);

  for (const { tag } of ranked) {
    const base = tag.replaceAll("_", "-").split("-")[0].toLowerCase();
    if (isUiLocale(base)) return base;
  }
  return DEFAULT_UI_LOCALE;
}
