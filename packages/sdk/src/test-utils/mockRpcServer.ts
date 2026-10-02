/**
 * Mock RPC Server for SDK Unit Tests
 *
 * Provides a reusable, fully-typed mock of the Stellar Soroban RPC server so
 * unit tests never make real network calls. The mock covers every RPC method
 * used by the SDK and exposes convenience helpers for common test scenarios.
 *
 * ## Usage
 *
 * Import this file **once** in each test file that needs to intercept Soroban
 * RPC calls. The `vi.mock(...)` calls at the bottom of this module are hoisted
 * by Vitest and intercept both import paths used across the SDK:
 *
 *   - `@stellar/stellar-sdk/rpc`   – ContractDeployer, GasEstimator, soroban-transaction-helper
 *   - `@stellar/stellar-sdk`       – BalanceWatcher (uses `rpc.Server` sub-namespace)
 *
 * ```ts
 * // In your test file:
 * import { createMockRpcServer, resetMockRpcServer } from '../test-utils/mockRpcServer.js';
 *
 * const rpc = createMockRpcServer();
 *
 * beforeEach(() => resetMockRpcServer());
 *
 * it('succeeds on a happy-path simulation', async () => {
 *   rpc.scenarios.simulationSuccess();
 *   // ... exercise the code under test
 * });
 * ```
 *
 * ## Design notes
 *
 * - All mock functions are `vi.fn()` instances so callers can add per-test
 *   `.mockResolvedValueOnce(...)` overrides on top of scenario defaults.
 * - `resetMockRpcServer()` calls `mockReset()` on every vi.fn(), clearing both
 *   call history and any registered return values so tests start clean.
 * - The `Api` namespace mirrors the real SDK shape so code that calls
 *   `Api.isSimulationError(r)` or inspects `Api.GetTransactionStatus` works
 *   unchanged.
 */

import { vi } from 'vitest';

// ---------------------------------------------------------------------------
// Type helpers — these mirror the relevant parts of the real Stellar SDK API
// without importing the SDK itself (which would create a circular dependency
// with the mocked module).
// ---------------------------------------------------------------------------

/** Minimal shape of a successful simulation response. */
export interface MockSimulationSuccess {
  minResourceFee: string;
  transactionData?: string | object;
  result?: { retval?: unknown };
  results?: unknown[];
}

/** Minimal shape of a failed simulation response. */
export interface MockSimulationError {
  error: string;
}

/** Minimal shape of a successful getTransaction response. */
export interface MockGetTransactionSuccess {
  status: 'SUCCESS';
  ledger: number;
  resultXdr?: string;
  feeCharged?: string;
}

/** Minimal shape of a failed getTransaction response. */
export interface MockGetTransactionFailed {
  status: 'FAILED';
  ledger: number;
  resultXdr?: string;
}

/** Minimal shape of a pending / not-found getTransaction response. */
export interface MockGetTransactionPending {
  status: 'PENDING' | 'NOT_FOUND';
}

export type MockGetTransactionResponse =
  | MockGetTransactionSuccess
  | MockGetTransactionFailed
  | MockGetTransactionPending;

/** Minimal shape of a sendTransaction response. */
export interface MockSendTransactionResponse {
  status: 'PENDING' | 'ERROR' | 'DUPLICATE' | 'TRY_AGAIN_LATER';
  hash: string;
  errorResult?: { toXDR: (fmt: string) => string } | null;
}

/** Minimal shape of a getAccount / AccountRecord response. */
export interface MockAccount {
  id: string;
  sequenceNumber: () => string;
}

/** Minimal shape of a getNetwork response. */
export interface MockNetworkInfo {
  passphrase: string;
  protocolVersion?: string;
}

/** Minimal shape of a getLatestLedger response. */
export interface MockLatestLedger {
  id: string;
  sequence: number | string;
  protocolVersion: string;
}

/** Minimal shape of a getLedger response. */
export interface MockLedgerInfo {
  baseFeeInStroops?: string | number;
  sequence?: number | string;
}

/** Minimal shape of a getFeeStats response. */
export interface MockFeeStats {
  inclusionFee?: {
    p50?: string | number;
    p90?: string | number;
    p95?: string | number;
    p99?: string | number;
    transactionCount?: string | number;
  };
  sorobanInclusionFee?: {
    p50?: string | number;
    p90?: string | number;
    p95?: string | number;
    p99?: string | number;
    transactionCount?: string | number;
  };
}

/** Minimal shape of a getEvents response. */
export interface MockGetEventsResponse {
  events: Array<{
    pagingToken: string;
    topic: unknown[];
    value: unknown;
    contractId?: string;
    id?: string;
    ledger?: number;
    type?: string;
  }>;
  latestLedger: number;
}

