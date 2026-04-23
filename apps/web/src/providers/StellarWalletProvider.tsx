"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import {
  StellarWalletsKit,
  WalletNetwork,
  allowAllModules,
} from "@creit.tech/stellar-wallets-kit";
import { AlertCircle } from "lucide-react";

import { safeGetItem, safeSetItem, safeRemoveItem, isStorageAvailable } from "@/utils/safe-storage";

import { offrampService } from "@/services/offramp.service";
import { notify } from "@/utils/notification";

export type WalletId = string;
export type ConnectionStatus = "idle" | "connecting" | "connected" | "disconnecting";

interface WalletContextType {
  connect: (walletId: WalletId) => Promise<void>;
  disconnect: () => Promise<void>;
  address: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  connectionStatus: ConnectionStatus;
  selectedWalletId: string | null;
  network: WalletNetwork;
  setNetwork: (network: WalletNetwork) => Promise<void>;
  signTransaction: (xdr: string) => Promise<string>;
  openModal: () => void;
  closeModal: () => void;
  isModalOpen: boolean;
  supportedWallets: { id: WalletId; name: string; icon: string }[];
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used within a StellarWalletProvider");
  }
  return context;
};

export const StellarWalletProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [address, setAddress] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const savedAddress = safeGetItem("stellar_wallet_address");
    const savedNetwork = safeGetItem("stellar_wallet_network");
    console.log('Lazy init address:', { savedAddress, savedNetwork });
    if (savedNetwork === WalletNetwork.TESTNET) {
      return savedAddress;
    }
    return null;
  });
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(() => {
    if (typeof window === 'undefined') return "idle";
    const savedAddress = safeGetItem("stellar_wallet_address");
    const savedWalletId = safeGetItem("stellar_wallet_id");
    const savedNetwork = safeGetItem("stellar_wallet_network");
    console.log('Lazy init connectionStatus:', { savedAddress, savedWalletId, savedNetwork });
    if (savedAddress && savedWalletId && savedNetwork === WalletNetwork.TESTNET) {
      return "connected";
    }
    return "idle";
  });
  const [selectedWalletId, setSelectedWalletId] = useState<WalletId | null>(() => {
    if (typeof window === 'undefined') return null;
    const savedWalletId = safeGetItem("stellar_wallet_id");
    const savedNetwork = safeGetItem("stellar_wallet_network");
    console.log('Lazy init selectedWalletId:', { savedWalletId, savedNetwork });
    if (savedNetwork === WalletNetwork.TESTNET) {
      return savedWalletId as WalletId | null;
    }
    return null;
  });
  const [network, setNetworkState] = useState<WalletNetwork>(WalletNetwork.TESTNET);
  const [kit, setKit] = useState<StellarWalletsKit | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPersistenceAvailable, setIsPersistenceAvailable] = useState(true);

  // Holds the AbortController for the current in-flight connection attempt.
  // Aborting it signals connect() to discard any resolved address.
  const connectionAbortRef = useRef<AbortController | null>(null);

  // Initialize kit and handle persistence
  useEffect(() => {
    setIsPersistenceAvailable(isStorageAvailable());

    const walletKit = new StellarWalletsKit({
      network: network,
      modules: allowAllModules(),
    });
    setKit(walletKit);

    // RESTORE SESSION
    const savedAddress = safeGetItem("stellar_wallet_address");
    const savedWalletId = safeGetItem("stellar_wallet_id");
    const savedNetwork = safeGetItem("stellar_wallet_network");

    if (savedAddress && savedWalletId && savedNetwork === network) {
      walletKit.setWallet(savedWalletId);

      // Sync with backend on session restoration
      offrampService.syncWallet(savedAddress);
    }
  }, [network]);

  const disconnect = useCallback(async () => {
    // Abort any in-flight connection so its result is discarded
    if (connectionAbortRef.current) {
      connectionAbortRef.current.abort();
      connectionAbortRef.current = null;
    }

    setConnectionStatus("disconnecting");
    setAddress(null);
    setSelectedWalletId(null);
    safeRemoveItem("stellar_wallet_address");
    safeRemoveItem("stellar_wallet_id");
    safeRemoveItem("stellar_wallet_network");
    setConnectionStatus("idle");
  }, []);

  const setNetwork = useCallback(
    async (newNetwork: WalletNetwork) => {
      if (newNetwork === network) return;

      // Block network switch while a connection is in progress — abort it first
      if (connectionAbortRef.current) {
        connectionAbortRef.current.abort();
        connectionAbortRef.current = null;
      }

      // Fully await disconnect so state is clean before the network changes
      await disconnect();
      setNetworkState(newNetwork);
    },
    [network, disconnect],
  );

  const supportedWallets: { id: WalletId; name: string; icon: string }[] = [
    { id: "freighter", name: "Freighter", icon: "/icons/freighter.png" },
    { id: "albedo", name: "Albedo", icon: "/icons/albedo.png" },
    { id: "xbull", name: "xBull", icon: "/icons/xbull.png" },
    { id: "rabet", name: "Rabet", icon: "/icons/rabet.png" },
    { id: "lobstr", name: "Lobstr", icon: "/icons/lobstr.png" },
  ];

  const WALLET_INSTALL_URL: Partial<Record<WalletId, string>> = {
    freighter: "https://freighter.app/",
    xbull: "https://xbull.app/",
    rabet: "https://rabet.io/",
    albedo: "https://albedo.link/",
    lobstr: "https://lobstr.co/",
  };

  const connect = useCallback(async (walletId: WalletId) => {
    if (!kit) return;

    // Abort any previous in-flight attempt before starting a new one
    if (connectionAbortRef.current) {
      connectionAbortRef.current.abort();
    }

    const controller = new AbortController();
    connectionAbortRef.current = controller;
    const { signal } = controller;

    try {
      kit.setWallet(walletId);
      setConnectionStatus("connecting");
      setIsModalOpen(false);

      // Await the potentially long-running wallet handshake
      const response = await kit.getAddress();

      // If disconnect() or setNetwork() was called while we were awaiting,
      // the signal is aborted — discard this result entirely.
      if (signal.aborted) return;

      const { address: resolvedAddress } = response;

      if (!resolvedAddress) {
        throw new Error(
          "No address returned from wallet. Please ensure your wallet is unlocked and try again.",
        );
      }

      setAddress(resolvedAddress);
      setSelectedWalletId(walletId);
      setConnectionStatus("connected");
      safeSetItem("stellar_wallet_address", resolvedAddress);
      safeSetItem("stellar_wallet_id", walletId);
      safeSetItem("stellar_wallet_network", network);

      // Sync with backend on new connection
      offrampService.syncWallet(resolvedAddress);
    } catch (error: unknown) {
      // Don't surface errors for intentionally aborted connections
      if (signal.aborted) return;

      let errorMessage = "Unknown connection error";
      if (error instanceof Error) errorMessage = error.message;
      else if (typeof error === "string") errorMessage = error;
      else if (error && typeof error === "object" && "message" in error)
        errorMessage = String((error as { message: unknown }).message);

      if (errorMessage.toLowerCase().includes("not installed")) {
        const installHref = WALLET_INSTALL_URL[walletId];

        notify.error(
          <div className="flex flex-col gap-1">
            <span>{walletId} wallet extension is not detected.</span>
            {installHref ? (
              <a
                href={installHref}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-violet-400 hover:text-violet-300 transition-colors underline underline-offset-2"
              >
                Install / get wallet
              </a>
            ) : (
              <span className="text-xs text-white/70">
                Install the wallet extension (or enable it) and try again.
              </span>
            )}
          </div>,
        );
      } else if (
        errorMessage.toLowerCase().includes("user rejected") ||
        errorMessage.toLowerCase().includes("permission denied")
      ) {
        notify.error("Connection rejected by user");
      } else {
        // Show a generic but helpful error for other errors
        notify.error(`Failed to connect to ${walletId}: ${errorMessage}`);
      }

      setConnectionStatus("idle");
    } finally {
      // Only clear the ref if this controller is still the active one
      if (connectionAbortRef.current === controller) {
        connectionAbortRef.current = null;
      }
    }
  }, [kit, network]);

  const signTransaction = useCallback(
    async (xdr: string) => {
      if (!kit || !address) throw new Error("Wallet not connected");
      try {
        const { signedTxXdr } = await kit.signTransaction(xdr);
        return signedTxXdr;
      } catch (error) {
        throw error;
      }
    },
    [kit, address],
  );

  const openModal = useCallback(() => setIsModalOpen(true), []);
  const closeModal = useCallback(() => setIsModalOpen(false), []);

  return (
    <WalletContext.Provider
      value={{
        connect,
        disconnect,
        address,
        isConnected: connectionStatus === "connected",
        isConnecting: connectionStatus === "connecting",
        connectionStatus,
        selectedWalletId,
        network,
        setNetwork,
        signTransaction,
        openModal,
        closeModal,
        isModalOpen,
        supportedWallets,
      }}
    >
      {children}
      {!isPersistenceAvailable && (
        <div className="fixed bottom-4 right-4 z-50 px-3 py-2 bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 text-xs rounded-md shadow-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          <span>Private browsing mode: Wallet connection will not be saved.</span>
        </div>
      )}
    </WalletContext.Provider>
  );
};
