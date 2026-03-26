"use client";

import Link from "next/link";
import Image from "next/image";
import { ConnectButton } from "./connect-button";
import { NetworkSwitcher } from "./network-switcher";

export function Navbar() {
  return (
    <nav aria-label="Main navigation" className="fixed top-0 left-0 right-0 z-40 bg-black/50 backdrop-blur-md border-b border-white/10">
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        <div className="hidden md:flex items-center gap-8 text-xs font-bold tracking-widest text-[#92A5A8]">
          <Link href="/" className="flex items-center gap-2 group">
            Fundable
          </Link>

          {/* Desktop Nav */}

          <Link
            href="/"
            aria-current="page"
            className="text-white transition-colors uppercase border-b-2 border-white pb-1"
          >
            Home
          </Link>
          <Link
            href="/balances"
            className="hover:text-white transition-colors uppercase pb-1 border-b-2 border-transparent hover:border-white/50"
          >
            Balances
          </Link>
          <Link
            href="#"
            className="hover:text-white transition-colors uppercase pb-1 border-b-2 border-transparent hover:border-white/50"
          >
            How it works
          </Link>
          <Link
            href="#"
            className="hover:text-white transition-colors uppercase pb-1 border-b-2 border-transparent hover:border-white/50"
          >
            FAQs
          </Link>
          <Link
            href="#"
            className="hover:text-white transition-colors uppercase pb-1 border-b-2 border-transparent hover:border-white/50"
          >
            Contact
          </Link>
        </div>

        {/* Action Area */}
        <div className="flex items-center gap-4">
          <NetworkSwitcher />
          <ConnectButton />
        </div>
      </div>
    </nav>
  );
}
