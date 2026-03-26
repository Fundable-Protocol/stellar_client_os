"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, useEffect } from "react";
import { LogOut } from "lucide-react";
import { useWallet } from "@/providers/StellarWalletProvider";

const ArrowDownIcon = ({
  className = "text-white/70",
}: {
  className?: string;
}) => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`w-5 h-5 ${className}`}
  >
    <path
      d="M18.7504 8.24993V17.9999C18.7504 18.1988 18.6714 18.3896 18.5307 18.5303C18.3901 18.6709 18.1993 18.7499 18.0004 18.7499H8.25042C8.0515 18.7499 7.86074 18.6709 7.72009 18.5303C7.57943 18.3896 7.50042 18.1988 7.50042 17.9999C7.50042 17.801 7.57943 17.6103 7.72009 17.4696C7.86074 17.3289 8.0515 17.2499 8.25042 17.2499H16.1901L5.46979 6.53055C5.32906 6.38982 5.25 6.19895 5.25 5.99993C5.25 5.80091 5.32906 5.61003 5.46979 5.4693C5.61052 5.32857 5.80139 5.24951 6.00042 5.24951C6.19944 5.24951 6.39031 5.32857 6.53104 5.4693L17.2504 16.1896V8.24993C17.2504 8.05102 17.3294 7.86025 17.4701 7.7196C17.6107 7.57895 17.8015 7.49993 18.0004 7.49993C18.1993 7.49993 18.3901 7.57895 18.5307 7.7196C18.6714 7.86025 18.7504 8.05102 18.7504 8.24993Z"
      fill="currentColor"
    />
  </svg>
);

export function ConnectButton() {
  const { isConnected, address, openModal, disconnect } = useWallet();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const formatAddress = (addr: string) => {
    if (!addr) return "";
    return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
  };

  const handleDisconnect = async () => {
    try {
      await disconnect();
      setDropdownOpen(false);
    } catch (error) {
      console.error("Disconnect failed:", error);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (isConnected && address) {
    return (
      <div className="relative" ref={dropdownRef}>
        <motion.button
          type="button"
          aria-expanded={dropdownOpen}
          aria-haspopup="menu"
          aria-label={`Wallet connected: ${formatAddress(address)}. Click to open wallet menu`}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="flex items-center gap-3 px-6 py-3 rounded-2xl bg-[#0F1621] border border-white/10 hover:border-white/30 transition-all group shadow-lg"
        >
          <div className="w-2 h-2 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.5)]" />
          <span className="text-white font-bold tracking-wide text-sm">
            {formatAddress(address)}
          </span>
          <div
            className={`transition-transform duration-300 ${dropdownOpen ? "rotate-180" : ""
              }`}
          >
            <ArrowDownIcon />
          </div>
        </motion.button>

        <AnimatePresence>
          {dropdownOpen && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 5, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="absolute top-full right-0 mt-3 w-48 bg-[#0F1621]/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 p-2"
              role="menu"
              aria-label="Wallet options"
            >
              <button
                type="button"
                role="menuitem"
                aria-label="Disconnect wallet"
                onClick={handleDisconnect}
                className="flex items-center gap-3 w-full px-4 py-3 text-red-400 hover:bg-red-500/10 rounded-xl transition-all text-sm font-bold"
              >
                <LogOut className="w-4 h-4" />
                Disconnect
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <motion.button
      type="button"
      aria-label="Connect your Stellar wallet"
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={openModal}
      className="group relative flex items-center"
    >
      <div className="flex items-center gap-4 px-8 py-3 rounded-2xl bg-white border border-white/20 hover:shadow-[0_0_20px_rgba(255,255,255,0.2)] transition-all text-[#0F1621] font-bold tracking-wider shadow-xl">
        <span>CONNECT WALLET</span>
        <div className="group-hover:translate-x-1 transition-transform">
          <ArrowDownIcon className="text-[#0F1621]/70" />
        </div>
      </div>
    </motion.button>
  );
}
