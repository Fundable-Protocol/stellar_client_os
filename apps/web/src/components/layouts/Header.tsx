"use client";

import { Loader2 } from "lucide-react";
import { useWallet } from "@/providers/StellarWalletProvider";

/**
 * Header component for the dashboard layout.
 *
 * Displays wallet connection status in the top-right area:
 * - While the wallet is connecting (connectionStatus === "connecting"), shows a
 *   loading spinner so the user gets clear feedback that a connection is in progress.
 * - Only after both `isConnected` AND `address` are truthy does the green
 *   "Connected" badge appear. This prevents the badge from flashing prematurely
 *   during the brief window where `isConnected` may be true but `address` is still
 *   null (e.g. right after the wallet handshake resolves but before state propagates).
 * - When not connected and not connecting, nothing is rendered for the status area
 *   so it does not compete with the ConnectButton in the Navbar.
 *
 * Fix for: Header displays Connected badge while address is still null.
 * Lines 40–60: WalletStatus component — badge is gated on `isConnected && address`.
 */

function WalletStatus() {
  const { isConnected, isConnecting, address } = useWallet();

  // Show spinner while a wallet connection is in progress.
  // This covers the async gap between the user clicking "connect" and the
  // wallet extension returning an address.
  if (isConnecting) {
    return (
      <div
        role="status"
        aria-label="Connecting wallet…"
        className="flex items-center gap-2 text-sm text-white/60"
      >
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        <span>Connecting…</span>
      </div>
    );
  }

  // Only render the Connected badge when we have BOTH a confirmed connection
  // status AND a resolved non-null address. This is the key fix: previously the
  // badge could render while address was still null because isConnected flipped
  // to true before the address state update propagated.
  if (isConnected && address) {
    return (
      <div
        role="status"
        aria-label={`Wallet connected: ${address.slice(0, 4)}…${address.slice(-4)}`}
        className="flex items-center gap-2 text-sm"
      >
        <span
          className="inline-block h-2 w-2 rounded-full bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.6)]"
          aria-hidden="true"
        />
        <span className="text-green-400 font-medium">Connected</span>
      </div>
    );
  }

  // Not connected, not connecting — render nothing for this slot.
  return null;
}

export interface HeaderProps {
  /** Optional slot for additional actions (e.g. notifications, settings). */
  children?: React.ReactNode;
  /** Optional CSS class applied to the root <header> element. */
  className?: string;
}

/**
 * Application header. Renders the wallet connection status and an optional
 * actions slot. Designed to sit at the top of the dashboard shell.
 */
export function Header({ children, className }: HeaderProps) {
  return (
    <header
      className={`flex items-center justify-between px-6 py-4 border-b border-white/10 bg-black/30 backdrop-blur-sm ${className ?? ""}`}
    >
      {/* Left slot — page context or breadcrumb can be injected via children */}
      <div className="flex-1">{children}</div>

      {/* Right slot — wallet connection status */}
      <div className="flex items-center gap-4">
        <WalletStatus />
      </div>
    </header>
  );
}

export default Header;
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
