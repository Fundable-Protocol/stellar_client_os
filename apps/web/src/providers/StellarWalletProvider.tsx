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
import { AlertCircle, AlertTriangle, ArrowRightLeft } from "lucide-react";

import { safeGetItem, safeSetItem, safeRemoveItem, isStorageAvailable } from "@/utils/safe-storage";
import { isValidStellarAddress } from "@/utils/stellar-validation";

import { offrampService } from "@/services/offramp.service";
import { notify } from "@/utils/notification";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type WalletId = string;
export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnecting"
  | "locked";

/**
 * Maps each WalletNetwork enum value to its canonical Stellar network passphrase.
 * Used to detect mismatches between the wallet extension's active network and the
 * network the application is configured to target.
 */
export const NETWORK_PASSPHRASES: Record<WalletNetwork, string> = {
  [WalletNetwork.PUBLIC]: "Public Global Stellar Network ; September 2015",
  [WalletNetwork.TESTNET]: "Test SDF Network ; September 2015",
  [WalletNetwork.FUTURENET]: "Test SDF Future Network ; October 2022",
  [WalletNetwork.SANDBOX]: "Local Sandbox Stellar Network ; September 2015",
  [WalletNetwork.STANDALONE]: "Standalone Network ; February 2017",
};

/** Human-readable display names for each WalletNetwork value. */
const NETWORK_DISPLAY_NAMES: Record<WalletNetwork, string> = {
  [WalletNetwork.PUBLIC]: "Mainnet",
  [WalletNetwork.TESTNET]: "Testnet",
  [WalletNetwork.FUTURENET]: "Futurenet",
  [WalletNetwork.SANDBOX]: "Sandbox",
  [WalletNetwork.STANDALONE]: "Standalone",
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
  /** True when the connected wallet's network passphrase does not match the app's configured network. */
  networkMismatch: boolean;
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
    if (savedNetwork === WalletNetwork.TESTNET && savedAddress && isValidStellarAddress(savedAddress)) {
      return savedAddress;
    }
    return null;
  });
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(() => {
    if (typeof window === 'undefined') return "idle";
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
    if (typeof window === 'undefined') return null;
    const savedAddress = safeGetItem("stellar_wallet_address");
    const savedWalletId = safeGetItem("@fundable/web:selected_wallet");
    const savedNetwork = safeGetItem("stellar_wallet_network");
    console.log('Lazy init selectedWalletId:', { savedWalletId, savedNetwork });
    if (savedNetwork === WalletNetwork.TESTNET && savedAddress && isValidStellarAddress(savedAddress)) {
      return savedWalletId as WalletId | null;
    }
    return null;
  });
  const [network, setNetworkState] = useState<WalletNetwork>(WalletNetwork.TESTNET);
  const [kit, setKit] = useState<StellarWalletsKit | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPersistenceAvailable, setIsPersistenceAvailable] = useState(true);

  /**
   * Tracks whether the wallet extension's active network passphrase mismatches
   * the application's configured network. When true, the NetworkMismatchModal is shown.
   */
  const [networkMismatch, setNetworkMismatch] = useState(false);
  /**
   * Stores the network name reported by the wallet extension so the mismatch modal
   * can display an informative message ("Your wallet is on Mainnet, app needs Testnet").
   */
  const [walletNetworkName, setWalletNetworkName] = useState<string>("");

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
    const savedWalletId = safeGetItem("@fundable/web:selected_wallet");
    const savedNetwork = safeGetItem("stellar_wallet_network");

    if (savedAddress && savedWalletId && savedNetwork === network) {
      if (!isValidStellarAddress(savedAddress)) {
        // Tampered or invalid address — clear storage and force reconnect
        safeRemoveItem("stellar_wallet_address");
        safeRemoveItem("@fundable/web:selected_wallet");
        safeRemoveItem("stellar_wallet_network");
        setAddress(null);
        setSelectedWalletId(null);
        setConnectionStatus("idle");
        return;
      }
      walletKit.setWallet(savedWalletId);

      // Sync with backend on session restoration
      offrampService.syncWallet(savedAddress);
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
    setNetworkMismatch(false);
    setWalletNetworkName("");
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

  const WALLET_INSTALL_URL: Partial<Record<WalletId, string>> = {
    freighter: "https://freighter.app/",
    xbull: "https://xbull.app/",
    rabet: "https://rabet.io/",
    albedo: "https://albedo.link/",
    lobstr: "https://lobstr.co/",
    rango: "https://app.rango.exchange/",
  };

  /**
   * Checks whether the wallet extension's active network passphrase matches the
   * application's configured network.  Returns `true` when they match (safe to
   * proceed), `false` on a mismatch, and `true` when the wallet doesn't expose a
   * network API (fail-open so legacy wallets keep working).
   *
   * On a mismatch the function also updates `networkMismatch` and
   * `walletNetworkName` state so the blocking modal is displayed to the user.
   */
  const checkNetworkPassphrase = useCallback(
    async (walletKit: StellarWalletsKit): Promise<boolean> => {
      try {
        // Not all wallet adapters implement getNetwork(); guard against that.
        if (typeof walletKit.getNetwork !== "function") return true;

        const walletNetworkInfo = await walletKit.getNetwork();
        const walletPassphrase: string =
          typeof walletNetworkInfo === "string"
            ? walletNetworkInfo
            : (walletNetworkInfo as { networkPassphrase?: string; network?: string })
                ?.networkPassphrase ??
              (walletNetworkInfo as { networkPassphrase?: string; network?: string })
                ?.network ??
              "";

        const expectedPassphrase = NETWORK_PASSPHRASES[network];

        if (!walletPassphrase || walletPassphrase === expectedPassphrase) {
          // Passphrase matches or wallet didn't provide one — safe to proceed.
          return true;
        }

        // Determine the human-readable name of the wallet's network for the modal.
        const detectedNetworkEntry = Object.entries(NETWORK_PASSPHRASES).find(
          ([, passphrase]) => passphrase === walletPassphrase,
        );
        const detectedNetworkName = detectedNetworkEntry
          ? NETWORK_DISPLAY_NAMES[detectedNetworkEntry[0] as WalletNetwork]
          : `Unknown (${walletPassphrase.slice(0, 30)}…)`;

        setWalletNetworkName(detectedNetworkName);
        setNetworkMismatch(true);
        return false;
      } catch {
        // If the check itself throws (e.g. wallet doesn't support getNetwork),
        // fail-open so we don't block existing wallets.
        return true;
      }
    },
    [network],
  );

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

      // ── Network passphrase mismatch check ─────────────────────────────────
      // Verify that the wallet extension is connected to the same Stellar network
      // that this application is configured to target.  A mismatch means the user
      // would end up signing transactions intended for Testnet contracts with a
      // Mainnet wallet (or vice versa), which produces invalid / rejected txs.
      const passphraseOk = await checkNetworkPassphrase(kit);
      if (!passphraseOk) {
        // The modal is now visible.  Reset connecting state and bail out — the
        // user must switch networks in their wallet extension and reconnect.
        setConnectionStatus("idle");
        return;
      }
      // ──────────────────────────────────────────────────────────────────────

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
  }, [kit, network, checkNetworkPassphrase]);

  const signTransaction = useCallback(
    async (xdr: string) => {
      if (!kit || !address) throw new Error("Wallet not connected");

      // ── Network passphrase mismatch check ─────────────────────────────────
      // Re-verify before every signing attempt: the user could have switched
      // networks in their wallet extension after the initial connection.
      const passphraseOk = await checkNetworkPassphrase(kit);
      if (!passphraseOk) {
        throw new Error(
          `Network mismatch: your wallet is on ${walletNetworkName} but this app targets ` +
          `${NETWORK_DISPLAY_NAMES[network]}. Please switch your wallet to ` +
          `${NETWORK_DISPLAY_NAMES[network]} and try again.`,
        );
      }
      // ──────────────────────────────────────────────────────────────────────
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
    [kit, address, network, walletNetworkName, checkNetworkPassphrase],
  );

  const openModal = useCallback(() => setIsModalOpen(true), []);
  const closeModal = useCallback(() => setIsModalOpen(false), []);

  /** Dismiss the mismatch modal without disconnecting. */
  const dismissMismatchModal = useCallback(() => {
    setNetworkMismatch(false);
    setWalletNetworkName("");
  }, []);

  /**
   * Switch the app's configured network to match the wallet's network.
   * This calls `setNetwork` which disconnects first, then re-initialises the kit.
   */
  const switchAppNetwork = useCallback(async () => {
    // Find the WalletNetwork enum value whose display name matches walletNetworkName
    const targetEntry = Object.entries(NETWORK_DISPLAY_NAMES).find(
      ([, displayName]) => displayName === walletNetworkName,
    );
    setNetworkMismatch(false);
    setWalletNetworkName("");
    if (targetEntry) {
      await setNetwork(targetEntry[0] as WalletNetwork);
    }
  }, [walletNetworkName, setNetwork]);

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
        networkMismatch,
      }}
    >
      {children}

      {/* ── Network mismatch modal ──────────────────────────────────────── */}
      <Dialog open={networkMismatch} onOpenChange={(open) => !open && dismissMismatchModal()}>
        <DialogContent
          className="max-w-md border-yellow-500/20 bg-[#0F1621]"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-yellow-500/10 shrink-0">
                <AlertTriangle className="w-5 h-5 text-yellow-400" aria-hidden="true" />
              </div>
              <DialogTitle className="text-yellow-100">Network Mismatch Detected</DialogTitle>
            </div>
            <DialogDescription className="text-zinc-400 leading-relaxed">
              Your wallet is connected to{" "}
              <span className="font-semibold text-yellow-300">{walletNetworkName}</span>, but this
              app is configured for{" "}
              <span className="font-semibold text-white">
                {NETWORK_DISPLAY_NAMES[network]}
              </span>
              .
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-xl bg-yellow-500/5 border border-yellow-500/10 p-4 text-sm text-zinc-400 leading-relaxed">
            Submitting a transaction signed on the wrong network will cause it to be rejected by
            Stellar validators. Please switch your wallet extension to{" "}
            <span className="font-semibold text-white">{NETWORK_DISPLAY_NAMES[network]}</span>{" "}
            before proceeding, or switch the app network to match your wallet.
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={dismissMismatchModal}
              className="border-white/10 bg-white/5 text-white hover:bg-white/10"
            >
              Dismiss
            </Button>
            <Button
              onClick={switchAppNetwork}
              className="gap-2 bg-yellow-500 text-black hover:bg-yellow-400 font-semibold"
            >
              <ArrowRightLeft className="w-4 h-4" aria-hidden="true" />
              Switch App to {walletNetworkName}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* ────────────────────────────────────────────────────────────────── */}

      {!isPersistenceAvailable && (
        <div className="fixed bottom-4 right-4 z-50 px-3 py-2 bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 text-xs rounded-md shadow-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          <span>Private browsing mode: Wallet connection will not be saved.</span>
        </div>
      )}
    </WalletContext.Provider>
  );
};
