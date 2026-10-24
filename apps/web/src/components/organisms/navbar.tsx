"use client";

import Link from "next/link";
import { ConnectButton } from "./connect-button";
import { NetworkSwitcher } from "./network-switcher";
import { LanguageSwitcher } from "@/components/molecules/LanguageSwitcher";
import { useTranslation } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/translate";
import { ThemeToggle } from "@/components/ui/theme-toggle";

const NAV_LINKS: { href: string; label: MessageKey }[] = [
  { href: "/balances", label: "nav.balances" },
  { href: "/social", label: "nav.social" },
  { href: "/grants", label: "nav.grants" },
  { href: "#", label: "nav.howItWorks" },
  { href: "#", label: "nav.faqs" },
  { href: "#", label: "nav.contact" },
];

export function Navbar() {
  const { t } = useTranslation();

  return (
    <nav aria-label={t("nav.mainNavigation")} className="fixed top-0 left-0 right-0 z-40 bg-background/90 text-foreground backdrop-blur-md border-b border-border">
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        <div className="hidden md:flex items-center gap-8 text-xs font-bold tracking-widest text-muted-foreground">
          <Link href="/" className="flex items-center gap-2 group">
            {t("nav.brand")}
          </Link>

          {/* Desktop Nav */}

          <Link
            href="/"
            aria-current="page"
            className="text-foreground transition-colors uppercase border-b-2 border-primary pb-1"
          >
            {t("nav.home")}
          </Link>
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={label}
              href={href}
              className="hover:text-foreground transition-colors uppercase pb-1 border-b-2 border-transparent hover:border-border"
            >
              {t(label)}
            </Link>
          ))}
        </div>

        {/* Action Area */}
        <div className="flex items-center gap-4">
          <ThemeToggle />
          <LanguageSwitcher />
          <NetworkSwitcher />
          <ConnectButton />
        </div>
      </div>
    </nav>
  );
}
