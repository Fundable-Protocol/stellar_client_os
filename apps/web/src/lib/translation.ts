import type { CampaignRecord } from "@/services/campaign.service";

/** Languages accepted by the campaign translation workflow (ISO 639-1 codes). */
export const SUPPORTED_TRANSLATION_LOCALES = [
  "en",
  "es",
  "fr",
  "de",
  "pt",
  "ja",
  "ko",
  "zh",
  "ar",
  "it",
  "ru",
  "nl",
  "pl",
  "tr",
  "vi",
  "th",
  "id",
  "hi",
  "bn",
  "fa",
  "sw",
  "uk",
  "ms",
  "ro",
  "el",
  "he",
  "ur",
  "en", "es", "fr", "de", "zh", "ja", "pt", "ar", "ko", "it", "nl",
  "ru", "hi", "bn", "id", "tr", "vi", "th", "pl", "uk", "fa", "sw",
] as const;

export type TranslationLocale = (typeof SUPPORTED_TRANSLATION_LOCALES)[number];

export interface CampaignLocalizedContent {
  /** Campaign name/title. `title` is accepted as an API alias for `name`. */
  name?: string;
  title?: string;
  description?: string;
  location?: string;
  treeSpecies?: string;
  region?: string;
}

const SUPPORTED_LOCALE_SET: ReadonlySet<string> = new Set(SUPPORTED_TRANSLATION_LOCALES);
const RTL_LOCALES: ReadonlySet<string> = new Set(["ar", "fa"]);

/** Normalize a BCP-47 language tag to a supported ISO 639-1 campaign locale. */
export function normalizeTranslationLocale(value: string): TranslationLocale | null {
  const normalized = value.trim().replaceAll("_", "-");
  if (!/^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/.test(normalized)) return null;
  const baseLanguage = normalized.split("-")[0].toLowerCase();
  return SUPPORTED_LOCALE_SET.has(baseLanguage) ? baseLanguage as TranslationLocale : null;
}

export function isSupportedTranslationLocale(value: string): boolean {
  return normalizeTranslationLocale(value) !== null;
}

export function isCampaignLocalizedContent(value: unknown): value is CampaignLocalizedContent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const allowedFields = new Set(["name", "title", "description", "location", "treeSpecies", "region"]);
  return Object.entries(value).every(([key, content]) =>
    allowedFields.has(key) && typeof content === "string" && content.trim().length > 0,
  );
}

export function validateLocalizedContentMap(value: unknown): value is Record<string, CampaignLocalizedContent> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value).every(([locale, content]) =>
    normalizeTranslationLocale(locale) !== null && isCampaignLocalizedContent(content),
  );
}

export function validateDescriptionTranslations(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value).every(([locale, text]) =>
    normalizeTranslationLocale(locale) !== null && typeof text === "string" && text.trim().length > 0,
  );
}

/**
 * Project stored campaign content into the requested locale. Translation
 * fields are supplied by campaign owners/translators; unavailable fields stay
 * in the source language instead of being machine-fabricated.
 */
export function localizeCampaign<T extends CampaignRecord>(campaign: T, requestedLanguage: string) {
  const language = normalizeTranslationLocale(requestedLanguage);
  if (!language) throw new Error(`Unsupported campaign language: ${requestedLanguage}`);

  const localized = Object.entries(campaign.localizedContent ?? {})
    .find(([locale]) => normalizeTranslationLocale(locale) === language)?.[1];
  const legacyDescription = Object.entries(campaign.translations ?? {})
    .find(([locale]) => normalizeTranslationLocale(locale) === language)?.[1];
  const sourceLanguage = normalizeTranslationLocale(campaign.language ?? "en") ?? "en";
  const available = localized !== undefined || legacyDescription !== undefined;
  const title = localized?.title ?? localized?.name;
  const localizedFields = {
    name: title ?? campaign.name,
    description: localized?.description ?? legacyDescription ?? campaign.description,
    location: localized?.location ?? campaign.location,
    treeSpecies: localized?.treeSpecies ?? campaign.treeSpecies,
    region: localized?.region ?? campaign.region,
  };
  const fallbackFields = language === sourceLanguage ? [] : (Object.keys(localizedFields) as Array<keyof typeof localizedFields>)
    .filter((field) => {
      const hasLocaleValue = field === "name"
        ? Boolean(title)
        : field === "description"
          ? Boolean(localized?.description ?? legacyDescription)
          : Boolean(localized?.[field]);
      return !hasLocaleValue && campaign[field] !== undefined;
    });

  return {
    ...campaign,
    ...localizedFields,
    localization: {
      requestedLanguage: language,
      resolvedLanguage: available ? language : sourceLanguage,
      isFallback: fallbackFields.length > 0,
      fallbackFields,
      direction: RTL_LOCALES.has(language) ? "rtl" as const : "ltr" as const,
    },
  };
}

/** Pick a supported locale from Accept-Language, otherwise leave default behavior unchanged. */
export function localeFromAcceptLanguage(header: string | null): TranslationLocale | null {
  if (!header) return null;
  const candidates = header.split(",").map((entry, index) => {
    const [tag, ...parameters] = entry.trim().split(";");
    const quality = parameters.map((parameter) => /^q=(0(?:\.\d+)?|1(?:\.0+)?)$/i.exec(parameter.trim()))
      .find(Boolean)?.[1];
    return { tag, quality: quality === undefined ? 1 : Number(quality), index };
  }).filter((candidate) => candidate.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);
  for (const candidate of candidates) {
    const locale = normalizeTranslationLocale(candidate.tag);
    if (locale) return locale;
  }
  return null;
}

export function detectLanguage(text: string): string {
  const normalized = (text ?? "").trim();
  if (!normalized) return "en";

  if (/[\u3040-\u30ff]/.test(normalized)) return "ja";
  if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(normalized)) return "zh";
  if (/[\uac00-\ud7af\ud55c]/.test(normalized)) return "ko";
  if (/[\u0600-\u06ff]/.test(normalized)) return "ar";
  if (/[\u0e00-\u0e7f]/.test(normalized)) return "th";
  if (/[\u0900-\u097f]/.test(normalized)) return "hi";
  if (/[\u0980-\u09ff]/.test(normalized)) return "bn";
  if (/[\u0400-\u04ff]/.test(normalized)) return /[іїєґ]/i.test(normalized) ? "uk" : "ru";
  if (/[áéíóúüñ¿¡àèìòùç]/i.test(normalized)) return "es";
  if (/[àâçéèêëîïôûùüœæ]/i.test(normalized)) return "fr";
  if (/[äöüß]/i.test(normalized)) return "de";
  if (/[ãõáéíóúç]/i.test(normalized)) return "pt";

  return "en";
}

export function isSupportedTranslationLocale(locale: string): boolean {
  return (SUPPORTED_TRANSLATION_LOCALES as readonly string[]).includes(locale);
}

export function hasOnlySupportedTranslationLocales(
  translations: unknown,
): translations is Record<string, string> {
  if (translations === null || typeof translations !== "object" || Array.isArray(translations)) {
    return false;
  }

  return Object.entries(translations).every(
    ([locale, value]) => isSupportedTranslationLocale(locale) && typeof value === "string",
  );
  // No translation provider is configured. Returning the source text under
  // every locale would falsely label untranslated copy as translated.
  void locales;
  return {};
}
