'use client';

import { Bell, Menu, X, Loader2 } from 'lucide-react';
import { useWallet } from '@/providers/StellarWalletProvider';
import { HighContrastToggle } from '@/components/ui/high-contrast-toggle';
import { LanguageSwitcher } from '@/components/molecules/LanguageSwitcher';
import { useTranslation } from '@/i18n/I18nProvider';

export interface HeaderProps {
  title: string;
  isMenuOpen?: boolean;
  onMenuToggle?: () => void;
  onNotificationsClick?: () => void;
}

function WalletStatus() {
  const { isConnected, isConnecting, address } = useWallet();
  const { t } = useTranslation();

  if (isConnecting) {
    return (
      <div
        role="status"
        aria-label={t('header.connectingWallet')}
        className="flex items-center gap-2 text-sm text-white/60"
      >
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        <span>{t('header.connecting')}</span>
      </div>
    );
  }

  if (isConnected && address) {
    return (
      <div
        role="status"
        aria-label={t('header.walletConnected', { address: `${address.slice(0, 4)}…${address.slice(-4)}` })}
        className="flex items-center gap-2 text-sm"
      >
        <span
          className="inline-block h-2 w-2 rounded-full bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.6)]"
          aria-hidden="true"
        />
        <span className="text-green-400 font-medium">{t('header.connected')}</span>
      </div>
    );
  }

  return null;
}

export function Header({
  title,
  isMenuOpen = false,
  onMenuToggle,
  onNotificationsClick,
}: HeaderProps) {
  const MenuIcon = isMenuOpen ? X : Menu;
  const { t } = useTranslation();

  return (
    <header className="flex items-center justify-between border-b border-b-fundable-mid-dark px-3 py-3 text-white md:px-5">
      <div className="flex items-center gap-x-2">
        {onMenuToggle && (
          <button
            type="button"
            onClick={onMenuToggle}
            aria-label={isMenuOpen ? t('header.closeMenu') : t('header.openMenu')}
            aria-expanded={isMenuOpen}
            className="inline-grid size-10 place-content-center rounded-md hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-fundable-purple-2"
          >
            <MenuIcon aria-hidden="true" className="size-5" />
          </button>
        )}
        <h1 className="font-bricolage text-xl font-medium capitalize md:text-2xl">
          {title}
        </h1>
      </div>

      <div className="flex items-center gap-2">
        <WalletStatus />
        <LanguageSwitcher />
        <HighContrastToggle />
        {onNotificationsClick && (
          <button
            type="button"
            onClick={onNotificationsClick}
            aria-label={t('header.viewNotifications')}
            className="inline-grid size-12 place-content-center rounded-full bg-fundable-mid-dark hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-fundable-purple-2"
          >
            <Bell aria-hidden="true" className="size-5" />
          </button>
        )}
      </div>
    </header>
  );
}

export default Header;
