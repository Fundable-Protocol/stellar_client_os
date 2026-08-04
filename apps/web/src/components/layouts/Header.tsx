"use client";

import { Bell, Menu, X } from "lucide-react";

export interface HeaderProps {
  title: string;
  isMenuOpen?: boolean;
  onMenuToggle?: () => void;
  onNotificationsClick?: () => void;
}

/**
 * Shared page header controls.
 *
 * Icons are imported by name so the client bundle only includes the icons this
 * component renders.
 */
export function Header({
  title,
  isMenuOpen = false,
  onMenuToggle,
  onNotificationsClick,
}: HeaderProps) {
  const MenuIcon = isMenuOpen ? X : Menu;

  return (
    <header className="flex items-center justify-between border-b border-b-fundable-mid-dark px-3 py-3 text-white md:px-5">
      <div className="flex items-center gap-x-2">
        {onMenuToggle && (
          <button
            type="button"
            onClick={onMenuToggle}
            aria-label={isMenuOpen ? "Close navigation menu" : "Open navigation menu"}
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

      {onNotificationsClick && (
        <button
          type="button"
          onClick={onNotificationsClick}
          aria-label="View notifications"
          className="inline-grid size-12 place-content-center rounded-full bg-fundable-mid-dark hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-fundable-purple-2"
        >
          <Bell aria-hidden="true" className="size-5" />
        </button>
      )}
    </header>
  );
}
