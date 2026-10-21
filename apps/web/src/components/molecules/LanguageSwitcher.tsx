"use client";

import { useId } from "react";
import { Languages } from "lucide-react";
import { cn } from "@/lib/utils";
import { UI_LOCALES, UI_LOCALE_LABELS, isUiLocale } from "@/i18n/config";
import { useTranslation } from "@/i18n/I18nProvider";

interface LanguageSwitcherProps {
  /** "compact" for the navbar, "full" for the settings page. */
  variant?: "compact" | "full";
  className?: string;
}

/** Language toggle used in the navbar and in user settings (#1202). */
export function LanguageSwitcher({ variant = "compact", className }: LanguageSwitcherProps) {
  const { locale, setLocale, t } = useTranslation();
  const selectId = useId();

  if (variant === "full") {
    return (
      <fieldset className={cn("space-y-2", className)}>
        <legend className="text-sm font-medium text-zinc-200">{t("language.select")}</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {UI_LOCALES.map((code) => (
            <label
              key={code}
              lang={code}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm transition-colors",
                code === locale
                  ? "border-purple-500 bg-purple-950/40 text-white"
                  : "border-zinc-700 text-zinc-300 hover:border-zinc-500",
              )}
            >
              <input
                type="radio"
                name="ui-locale"
                value={code}
                checked={code === locale}
                onChange={() => setLocale(code)}
                className="accent-purple-500"
              />
              <span>{UI_LOCALE_LABELS[code]}</span>
              <span className="ms-auto text-xs uppercase text-zinc-500">{code}</span>
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  return (
    <div className={cn("relative flex items-center", className)}>
      <label htmlFor={selectId} className="sr-only">
        {t("language.select")}
      </label>
      <Languages aria-hidden="true" className="pointer-events-none absolute start-2 size-4 text-white/70" />
      <select
        id={selectId}
        value={locale}
        onChange={(event) => {
          if (isUiLocale(event.target.value)) setLocale(event.target.value);
        }}
        className="h-9 appearance-none rounded-md border border-white/10 bg-black/40 ps-8 pe-3 text-xs font-semibold text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-fundable-purple-2"
      >
        {UI_LOCALES.map((code) => (
          <option key={code} value={code} lang={code} className="bg-zinc-900">
            {UI_LOCALE_LABELS[code]}
          </option>
        ))}
      </select>
    </div>
  );
}
