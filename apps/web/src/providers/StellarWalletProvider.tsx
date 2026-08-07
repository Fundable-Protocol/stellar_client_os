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
import { isValidStellarAddress } from "@/utils/stellar-validation";

import { offrampService } from "@/services/offramp.service";
import { notify } from "@/utils/notification";
import { isLockedWalletError } from "@/utils/wallet-errors";

export type WalletId = string;
export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnecting"
  | "locked";

const WALLET_INSTALL_URL: Partial<Record<WalletId, string>> = {
  freighter: "https://freighter.app/",
  xbull: "https://xbull.app/",
  rabet: "https://rabet.io/",
  albedo: "https://albedo.link/",
  lobstr: "https://lobstr.co/",
  rango: "https://app.rango.exchange/",
};

interface WalletContextType {
  connect: (walletId: WalletId) => Promise<void>;
  disconnect: () => Promise<void>;
  address: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  isLocked: boolean;
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

/** Read all persisted wallet fields in one pass and validate them together. */
function loadPersistedSession(): {
  address: string | null;
  walletId: string | null;
  network: WalletNetwork | null;
} {
  if (typeof window === 'undefined') {
    return { address: null, walletId: null, network: null };
  }
  const savedAddress = safeGetItem("stellar_wallet_address");
  const savedWalletId = safeGetItem("@fundable/web:selected_wallet");
  const savedNetwork = safeGetItem("stellar_wallet_network") as WalletNetwork | null;

  if (
    savedAddress &&
    isValidStellarAddress(savedAddress) &&
    savedWalletId &&
    savedNetwork &&
    Object.values(WalletNetwork).includes(savedNetwork)
  ) {
    return { address: savedAddress, walletId: savedWalletId, network: savedNetwork };
  }
  return { address: null, walletId: null, network: null };
}

export const StellarWalletProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  // Restore the persisted session once at initialisation time.
  // All three pieces of state are derived from the same storage snapshot so
  // they are always consistent with one another.
  const [address, setAddress] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const savedAddress = safeGetItem("stellar_wallet_address")?.toUpperCase();
    const savedNetwork = safeGetItem("stellar_wallet_network");
    console.log('Lazy init address:', { savedAddress, savedNetwork });
    if (savedNetwork === WalletNetwork.TESTNET && savedAddress && isValidStellarAddress(savedAddress)) {
      return savedAddress;
    }
    return null;
    return loadPersistedSession().address;
  });
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(() => {
    const { address: savedAddress, walletId: savedWalletId, network: savedNetwork } = loadPersistedSession();
    // Start as "connecting" when we have a persisted session so the UI
    // correctly reflects the pending auto-reconnect verification.
    if (savedAddress && savedWalletId && savedNetwork) {
      return "connecting";
    if (typeof window === 'undefined') return "idle";
    const savedAddress = safeGetItem("stellar_wallet_address")?.toUpperCase();
    const savedWalletId = safeGetItem("stellar_wallet_id");
    const savedAddress = safeGetItem("stellar_wallet_address");
    const savedWalletId = safeGetItem("@fundable/web:selected_wallet");
    const savedNetwork = safeGetItem("stellar_wallet_network");
    console.log('Lazy init connectionStatus:', { savedAddress, savedWalletId, savedNetwork });
    if (savedAddress && isValidStellarAddress(savedAddress) && savedWalletId && savedNetwork === WalletNetwork.TESTNET) {
      return "connected";
    }
    return "idle";
  });
  const [selectedWalletId, setSelectedWalletId] = useState<WalletId | null>(() => {
    return loadPersistedSession().walletId;
  });
  const [network, setNetworkState] = useState<WalletNetwork>(() => {
    // Restore the network that was active when the user last connected so the
    // kit is initialised with the right network passphrase immediately.
    return loadPersistedSession().network ?? WalletNetwork.TESTNET;
    if (typeof window === 'undefined') return null;
    const savedAddress = safeGetItem("stellar_wallet_address")?.toUpperCase();
    const savedWalletId = safeGetItem("stellar_wallet_id");
    const savedAddress = safeGetItem("stellar_wallet_address");
    const savedWalletId = safeGetItem("@fundable/web:selected_wallet");
    const savedNetwork = safeGetItem("stellar_wallet_network");
    console.log('Lazy init selectedWalletId:', { savedWalletId, savedNetwork });
    if (savedNetwork === WalletNetwork.TESTNET && savedAddress && isValidStellarAddress(savedAddress)) {
      return savedWalletId as WalletId | null;
    }
    return null;
  });
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

    // RESTORE SESSION — attempt to re-verify the wallet extension is still
    // accessible. The lazy initialisers already set the "connecting" status and
    // restored address/walletId from storage so the UI can render immediately;
    // here we confirm the extension responds and either promote to "connected"
    // or clear stale state when it no longer does.
    const { address: savedAddress, walletId: savedWalletId, network: savedNetwork } = loadPersistedSession();
    // RESTORE SESSION
    const savedAddress = safeGetItem("stellar_wallet_address")?.toUpperCase();
    const savedWalletId = safeGetItem("stellar_wallet_id");
    const savedAddress = safeGetItem("stellar_wallet_address");
    const savedWalletId = safeGetItem("@fundable/web:selected_wallet");
    const savedNetwork = safeGetItem("stellar_wallet_network");

    if (savedAddress && savedWalletId && savedNetwork) {
      if (savedNetwork !== network) {
        // The user previously connected on a different network — do not restore.
        safeRemoveItem("stellar_wallet_address");
        safeRemoveItem("@fundable/web:selected_wallet");
        safeRemoveItem("stellar_wallet_network");
        setAddress(null);
        setSelectedWalletId(null);
        setConnectionStatus("idle");
        return;
      }

      walletKit.setWallet(savedWalletId);

      // AUTO-RECONNECT: verify the wallet extension is still unlocked.
      let cancelled = false;
      walletKit
        .getAddress()
        .then(({ address: liveAddress }) => {
          if (cancelled) return;
          if (liveAddress === savedAddress) {
            // Wallet confirmed — restore full session.
            setConnectionStatus("connected");
            offrampService.syncWallet(liveAddress);
          } else {
            // Address mismatch (user switched accounts) — update to the new one.
            setAddress(liveAddress);
            safeSetItem("stellar_wallet_address", liveAddress);
            setConnectionStatus("connected");
            offrampService.syncWallet(liveAddress);
          }
        })
        .catch(() => {
          if (cancelled) return;
          // Wallet is locked, removed, or rejected the request — clear stale state.
          safeRemoveItem("stellar_wallet_address");
          safeRemoveItem("@fundable/web:selected_wallet");
          safeRemoveItem("stellar_wallet_network");
          setAddress(null);
          setSelectedWalletId(null);
          setConnectionStatus("idle");
        });

      return () => {
        cancelled = true;
      };
    } else {
      // No valid persisted session — ensure status is idle.
      setConnectionStatus("idle");
    }

    // Cleanup: disconnect the kit when the component unmounts or network changes
    return () => {
      walletKit.disconnect().catch(() => {
        // Silently swallow disconnect errors during cleanup
      });
    };
  }, [network]);

  const disconnect = useCallback(async () => {
    // Abort any in-flight connection so its result is discarded
    if (connectionAbortRef.current) {
      connectionAbortRef.current.abort();
      connectionAbortRef.current = null;
    }

    // Clean up wallet kit event listeners (e.g. WalletConnect sessions,
    // module-level polling, etc.) before resetting state
    if (kit) {
      try {
        await kit.disconnect();
      } catch {
        // Silently swallow disconnect errors — state is cleared regardless
      }
    }

    setConnectionStatus("disconnecting");
    setAddress(null);
    setSelectedWalletId(null);
    safeRemoveItem("stellar_wallet_address");
    safeRemoveItem("@fundable/web:selected_wallet");
    safeRemoveItem("stellar_wallet_network");
    setConnectionStatus("idle");
  }, [kit]);

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
    { id: "rango", name: "Rango", icon: "/icons/rango.png" },
    { id: "xbull", name: "xBull", icon: "/icons/xbull.png" },
    { id: "rabet", name: "Rabet", icon: "/icons/rabet.png" },
    { id: "lobstr", name: "Lobstr", icon: "/icons/lobstr.png" },
  ];

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

      let timeoutId: ReturnType<typeof setTimeout>;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          controller.abort();
          reject(new Error("Connection attempt timed out after 30 seconds"));
        }, 30000);
      });

      // Await the potentially long-running wallet handshake
      const response = await Promise.race([
        kit.getAddress(),
        timeoutPromise
      ]);

      clearTimeout(timeoutId!);

      // If disconnect() or setNetwork() was called while we were awaiting,
      // the signal is aborted — discard this result entirely.
      if (signal.aborted) return;

      const { address: resolvedAddress } = response as { address: string };

      if (!resolvedAddress) {
        throw new Error(
          "No address returned from wallet. Please ensure your wallet is unlocked and try again.",
        );
      }

      setAddress(resolvedAddress);
      setSelectedWalletId(walletId);
      setConnectionStatus("connected");
      safeSetItem("stellar_wallet_address", resolvedAddress);
      safeSetItem("@fundable/web:selected_wallet", walletId);
      safeSetItem("stellar_wallet_network", network);

      // Sync with backend on new connection
      offrampService.syncWallet(resolvedAddress);
    } catch (error: unknown) {
      // Don't surface errors for intentionally aborted connections (except timeouts)
      if (signal.aborted && !(error instanceof Error && error.message.includes("timed out"))) return;

      let errorMessage = "Unknown connection error";
      if (error instanceof Error) errorMessage = error.message;
      else if (typeof error === "string") errorMessage = error;
      else if (error && typeof error === "object" && "message" in error)
        errorMessage = String((error as { message: unknown }).message);

      if (isLockedWalletError(error) || isLockedWalletError({ message: errorMessage })) {
        notify.error(
          "Your wallet extension is locked. Unlock it and try connecting again.",
        );
        setConnectionStatus("locked");
        return;
      }

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

      let timeoutId: ReturnType<typeof setTimeout>;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error("Sign transaction timed out after 60 seconds. Please unlock your wallet and try again."));
        }, 60000);
      });

      try {
        const { signedTxXdr } = await Promise.race([
          kit.signTransaction(xdr),
          timeoutPromise,
        ]);
        return signedTxXdr;
      } finally {
        clearTimeout(timeoutId!);
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
        isLocked: connectionStatus === "locked",
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
