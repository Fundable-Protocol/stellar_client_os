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
] as const;

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
}
