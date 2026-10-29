"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  DEFAULT_UI_LOCALE,
  getTextDirection,
  UI_LOCALE_COOKIE,
  type TextDirection,
  type UiLocale,
} from "./config";
import { createTranslator, type TranslateFn } from "./translate";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

interface I18nContextValue {
  locale: UiLocale;
  dir: TextDirection;
  setLocale: (locale: UiLocale) => void;
  t: TranslateFn;
  /** Locale-aware number formatting for amounts and percentages. */
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function applyDocumentLocale(locale: UiLocale) {
  const root = document.documentElement;
  root.lang = locale;
  root.dir = getTextDirection(locale);
}

/**
 * Supplies the active UI locale to client components (#1202).
 *
 * `initialLocale` comes from the locale cookie read in the root layout, so the
 * server render and first client render agree and there is no flash of the
 * wrong language or direction.
 */
export function I18nProvider({
  initialLocale = DEFAULT_UI_LOCALE,
  children,
}: {
  initialLocale?: UiLocale;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<UiLocale>(initialLocale);

  useEffect(() => {
    applyDocumentLocale(locale);
  }, [locale]);

  // The cookie is the single source of truth: the root layout reads it on the
  // server, so the choice also applies to the next server render.
  const setLocale = useCallback((next: UiLocale) => {
    setLocaleState(next);
    document.cookie = `${UI_LOCALE_COOKIE}=${next}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
  }, []);

  const value = useMemo<I18nContextValue>(() => {
    const numberLocale = locale === "ar" ? "ar-EG" : locale;
    return {
      locale,
      dir: getTextDirection(locale),
      setLocale,
      t: createTranslator(locale),
      formatNumber: (n, options) => new Intl.NumberFormat(numberLocale, options).format(n),
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

const fallbackValue: I18nContextValue = {
  locale: DEFAULT_UI_LOCALE,
  dir: "ltr",
  setLocale: () => {},
  t: createTranslator(DEFAULT_UI_LOCALE),
  formatNumber: (n, options) => new Intl.NumberFormat(DEFAULT_UI_LOCALE, options).format(n),
};

/**
 * Access translations. Outside a provider (isolated component tests,
 * Storybook) it falls back to English instead of throwing.
 */
export function useTranslation(): I18nContextValue {
  return useContext(I18nContext) ?? fallbackValue;
}
