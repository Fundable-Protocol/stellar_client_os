/**
 * Tests for StellarWalletProvider – wallet state persistence and auto-reconnect.
 *
 * Strategy
 * --------
 * We mock @creit.tech/stellar-wallets-kit so every StellarWalletsKit instance
 * delegates getAddress / setWallet to controllable vi.fn() spies.
 * localStorage is replaced with a simple in-memory object so each test starts
 * with a clean slate without touching the real browser storage.
 */

import React from "react";
import { cleanup, renderHook, act, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Controllable spies – declared before vi.mock so they are captured by the
// factory closure (vitest hoists vi.mock to the top of the file).
// ---------------------------------------------------------------------------
const mockGetAddress = vi.fn();
const mockSetWallet = vi.fn();
const mockSignTransaction = vi.fn();

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@creit.tech/stellar-wallets-kit", () => {
  // Define the WalletNetwork enum inline so we don't trigger the real module's
  // transitive dependencies (some of which are broken in this test env).
  const WalletNetwork = {
    PUBLIC: "Public Global Stellar Network ; September 2015",
    TESTNET: "Test SDF Network ; September 2015",
    FUTURENET: "Test SDF Future Network ; October 2022",
    SANDBOX: "Local Sandbox Stellar Network ; September 2015",
    STANDALONE: "Standalone Network ; February 2017",
  } as const;

  return {
    WalletNetwork,
    StellarWalletsKit: vi.fn().mockImplementation(() => ({
      getAddress: mockGetAddress,
      setWallet: mockSetWallet,
      signTransaction: mockSignTransaction,
      disconnect: vi.fn().mockResolvedValue(undefined),
    })),
    allowAllModules: vi.fn().mockReturnValue([]),
  };
});

vi.mock("@/services/offramp.service", () => ({
  offrampService: { syncWallet: vi.fn() },
}));

// Mock react-hot-toast (pulled in by notification util)
vi.mock("react-hot-toast", () => ({ default: { error: vi.fn() } }));

// ---------------------------------------------------------------------------
// Static import of the provider (after mocks are registered)
// ---------------------------------------------------------------------------
import { StellarWalletProvider, useWallet } from "./StellarWalletProvider";

// ---------------------------------------------------------------------------
// Local WalletNetwork mirror (must match mock values)
// ---------------------------------------------------------------------------
const WalletNetwork = {
  PUBLIC: "Public Global Stellar Network ; September 2015",
  TESTNET: "Test SDF Network ; September 2015",
} as const;

// ---------------------------------------------------------------------------
// In-memory localStorage substitute
// ---------------------------------------------------------------------------
const store: Record<string, string> = {};

