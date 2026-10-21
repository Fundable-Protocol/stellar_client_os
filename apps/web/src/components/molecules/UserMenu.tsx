"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Copy, LogOut, Check } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

interface UserMenuProps {
  /** Fully resolved wallet address */
  address: string;
  /** Formatted (truncated) address string for display */
  formattedAddress: string;
  /** Whether the dropdown is currently open */
  isOpen: boolean;
  /** Called when the user clicks "Disconnect" */
  onDisconnect: () => void;
}

/**
 * Dropdown menu shown when a wallet is connected.
 * Lines 30-45 handle the copy-address action with toast feedback.
 */
export function UserMenu({
  address,
  formattedAddress,
  isOpen,
  onDisconnect,
}: UserMenuProps) {
  const [copied, setCopied] = useState(false);

  // ── Copy address (lines 30-45) ────────────────────────────────────────────
  const handleCopyAddress = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      toast.success("Address copied to clipboard");
      // Reset the icon back to Copy after 2 s
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy address");
    }
  };
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 5, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.95 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="absolute top-full right-0 mt-3 w-56 bg-[#0F1621]/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 p-2"
          role="menu"
          aria-label="Wallet options"
        >
          {/* Truncated address label */}
          <div className="px-4 py-2 text-xs text-white/40 font-mono tracking-wide select-none">
            {formattedAddress}
          </div>

          <div className="border-t border-white/10 my-1" />

          {/* Copy address */}
          <button
            type="button"
            role="menuitem"
            aria-label="Copy wallet address to clipboard"
            onClick={handleCopyAddress}
            className="flex items-center gap-3 w-full px-4 py-3 text-white/80 hover:bg-white/10 rounded-xl transition-all text-sm font-bold"
          >
            {copied ? (
              <Check className="w-4 h-4 text-green-400" aria-hidden="true" />
            ) : (
              <Copy className="w-4 h-4" aria-hidden="true" />
            )}
            {copied ? "Copied!" : "Copy Address"}
          </button>

          {/* Disconnect */}
          <button
            type="button"
            role="menuitem"
            aria-label="Disconnect wallet"
            onClick={onDisconnect}
            className="flex items-center gap-3 w-full px-4 py-3 text-red-400 hover:bg-red-500/10 rounded-xl transition-all text-sm font-bold"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
            Disconnect
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