// ---------------------------------------------------------------------------
// Default fixture values
// ---------------------------------------------------------------------------

/** Default passphrase for Stellar testnet. */
export const DEFAULT_NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';

/** A plausible testnet RPC URL used in fixture data. */
export const DEFAULT_RPC_URL = 'https://soroban-testnet.stellar.org';

/** A valid G-address usable as a default deployer / sender. */
export const DEFAULT_ADDRESS = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

/** A default mock account object. */
export const DEFAULT_MOCK_ACCOUNT: MockAccount = {
  id: DEFAULT_ADDRESS,
  sequenceNumber: () => '100',
};

/** Default simulation success response with a 1 000-stroop resource fee. */
export const DEFAULT_SIMULATION_SUCCESS: MockSimulationSuccess = {
  minResourceFee: '1000',
  transactionData: 'AAAAAQAAAAA=',
  result: { retval: undefined },
  results: [],
};

/** Default getTransaction success response. */
export const DEFAULT_TX_SUCCESS: MockGetTransactionSuccess = {
  status: 'SUCCESS',
  ledger: 12345,
  feeCharged: '200',
};

/** Default sendTransaction response (accepted, waiting to be included). */
export const DEFAULT_SEND_TX_RESPONSE: MockSendTransactionResponse = {
  status: 'PENDING',
  hash: 'mocktxhash1234567890abcdef',
};

/** Default network info. */
export const DEFAULT_NETWORK_INFO: MockNetworkInfo = {
  passphrase: DEFAULT_NETWORK_PASSPHRASE,
  protocolVersion: '21',
};

/** Default latest ledger response. */
export const DEFAULT_LATEST_LEDGER: MockLatestLedger = {
  id: 'ledger-id-0',
  sequence: 100,
  protocolVersion: '21',
};

/** Default fee stats — low-congestion baseline. */
export const DEFAULT_FEE_STATS: MockFeeStats = {
  inclusionFee: {
    p50: '100',
    p90: '120',
    p95: '140',
    p99: '200',
    transactionCount: '5',
  },
};

// ---------------------------------------------------------------------------
// Core mock object
// ---------------------------------------------------------------------------

/**
 * The single shared mock RPC server instance used across all tests in a file.
 * Individual vi.fn() mocks can be overridden per-test; call `resetMockRpcServer()`
 * in beforeEach to restore a clean state.
 */
