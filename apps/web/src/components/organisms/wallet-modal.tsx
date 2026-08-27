"use client";
import { motion } from "framer-motion";
import { Wallet, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Loader2 } from "lucide-react";
import React from "react";
import { useWallet, WalletId } from "@/providers/StellarWalletProvider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

// Inline SVG wallet icons — no external image files required
const WalletIcons: Record<string, React.FC<{ className?: string }>> = {
  freighter: ({ className }) => (
    <svg className={className} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="40" height="40" rx="10" fill="#5E35B1" />
      <path d="M10 14h20M10 20h14M10 26h8" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  ),
  albedo: ({ className }) => (
    <svg className={className} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="40" height="40" rx="10" fill="#1565C0" />
      <circle cx="20" cy="20" r="9" stroke="white" strokeWidth="2.5" />
      <circle cx="20" cy="20" r="4" fill="white" />
    </svg>
  ),
  rango: ({ className }) => (
    <svg className={className} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="40" height="40" rx="10" fill="#E91E63" />
      <path d="M12 28L20 12L28 28" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 23h10" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  ),
  xbull: ({ className }) => (
    <svg className={className} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="40" height="40" rx="10" fill="#00897B" />
      <path d="M13 13l14 14M27 13L13 27" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  ),
  rabet: ({ className }) => (
    <svg className={className} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="40" height="40" rx="10" fill="#F57C00" />
      <path d="M12 20c0-4.4 3.6-8 8-8s8 3.6 8 8-3.6 8-8 8" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="20" cy="20" r="3" fill="white" />
    </svg>
  ),
  lobstr: ({ className }) => (
    <svg className={className} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="40" height="40" rx="10" fill="#1A237E" />
      <path d="M20 11v18M13 14.5l7-3.5 7 3.5M13 20l7 3.5 7-3.5M13 25.5l7 3.5 7-3.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

const DefaultWalletIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect width="40" height="40" rx="10" fill="#37474F" />
    <rect x="10" y="14" width="20" height="14" rx="2" stroke="white" strokeWidth="2" />
    <path d="M10 19h20" stroke="white" strokeWidth="2" />
    <circle cx="25" cy="22.5" r="1.5" fill="white" />
  </svg>
);

export function WalletModal() {
  const {
    isModalOpen,
    closeModal,
    supportedWallets,
    connect,
    isConnecting,
    isConnected,
  } = useWallet();

  const [activeSelection, setActiveSelection] = React.useState<WalletId | null>(null);

  // Auto-close when connected
  React.useEffect(() => {
    if (isConnected && isModalOpen) closeModal();
  }, [isConnected, isModalOpen, closeModal]);

  // Reset selection when modal opens
  React.useEffect(() => {
    if (isModalOpen) setActiveSelection(null);
  }, [isModalOpen]);

  const handleConnectClick = async () => {
    if (activeSelection) {
      if (document.body.dataset.formDirty === 'true') {
        if (!window.confirm("You have unsaved changes. Are you sure you want to switch wallets? All form inputs will be lost.")) {
          return;
        }
      }

      if (activeSelection && !isConnecting) {
        await connect(activeSelection);
      }
    }
  };

  // Radix restores focus to whichever element opened the dialog. After a
  // successful connect that trigger unmounts (ConnectButton swaps to its
  // connected state), so the default restore targets a detached node and focus
  // falls back to <body> — the keyboard user is dropped outside the app's tab
  // order. Redirect to whichever wallet trigger is currently mounted instead.
  const handleCloseAutoFocus = React.useCallback((event: Event) => {
    const walletTrigger = document.querySelector<HTMLElement>(
      "[data-wallet-trigger]",
    );
    if (walletTrigger) {
      event.preventDefault();
      walletTrigger.focus();
    }
  }, []);
  const handleKeyDown = (e: React.KeyboardEvent, walletId: WalletId) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setActiveSelection(walletId);
    }
  };

  return (
    <Dialog open={isModalOpen} onOpenChange={(open) => !open && closeModal()}>
      <DialogContent
        onCloseAutoFocus={handleCloseAutoFocus}
        className="max-w-md p-1 overflow-hidden border-white/10 bg-[#0F1621] rounded-3xl shadow-2xl"
      >
        {/* Glossy overlay effect */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-linear-to-br from-white/5 to-transparent pointer-events-none"
        />
        className="w-full max-w-sm sm:max-w-md p-1 overflow-hidden border-white/10 bg-[#0F1621] rounded-3xl shadow-2xl mx-4 sm:mx-auto"
        aria-modal="true"
      >
        {/* Glossy overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none rounded-3xl" />

        <div className="relative bg-[#0F1621] rounded-[22px] p-5 sm:p-8 flex flex-col">
          {/* Header */}
          <DialogHeader className="mb-6 sm:mb-8">
            <DialogTitle className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Connect Wallet
            </DialogTitle>
            <DialogDescription className="mt-1 text-[#92A5A8] text-sm">
              Select your preferred Stellar wallet to get started
            </DialogDescription>
          </DialogHeader>

          {/* Wallet list */}
          <div
            role="radiogroup"
            aria-label="Choose a wallet"
            className="flex flex-col gap-2 sm:gap-3 mb-6 sm:mb-8"
          >
            {supportedWallets.map((wallet) => {
              const isSelected = activeSelection === wallet.id;
              const Icon = WalletIcons[wallet.id] ?? DefaultWalletIcon;

              return (
                <button
                  key={wallet.id}
                  type="button"
                  aria-pressed={isSelected}
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setActiveSelection(wallet.id)}
                  onKeyDown={(e) => handleKeyDown(e, wallet.id)}
                  disabled={isConnecting}
                  data-testid={`wallet-option-${wallet.id}`}
                  className={`group relative flex items-center gap-3 sm:gap-4 w-full p-3 sm:p-4 rounded-2xl transition-all duration-200 border outline-none
                    focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0F1621]
                    disabled:opacity-50 disabled:cursor-not-allowed
                    ${isSelected
                      ? "bg-white/10 border-white/30 shadow-[0_0_20px_rgba(255,255,255,0.05)]"
                      : "bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/15 active:scale-[0.99]"
                    }`}
                >
                  {/* Radio indicator */}
                  <div
                    className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
                      isSelected ? "border-white bg-white" : "border-white/25 bg-transparent"
                    }`}
                    aria-hidden="true"
                  >
                    {isSelected && <Check className="w-3 h-3 text-[#0F1621]" strokeWidth={3.5} />}
                  </div>

                  {/* Wallet icon */}
                  <div
                    className={`shrink-0 rounded-xl transition-opacity duration-200 ${isSelected ? "opacity-100" : "opacity-70 group-hover:opacity-90"}`}
                    aria-hidden="true"
                  >
                    <Icon className="w-8 h-8 sm:w-9 sm:h-9" />
                  </div>

                  {/* Wallet name */}
                  <span
                    className={`font-semibold text-sm tracking-wide ${
                      isSelected ? "text-white" : "text-[#92A5A8] group-hover:text-white/80"
                    }`}
                  >
                    {wallet.name}
                  </span>

                  {/* Subtle hover glow */}
                  <div
                    className="absolute inset-0 rounded-2xl bg-white/0 group-hover:bg-white/[0.03] transition-colors pointer-events-none"
                    aria-hidden="true"
                  />
                </button>
              );
            })}
          </div>

          {/* Connect button */}
          <button
            type="button"
            onClick={handleConnectClick}
            disabled={!activeSelection || isConnecting}
            aria-disabled={!activeSelection || isConnecting}
            data-testid="connect-now-button"
            className={`relative w-full py-3.5 sm:py-4 rounded-2xl font-bold text-sm tracking-widest uppercase transition-all duration-200 flex items-center justify-center gap-3 overflow-hidden
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0F1621]
              ${activeSelection && !isConnecting
                ? "bg-white text-[#0F1621] hover:scale-[1.02] active:scale-[0.98] shadow-lg cursor-pointer"
                : "bg-white/5 text-white/20 cursor-not-allowed"
              }`}
          >
            <AnimatePresence mode="wait" initial={false}>
              {isConnecting ? (
                <motion.span
                  key="loading"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="flex items-center gap-2"
                >
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  <span>Connecting…</span>
                </motion.span>
              ) : (
                <motion.span
                  key="idle"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="flex items-center gap-2"
                >
                  <span>Connect Now</span>
                  <Check className="w-4 h-4" aria-hidden="true" />
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
