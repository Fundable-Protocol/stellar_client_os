"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
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
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (isConnected && address && PLANTER_CONTRACT_ID) {
      try {
        socialService.initialize(PLANTER_CONTRACT_ID, NETWORK_PASSPHRASE, SOROBAN_RPC_URL);
        setIsInitialized(true);
      } catch {
        console.error("Failed to initialize SocialService");
        setIsInitialized(false);
      }
    } else {
      setIsInitialized(false);
    }
  }, [isConnected, address]);

  return (
    <SocialContext.Provider value={{ isInitialized }}>
      {children}
    </SocialContext.Provider>
  );
}