const mock = {
  // ── Core RPC methods ────────────────────────────────────────────────────
  /** Fetch account details (sequence number, balances, etc.). */
  getAccount: vi.fn<(...args: [string]) => Promise<MockAccount>>(),

  /** Simulate a Soroban transaction to get fee/resource estimates. */
  simulateTransaction: vi.fn<
    (...args: [unknown]) => Promise<MockSimulationSuccess | MockSimulationError>
  >(),

  /** Submit a signed transaction to the network. */
  sendTransaction: vi.fn<(...args: [unknown]) => Promise<MockSendTransactionResponse>>(),

  /** Poll for the result of a submitted transaction. */
  getTransaction: vi.fn<(...args: [string]) => Promise<MockGetTransactionResponse>>(),

  /** Retrieve the network passphrase and protocol version. */
  getNetwork: vi.fn<() => Promise<MockNetworkInfo>>(),

  /** Fetch the latest closed ledger metadata. */
  getLatestLedger: vi.fn<() => Promise<MockLatestLedger>>(),

  /** Fetch metadata for a specific ledger by sequence number. */
  getLedger: vi.fn<(...args: [{ sequence: number }]) => Promise<MockLedgerInfo>>(),

  /** Fetch fee statistics from recent ledgers. */
  getFeeStats: vi.fn<() => Promise<MockFeeStats>>(),

  /** Fetch contract events with optional filters and pagination. */
  getEvents: vi.fn<(...args: [unknown]) => Promise<MockGetEventsResponse>>(),

  // ── Scenario helpers ────────────────────────────────────────────────────
  /**
   * Pre-configured scenario helpers that wire up the most common test
   * situations in a single call. Each helper can be further customised with
   * per-test `.mockResolvedValueOnce(...)` additions on individual mock fns.
   */
  scenarios: {
    /**
     * Standard happy-path: account loads, simulation succeeds, transaction
     * is sent and confirmed successfully in a single poll.
     */
    success(overrides?: {
      account?: MockAccount;
      simulation?: MockSimulationSuccess;
      sendTx?: Partial<MockSendTransactionResponse>;
      getTx?: MockGetTransactionSuccess;
    }): void {
      mock.getAccount.mockResolvedValue(overrides?.account ?? DEFAULT_MOCK_ACCOUNT);
      mock.simulateTransaction.mockResolvedValue(
        overrides?.simulation ?? DEFAULT_SIMULATION_SUCCESS,
      );
      mock.sendTransaction.mockResolvedValue({
        ...DEFAULT_SEND_TX_RESPONSE,
        ...overrides?.sendTx,
      });
      mock.getTransaction.mockResolvedValue(overrides?.getTx ?? DEFAULT_TX_SUCCESS);
      mock.getNetwork.mockResolvedValue(DEFAULT_NETWORK_INFO);
      mock.getLatestLedger.mockResolvedValue(DEFAULT_LATEST_LEDGER);
      mock.getFeeStats.mockResolvedValue(DEFAULT_FEE_STATS);
      mock.getEvents.mockResolvedValue({ events: [], latestLedger: 100 });
    },

    /**
     * Transaction enters a PENDING state on the first poll, then succeeds
     * on the second poll. Useful for testing polling logic.
     */
    pendingThenSuccess(opts?: { ledger?: number }): void {
      mock.scenarios.success();
      mock.getTransaction
        .mockReset()
        .mockResolvedValueOnce({ status: 'PENDING' } satisfies MockGetTransactionPending)
        .mockResolvedValueOnce({
          status: 'SUCCESS',
          ledger: opts?.ledger ?? 123,
          feeCharged: '200',
        } satisfies MockGetTransactionSuccess);
    },

    /**
     * Transaction is NOT_FOUND on the first poll (not yet propagated), then
     * succeeds. Exercises the "not found" retry path in waitForTransaction.
     */
    notFoundThenSuccess(opts?: { ledger?: number }): void {
      mock.scenarios.success();
      mock.getTransaction
        .mockReset()
        .mockResolvedValueOnce({ status: 'NOT_FOUND' } satisfies MockGetTransactionPending)
        .mockResolvedValueOnce({
          status: 'SUCCESS',
          ledger: opts?.ledger ?? 456,
          feeCharged: '200',
        } satisfies MockGetTransactionSuccess);
    },

    /**
     * Transaction reaches FAILED status on chain.
     */
    transactionFailed(opts?: { ledger?: number }): void {
      mock.scenarios.success();
      mock.getTransaction.mockReset().mockResolvedValue({
        status: 'FAILED',
        ledger: opts?.ledger ?? 123,
      } satisfies MockGetTransactionFailed);
    },

    /**
     * Simulation returns a contract/host error response (not a thrown exception).
     * Matches what `Api.isSimulationError()` returns `true` for.
     */
    simulationError(errorMessage = 'HostError: Value error'): void {
      mock.simulateTransaction.mockResolvedValue({
        error: errorMessage,
      } satisfies MockSimulationError);
    },

    /**
     * Simulation throws a network-level exception (e.g. ECONNREFUSED).
     * Different from a simulation *error response* — this is a thrown Error.
     */
    simulationNetworkError(message = 'Network error: connection refused'): void {
      mock.simulateTransaction.mockRejectedValue(new Error(message));
    },

    /**
     * sendTransaction returns an ERROR status (transaction rejected at submission).
     */
    sendTransactionError(errorXdr = 'AAAAAAAAAGT////7AAAAAA=='): void {
      mock.scenarios.success();
      mock.sendTransaction.mockReset().mockResolvedValue({
        status: 'ERROR',
        hash: '',
        errorResult: { toXDR: () => errorXdr },
      } satisfies MockSendTransactionResponse);
    },

    /**
     * getAccount throws — simulates a funded-account-not-found scenario.
     */
    accountNotFound(address = DEFAULT_ADDRESS): void {
      mock.getAccount.mockRejectedValue(
        new Error(`Account not found: ${address}`),
      );
    },

    /**
     * getNetwork throws — simulates an RPC connectivity issue during
     * network passphrase auto-detection.
     */
    networkError(message = 'getNetwork failed: connection refused'): void {
      mock.getNetwork.mockRejectedValue(new Error(message));
    },

    /**
     * High-congestion fee stats — p95 is well above base fee thresholds,
     * causing GasEstimator to choose a higher buffer multiplier.
     */
    highCongestionFeeStats(): void {
      mock.getFeeStats.mockResolvedValue({
        inclusionFee: {
          p50: '200',
          p90: '450',
          p95: '700',
          p99: '1200',
          transactionCount: '520',
        },
      } satisfies MockFeeStats);
    },

    /**
     * getEvents returns a list of raw contract events. Consumers filter by
     * stream ID / contract ID themselves, so raw events are passed through.
     *
     * @param events - Raw event objects to return.
     * @param latestLedger - Latest closed ledger (default: 1000).
     */
    contractEvents(
      events: MockGetEventsResponse['events'],
      latestLedger = 1000,
    ): void {
      mock.getEvents.mockResolvedValue({ events, latestLedger });
    },

    /**
     * getEvents throws — simulates an RPC failure during event fetching.
     */
    getEventsError(message = 'getEvents RPC error'): void {
      mock.getEvents.mockRejectedValue(new Error(message));
    },
  },
} as const;

