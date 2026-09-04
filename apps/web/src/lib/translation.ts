export const SUPPORTED_TRANSLATION_LOCALES = [
  "en",
  "es",
  "fr",
  "de",
  "pt",
  "ja",
  "ko",
  "zh",
] as const;

export function detectLanguage(text: string): string {
  const normalized = (text ?? "").trim();
  if (!normalized) return "en";

  if (/[\u3040-\u30ff\u4e00-\u9fff\u3400-\u4dbf]/.test(normalized)) {
    return /[\u4e00-\u9fff]/.test(normalized) ? "zh" : "ja";
  }
  if (/[\uac00-\ud7af\ud55c]/.test(normalized)) return "ko";
  if (/[áéíóúüñ¿¡àèìòùç]/i.test(normalized)) return "es";
  if (/[àâçéèêëîïôûùüœæ]/i.test(normalized)) return "fr";
  if (/[äöüß]/i.test(normalized)) return "de";
  if (/[ãõáéíóúç]/i.test(normalized)) return "pt";

  return "en";
}

export function autoTranslate(
  text: string,
  locales: readonly string[] = SUPPORTED_TRANSLATION_LOCALES,
): Record<string, string> {
  const normalized = (text ?? "").trim();
  if (!normalized) return {};

  return locales.reduce<Record<string, string>>((result, locale) => {
    result[locale] = normalized;
    return result;
  }, {});
}
