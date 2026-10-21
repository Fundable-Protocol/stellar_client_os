"use client";

import { LanguageSwitcher } from "@/components/molecules/LanguageSwitcher";
import { useTranslation } from "@/i18n/I18nProvider";

export default function LanguageSettingsPage() {
  const { t, dir } = useTranslation();

  return (
    <main className="pb-8 md:pb-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <header>
          <h1 className="text-2xl font-semibold">{t("settings.language.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("settings.language.description")}</p>
        </header>
        <LanguageSwitcher variant="full" />
        {dir === "rtl" && (
          <p className="text-xs text-zinc-400">{t("settings.language.rtlNotice")}</p>
        )}
      </div>
    </main>
  );
}