const localStorageMock: Storage = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
  clear: () => { Object.keys(store).forEach(k => delete store[k]); },
  key: (i: number) => Object.keys(store)[i] ?? null,
  get length() { return Object.keys(store).length; },
};

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------
const VALID_ADDRESS = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
const ALT_ADDRESS  = "GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGZBS8GQ4G2UWBCBA6PXKC";
const WALLET_ID   = "freighter";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function seedStorage(
  address = VALID_ADDRESS,
  walletId = WALLET_ID,
  network = WalletNetwork.TESTNET,
) {
  store["stellar_wallet_address"] = address;
  store["@fundable/web:selected_wallet"] = walletId;
  store["stellar_wallet_network"] = network;
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return <StellarWalletProvider>{children}</StellarWalletProvider>;
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
  localStorageMock.clear();

  Object.defineProperty(window, "localStorage", {
    value: localStorageMock,
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("StellarWalletProvider – wallet state persistence on refresh", () => {

  // ── Lazy state initialisers (lines 45-65) ────────────────────────────────

  describe("lazy state initializers", () => {
    it("restores address and walletId from localStorage when session is valid", async () => {
      seedStorage();
      mockGetAddress.mockResolvedValueOnce({ address: VALID_ADDRESS });

      const { result } = renderHook(() => useWallet(), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.connectionStatus).toBe("connected"));

      expect(result.current.address).toBe(VALID_ADDRESS);
      expect(result.current.selectedWalletId).toBe(WALLET_ID);
      expect(result.current.isConnected).toBe(true);
    });

    it("initializes with 'connecting' status while auto-reconnect is pending", () => {
      seedStorage();
      // Never resolves — keeps status in "connecting"
      mockGetAddress.mockReturnValue(new Promise(() => {}));

      const { result } = renderHook(() => useWallet(), { wrapper: Wrapper });

      expect(result.current.connectionStatus).toBe("connecting");
    });

    it("initializes as 'idle' with null address when localStorage is empty", async () => {
      // No storage entries
      const { result } = renderHook(() => useWallet(), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.connectionStatus).toBe("idle"));

      expect(result.current.address).toBeNull();
      expect(result.current.selectedWalletId).toBeNull();
    });

    it("restores the persisted network, not always TESTNET", async () => {
      seedStorage(VALID_ADDRESS, WALLET_ID, WalletNetwork.PUBLIC);
      mockGetAddress.mockResolvedValueOnce({ address: VALID_ADDRESS });

      const { result } = renderHook(() => useWallet(), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.connectionStatus).toBe("connected"));

      expect(result.current.network).toBe(WalletNetwork.PUBLIC);
    });

    it("ignores a stored address that fails Stellar address validation", async () => {
      store["stellar_wallet_address"] = "not-a-valid-stellar-address";
      store["@fundable/web:selected_wallet"] = WALLET_ID;
      store["stellar_wallet_network"] = WalletNetwork.TESTNET;

      const { result } = renderHook(() => useWallet(), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.connectionStatus).toBe("idle"));

      expect(result.current.address).toBeNull();
    });

    it("ignores a stored network value that is not a valid WalletNetwork", async () => {
      store["stellar_wallet_address"] = VALID_ADDRESS;
      store["@fundable/web:selected_wallet"] = WALLET_ID;
      store["stellar_wallet_network"] = "BOGUS_NETWORK";

      const { result } = renderHook(() => useWallet(), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.connectionStatus).toBe("idle"));

      expect(result.current.address).toBeNull();
    });
  });

  // ── Auto-reconnect on mount ───────────────────────────────────────────────

  describe("auto-reconnect on mount", () => {
    it("promotes to 'connected' when the wallet extension confirms the stored address", async () => {
      seedStorage();
      mockGetAddress.mockResolvedValueOnce({ address: VALID_ADDRESS });

      const { result } = renderHook(() => useWallet(), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.connectionStatus).toBe("connected"));

      expect(result.current.address).toBe(VALID_ADDRESS);
      expect(result.current.isConnected).toBe(true);
    });

    it("adopts a new address when the wallet reports a different account", async () => {
      seedStorage();
      mockGetAddress.mockResolvedValueOnce({ address: ALT_ADDRESS });

      const { result } = renderHook(() => useWallet(), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.connectionStatus).toBe("connected"));

      expect(result.current.address).toBe(ALT_ADDRESS);
      expect(store["stellar_wallet_address"]).toBe(ALT_ADDRESS);
    });

    it("resets to 'idle' and clears state when wallet extension rejects the request", async () => {
      seedStorage();
      mockGetAddress.mockRejectedValueOnce(new Error("Wallet not available"));

      const { result } = renderHook(() => useWallet(), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.connectionStatus).toBe("idle"));

      expect(result.current.address).toBeNull();
      expect(result.current.selectedWalletId).toBeNull();
      expect(result.current.isConnected).toBe(false);
    });

    it("removes stale localStorage keys when auto-reconnect fails", async () => {
      seedStorage();
      mockGetAddress.mockRejectedValueOnce(new Error("Extension removed"));

      renderHook(() => useWallet(), { wrapper: Wrapper });

      await waitFor(() => {
        expect(store["stellar_wallet_address"]).toBeUndefined();
      });

      expect(store["@fundable/web:selected_wallet"]).toBeUndefined();
      expect(store["stellar_wallet_network"]).toBeUndefined();
    });

    it("does not update state after the component unmounts (cancellation flag)", async () => {
      seedStorage();

      let resolveGetAddress!: (v: { address: string }) => void;
      mockGetAddress.mockReturnValueOnce(
        new Promise<{ address: string }>((resolve) => {
          resolveGetAddress = resolve;
        }),
      );

      const { result, unmount } = renderHook(() => useWallet(), { wrapper: Wrapper });

      // Status is "connecting" — the promise is still pending
      expect(result.current.connectionStatus).toBe("connecting");

      // Unmount before the promise resolves
      unmount();

      // Now resolve — the cancelled flag should prevent any setState call
      await act(async () => {
        resolveGetAddress({ address: VALID_ADDRESS });
        // Flush microtask queue
        await Promise.resolve();
      });

      // No React "state update on unmounted component" warning is thrown.
      // The rendered value was "connecting" at unmount time.
      expect(result.current.connectionStatus).toBe("connecting");
    });
  });

  // ── Disconnect ────────────────────────────────────────────────────────────

  describe("disconnect", () => {
    it("clears address, status, and all localStorage keys", async () => {
      seedStorage();
      mockGetAddress.mockResolvedValueOnce({ address: VALID_ADDRESS });

      const { result } = renderHook(() => useWallet(), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.connectionStatus).toBe("connected"));

      await act(async () => { await result.current.disconnect(); });

      expect(result.current.address).toBeNull();
      expect(result.current.isConnected).toBe(false);
      expect(result.current.connectionStatus).toBe("idle");
      expect(store["stellar_wallet_address"]).toBeUndefined();
      expect(store["@fundable/web:selected_wallet"]).toBeUndefined();
      expect(store["stellar_wallet_network"]).toBeUndefined();
    });
  });

  // ── connect() persists state ──────────────────────────────────────────────

  describe("connect", () => {
    it("persists address, walletId, and network to localStorage on success", async () => {
      // No prior session — provider starts idle
      mockGetAddress.mockResolvedValueOnce({ address: VALID_ADDRESS });

      const { result } = renderHook(() => useWallet(), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.connectionStatus).toBe("idle"));

      await act(async () => { await result.current.connect(WALLET_ID); });

      expect(result.current.address).toBe(VALID_ADDRESS);
      expect(result.current.isConnected).toBe(true);
      expect(store["stellar_wallet_address"]).toBe(VALID_ADDRESS);
      expect(store["@fundable/web:selected_wallet"]).toBe(WALLET_ID);
      expect(store["stellar_wallet_network"]).toBe(WalletNetwork.TESTNET);
    });
  });
});
