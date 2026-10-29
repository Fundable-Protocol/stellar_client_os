"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type ThemePreference } from "@/providers/ThemeProvider";
import { useTranslation } from "@/i18n/I18nProvider";

const THEME_OPTIONS: { value: ThemePreference; labelKey: "theme.system" | "theme.light" | "theme.dark"; icon: typeof Monitor }[] = [
  { value: "system", labelKey: "theme.system", icon: Monitor },
  { value: "light", labelKey: "theme.light", icon: Sun },
  { value: "dark", labelKey: "theme.dark", icon: Moon },
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation();
  const SelectedIcon = THEME_OPTIONS.find((option) => option.value === theme)?.icon ?? Monitor;

  return (
    <label className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground">
      <SelectedIcon className="size-4 shrink-0" aria-hidden="true" />
      <span className="sr-only">{t("theme.label")}</span>
      <select
        aria-label={t("theme.label")}
        value={theme}
        onChange={(event) => {
          const value = event.target.value;
          if (value === "system" || value === "light" || value === "dark") {
            setTheme(value);
          }
        }}
        className="w-14 cursor-pointer bg-transparent text-foreground outline-none sm:w-auto sm:max-w-20"
      >
        {THEME_OPTIONS.map(({ value, labelKey }) => (
          <option key={value} value={value}>
            {t(labelKey)}
          </option>
        ))}
      </select>
    </label>
  );
}
