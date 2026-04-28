import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BalanceWatcher } from '../utils/BalanceWatcher';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockSimulateTransaction = vi.fn();
const mockGetNetwork = vi.fn();

vi.mock('@stellar/stellar-sdk', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@stellar/stellar-sdk');
  return {
    ...actual,
    SorobanRpc: {
      Server: vi.fn().mockImplementation(() => ({
        simulateTransaction: mockSimulateTransaction,
        getNetwork: mockGetNetwork,
      })),
      Api: {
        isSimulationError: vi.fn((r: Record<string, unknown>) => 'error' in r && r.error !== undefined),
      },
    },
    TransactionBuilder: vi.fn().mockImplementation(() => ({
      addOperation: vi.fn().mockReturnThis(),
      setTimeout: vi.fn().mockReturnThis(),
      build: vi.fn(() => ({})),
    })),
    Operation: {
      invokeContractFunction: vi.fn(() => ({})),
    },
    Account: vi.fn().mockImplementation(() => ({})),
    Address: vi.fn().mockImplementation(() => ({
      toScVal: vi.fn(() => ({ switch: () => ({ name: 'scvAddress' }) })),
    })),
    scValToNative: vi.fn(),
    nativeToScVal: vi.fn(),
    Networks: (actual as Record<string, unknown>).Networks,
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const RPC_URL = 'https://soroban-testnet.stellar.org';
const PASSPHRASE = 'Test SDF Network ; September 2015';
const ADDRESS = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const TOKEN = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';

function makeWatcher(opts?: { networkPassphrase?: string }) {
  return new BalanceWatcher({
    rpcUrl: RPC_URL,
    networkPassphrase: opts?.networkPassphrase ?? PASSPHRASE,
    pollInterval: 60_000, // long interval so auto-polling doesn't interfere
  });
}

function mockSuccess(balance: bigint) {
  const { scValToNative } = require('@stellar/stellar-sdk');
  mockSimulateTransaction.mockResolvedValue({
    result: { retval: {} },
  });
  (scValToNative as ReturnType<typeof vi.fn>).mockReturnValue(balance);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('BalanceWatcher.fetchBalance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetNetwork.mockResolvedValue({ passphrase: PASSPHRASE });
  });

  it('returns the balance from a successful simulation', async () => {
    mockSuccess(1_000_000n);
    const watcher = makeWatcher();
    const balance = await watcher.fetchBalance(ADDRESS, TOKEN);
    expect(balance).toBe(1_000_000n);
  });

  it('returns 0n when the contract reports a zero balance', async () => {
    mockSuccess(0n);
    const watcher = makeWatcher();
    expect(await watcher.fetchBalance(ADDRESS, TOKEN)).toBe(0n);
  });

  it('throws when simulation returns an error', async () => {
    mockSimulateTransaction.mockResolvedValue({ error: 'HostError: value error' });
    const watcher = makeWatcher();
    await expect(watcher.fetchBalance(ADDRESS, TOKEN)).rejects.toThrow(
      'Balance simulation failed'
    );
  });

  it('throws when simulation returns no result', async () => {
    mockSimulateTransaction.mockResolvedValue({}); // no result field
    const watcher = makeWatcher();
    await expect(watcher.fetchBalance(ADDRESS, TOKEN)).rejects.toThrow(
      'Balance simulation returned no result'
    );
  });

  it('throws when scValToNative returns a non-bigint', async () => {
    const { scValToNative } = require('@stellar/stellar-sdk');
    mockSimulateTransaction.mockResolvedValue({ result: { retval: {} } });
    (scValToNative as ReturnType<typeof vi.fn>).mockReturnValue(42); // number, not bigint
    const watcher = makeWatcher();
    await expect(watcher.fetchBalance(ADDRESS, TOKEN)).rejects.toThrow(
      'Unexpected balance type'
    );
  });

  it('throws when the RPC call itself rejects', async () => {
    mockSimulateTransaction.mockRejectedValue(new Error('connection refused'));
    const watcher = makeWatcher();
    await expect(watcher.fetchBalance(ADDRESS, TOKEN)).rejects.toThrow(
      'connection refused'
    );
  });

  it('fetches the network passphrase from RPC when not provided in options', async () => {
    mockSuccess(500n);
    const watcher = new BalanceWatcher({ rpcUrl: RPC_URL, pollInterval: 60_000 });
    await watcher.fetchBalance(ADDRESS, TOKEN);
    expect(mockGetNetwork).toHaveBeenCalledTimes(1);
  });

  it('caches the network passphrase after the first fetch', async () => {
    mockSuccess(500n);
    const watcher = new BalanceWatcher({ rpcUrl: RPC_URL, pollInterval: 60_000 });
    await watcher.fetchBalance(ADDRESS, TOKEN);
    await watcher.fetchBalance(ADDRESS, TOKEN);
    expect(mockGetNetwork).toHaveBeenCalledTimes(1);
  });

  it('does not call getNetwork when passphrase is provided', async () => {
    mockSuccess(100n);
    const watcher = makeWatcher();
    await watcher.fetchBalance(ADDRESS, TOKEN);
    expect(mockGetNetwork).not.toHaveBeenCalled();
  });
});

describe('BalanceWatcher watch/poll integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetNetwork.mockResolvedValue({ passphrase: PASSPHRASE });
  });

  it('calls the callback when balance changes', async () => {
    const { scValToNative } = require('@stellar/stellar-sdk');
    mockSimulateTransaction.mockResolvedValue({ result: { retval: {} } });
    (scValToNative as ReturnType<typeof vi.fn>).mockReturnValue(999n);

    const watcher = makeWatcher();
    const cb = vi.fn();
    watcher.watch(ADDRESS, TOKEN, cb);

    // Manually trigger a poll
    await (watcher as unknown as { pollBalances: () => Promise<void> }).pollBalances();

    expect(cb).toHaveBeenCalledWith(
      expect.objectContaining({ address: ADDRESS, token: TOKEN, balance: 999n })
    );
    watcher.clear();
  });

  it('does not call the callback when balance is unchanged', async () => {
    const { scValToNative } = require('@stellar/stellar-sdk');
    mockSimulateTransaction.mockResolvedValue({ result: { retval: {} } });
    (scValToNative as ReturnType<typeof vi.fn>).mockReturnValue(100n);

    const watcher = makeWatcher();
    const cb = vi.fn();
    watcher.watch(ADDRESS, TOKEN, cb);

    const poll = () => (watcher as unknown as { pollBalances: () => Promise<void> }).pollBalances();
    await poll(); // first poll — balance changes from null → 100n, callback fires
    await poll(); // second poll — balance unchanged, callback must NOT fire again

    expect(cb).toHaveBeenCalledTimes(1);
    watcher.clear();
  });

  it('unsubscribe removes the callback', async () => {
    const { scValToNative } = require('@stellar/stellar-sdk');
    mockSimulateTransaction.mockResolvedValue({ result: { retval: {} } });
    (scValToNative as ReturnType<typeof vi.fn>).mockReturnValue(1n);

    const watcher = makeWatcher();
    const cb = vi.fn();
    const unsub = watcher.watch(ADDRESS, TOKEN, cb);
    unsub();

    await (watcher as unknown as { pollBalances: () => Promise<void> }).pollBalances();
    expect(cb).not.toHaveBeenCalled();
    watcher.clear();
  });
});
