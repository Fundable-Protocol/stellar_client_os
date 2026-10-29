"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/translate";

const SECTIONS: { href: string; label: MessageKey }[] = [
  { href: "/settings/language", label: "settings.language.nav" },
  { href: "/settings/notifications", label: "settings.notifications.nav" },
  { href: "/settings/webhooks", label: "settings.webhooks.nav" },
];

export function SettingsNav() {
  const pathname = usePathname();
  const { t } = useTranslation();

  return (
    <nav aria-label={t("settings.sections")} className="mx-auto mb-6 flex max-w-2xl gap-2 overflow-x-auto">
      {SECTIONS.map(({ href, label }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "whitespace-nowrap rounded-full border px-4 py-1.5 text-sm transition-colors",
              active
                ? "border-purple-500 bg-purple-950/40 text-white"
                : "border-zinc-700 text-zinc-400 hover:text-white",
            )}
          >
            {t(label)}
          </Link>
        );
      })}
    </nav>
  );
}
