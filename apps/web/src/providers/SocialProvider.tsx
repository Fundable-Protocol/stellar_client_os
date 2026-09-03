"use client";

import React, { createContext, useContext, useEffect } from "react";
import { socialService } from "@/services/social.service";
import { useWallet } from "@/providers/StellarWalletProvider";
import { PLANTER_CONTRACT_ID, SOROBAN_RPC_URL, NETWORK_PASSPHRASE } from "@/lib/constants";

interface SocialContextType {
  isInitialized: boolean;
}

const SocialContext = createContext<SocialContextType>({ isInitialized: false });

export const useSocial = () => useContext(SocialContext);

export function SocialProvider({ children }: { children: React.ReactNode }) {
  const { address, isConnected } = useWallet();

  // Initialization readiness is derived from wallet connectivity rather than
  // stored in state, so the effect only performs the external initialization
  // side effect (avoids a cascading render from setState inside the effect).
  const isInitialized = Boolean(isConnected && address && PLANTER_CONTRACT_ID);

  useEffect(() => {
    if (isInitialized) {
      try {
        socialService.initialize(PLANTER_CONTRACT_ID, NETWORK_PASSPHRASE, SOROBAN_RPC_URL);
      } catch {
        console.error("Failed to initialize SocialService");
      }
    }
  }, [isInitialized]);

  return (
    <SocialContext.Provider value={{ isInitialized }}>
      {children}
    </SocialContext.Provider>
  );
}
