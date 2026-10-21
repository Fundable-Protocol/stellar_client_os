import { DEFAULT_UI_LOCALE, type UiLocale } from "./config";
import en from "./messages/en.json";
import fr from "./messages/fr.json";
import es from "./messages/es.json";
import pt from "./messages/pt.json";
import ar from "./messages/ar.json";

/** English is the source of truth for the message catalogue shape. */
export type Messages = typeof en;

type Join<P extends string, K extends string> = P extends "" ? K : `${P}.${K}`;

/** Every dotted path in the catalogue that resolves to a string, e.g. "nav.home". */
type LeafPaths<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? Join<P, K> : LeafPaths<T[K], Join<P, K>>;
}[keyof T & string];

export type MessageKey = LeafPaths<Messages>;

export type TranslationValues = Record<string, string | number>;

export type TranslateFn = (key: MessageKey, values?: TranslationValues) => string;

export const MESSAGES: Record<UiLocale, Messages> = { en, fr, es, pt, ar };

function lookup(catalogue: unknown, key: string): string | undefined {
  let node: unknown = catalogue;
  for (const segment of key.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[segment];
  }
  return typeof node === "string" ? node : undefined;
}

/** Replace `{name}` placeholders. Unknown placeholders are left intact. */
export function interpolate(template: string, values?: TranslationValues): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match,
  );
}

/**
 * Translate a key for a locale. Missing translations fall back to English,
 * then to the key itself, so an incomplete catalogue never renders blank UI.
 */
export function translate(locale: UiLocale, key: MessageKey, values?: TranslationValues): string {
  const template =
    lookup(MESSAGES[locale], key) ?? lookup(MESSAGES[DEFAULT_UI_LOCALE], key) ?? key;
  return interpolate(template, values);
}

export function createTranslator(locale: UiLocale): TranslateFn {
  return (key, values) => translate(locale, key, values);
}