export type MockRpcServer = typeof mock;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the shared mock RPC server instance.
 *
 * The returned object exposes all mock functions directly so tests can add
 * per-test overrides, e.g.:
 *
 * ```ts
 * const rpc = createMockRpcServer();
 * rpc.getTransaction.mockResolvedValueOnce({ status: 'PENDING' });
 * ```
 */
export function createMockRpcServer(): MockRpcServer {
  return mock;
}

/**
 * Resets all mock functions — clears call history **and** registered return
 * values. Call this in `beforeEach` to guarantee test isolation.
 *
 * ```ts
 * beforeEach(() => resetMockRpcServer());
 * ```
 */
export function resetMockRpcServer(): void {
  (Object.values(mock) as unknown[]).forEach((value) => {
    if (typeof value === 'function') {
      const fn = value as { mockReset?: () => void };
      if (typeof fn.mockReset === 'function') {
        fn.mockReset();
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Module-level vi.mock() calls
//
// Vitest hoists vi.mock() to the top of the compiled test file, so importing
// this module is enough to intercept all RPC calls — no manual setup needed.
//
// Two paths are mocked:
//  1. `@stellar/stellar-sdk/rpc`  — used by ContractDeployer, GasEstimator,
//     soroban-transaction-helper, and transactions.ts.
//  2. `@stellar/stellar-sdk`      — used by BalanceWatcher (rpc.Server) and
//     streamHistory (StellarSdk.rpc.Server).
// ---------------------------------------------------------------------------

/**
 * Mock for `@stellar/stellar-sdk/rpc`.
 *
 * Covers imports of the form:
 *   import { Server, Api } from '@stellar/stellar-sdk/rpc';
 */
vi.mock('@stellar/stellar-sdk/rpc', () => ({
  Server: vi.fn(() => mock),
  Api: {
    /**
     * Returns true when the simulation response has a top-level `error` field.
     * Mirrors the real SDK behaviour.
     */
    isSimulationError: (r: Record<string, unknown>): boolean =>
      r !== null && typeof r === 'object' && r['error'] !== undefined,

    /**
     * Returns true when the simulation response does NOT have a top-level
     * `error` field. Mirrors the real SDK behaviour.
     */
    isSimulationSuccess: (r: Record<string, unknown>): boolean =>
      r !== null && typeof r === 'object' && r['error'] === undefined,

    /** GetTransactionStatus enum values used throughout the SDK. */
    GetTransactionStatus: {
      NOT_FOUND: 'NOT_FOUND',
      PENDING: 'PENDING',
      SUCCESS: 'SUCCESS',
      FAILED: 'FAILED',
    } as const,
  },
}));

/**
 * Mock for `@stellar/stellar-sdk` (the umbrella package).
 *
 * Only the `rpc` sub-namespace is replaced here;
 * everything else (`Keypair`, `Networks`, `xdr`, `Address`, etc.) is kept as
 * the real implementation so XDR encoding / key derivation works correctly in
 * tests that need it.
 *
 * Covers imports of the form:
 *   import * as StellarSdk from '@stellar/stellar-sdk';
 *   import { rpc }          from '@stellar/stellar-sdk';
 */
vi.mock('@stellar/stellar-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@stellar/stellar-sdk')>();

  const MockServer = vi.fn(() => mock);

  const mockApi = {
    isSimulationError: (r: Record<string, unknown>): boolean =>
      r !== null && typeof r === 'object' && r['error'] !== undefined,
    isSimulationSuccess: (r: Record<string, unknown>): boolean =>
      r !== null && typeof r === 'object' && r['error'] === undefined,
    GetTransactionStatus: {
      NOT_FOUND: 'NOT_FOUND',
      PENDING: 'PENDING',
      SUCCESS: 'SUCCESS',
      FAILED: 'FAILED',
    } as const,
  };

  return {
    ...actual,
    // The `rpc` named export (used by streamHistory and BalanceWatcher)
    rpc: {
      ...(actual.rpc ?? {}),
      Server: MockServer,
      Api: mockApi,
    },
  };
});
