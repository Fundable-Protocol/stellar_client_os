"use client";

import React, { type ReactNode } from "react";
import { Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWallet } from "@/providers/StellarWalletProvider";

interface WalletConnectionGuardProps {
  children: ReactNode;
  contextLabel?: string;
}

export function WalletConnectionGuard({
  children,
  contextLabel,
}: WalletConnectionGuardProps) {
  const { isConnected, openModal } = useWallet();

  if (!isConnected) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4 py-10">
        <div className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-white/10 bg-fundable-mid-dark p-10 text-center shadow-[0_0_40px_rgba(130,86,255,0.12)]">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-fundable-purple-2/10" />
          <div className="relative z-10 space-y-6">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/5">
              <Wallet className="h-7 w-7 text-fundable-purple-2" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold text-white">
                Connect your wallet to continue
              </h2>
              <p className="text-fundable-light-grey">
                {contextLabel || "You'll need a Stellar wallet connected to use this feature."}
              </p>
            </div>
            <Button variant="gradient" size="lg" onClick={openModal}>
              Connect Wallet
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export default WalletConnectionGuard;
