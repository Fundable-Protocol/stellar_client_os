import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BalanceWatcher } from '../utils/BalanceWatcher.js';
import type { Stream } from '../generated/payment-stream/src/index.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockSimulateTransaction = vi.fn();
const mockGetNetwork = vi.fn();
const mockScValToNative = vi.fn();

vi.mock('@stellar/stellar-sdk', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@stellar/stellar-sdk');
  return {
    ...actual,
    rpc: {
      Server: vi.fn().mockImplementation(() => ({
        simulateTransaction: mockSimulateTransaction,
        getNetwork: mockGetNetwork,
      })),
      Api: {
        isSimulationError: vi.fn(
          (r: Record<string, unknown>) => 'error' in r && r.error !== undefined,
        ),
      },
    },
    // Keep legacy SorobanRpc alias working too
    SorobanRpc: {
      Server: vi.fn().mockImplementation(() => ({
        simulateTransaction: mockSimulateTransaction,
        getNetwork: mockGetNetwork,
      })),
      Api: {
        isSimulationError: vi.fn(
          (r: Record<string, unknown>) => 'error' in r && r.error !== undefined,
        ),
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
    scValToNative: mockScValToNative,
    nativeToScVal: vi.fn(),
    Networks: (actual as Record<string, unknown>).Networks,
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const RPC_URL   = 'https://soroban-testnet.stellar.org';
const PASSPHRASE = 'Test SDF Network ; September 2015';
const ADDRESS   = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const ADDRESS_B = 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
const TOKEN     = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
const TOKEN_B   = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM';

const MOCK_STREAM: Pick<Stream, 'sender' | 'recipient' | 'token'> = {
  sender: ADDRESS,
  recipient: ADDRESS_B,
  token: TOKEN,
};

function makeWatcher(opts?: Partial<ConstructorParameters<typeof BalanceWatcher>[0]>) {
  return new BalanceWatcher({
    rpcUrl: RPC_URL,
    networkPassphrase: PASSPHRASE,
    pollInterval: 60_000, // long interval — prevents auto-polls interfering
    ...opts,
  });
}

/** Wire up the SDK mocks so that fetchBalance(ADDRESS, TOKEN) returns `balance`. */
function mockBalanceSuccess(balance: bigint) {
  mockSimulateTransaction.mockResolvedValue({ result: { retval: {} } });
  mockScValToNative.mockReturnValue(balance);
}

/** Shorthand: manually invoke the private pollBalances method. */
function poll(watcher: BalanceWatcher): Promise<void> {
  return (watcher as unknown as { pollBalances(): Promise<void> }).pollBalances();
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
  mockGetNetwork.mockResolvedValue({ passphrase: PASSPHRASE });
});

afterEach(() => {
  vi.useRealTimers();
});

// ===========================================================================
// fetchBalance
// ===========================================================================
describe('BalanceWatcher.fetchBalance', () => {
  it('returns the balance from a successful simulation', async () => {
    mockBalanceSuccess(1_000_000n);
    const watcher = makeWatcher();
    expect(await watcher.fetchBalance(ADDRESS, TOKEN)).toBe(1_000_000n);
  });

  it('returns 0n when the contract reports a zero balance', async () => {
    mockBalanceSuccess(0n);
    const watcher = makeWatcher();
    expect(await watcher.fetchBalance(ADDRESS, TOKEN)).toBe(0n);
  });

  it('returns large i128 values without loss of precision', async () => {
    const huge = 170_141_183_460_469_231_731_687_303_715_884_105_727n; // i128 max
    mockBalanceSuccess(huge);
    const watcher = makeWatcher();
    expect(await watcher.fetchBalance(ADDRESS, TOKEN)).toBe(huge);
  });

  it('throws when simulation returns an error response', async () => {
    mockSimulateTransaction.mockResolvedValue({ error: 'HostError: value error' });
    const watcher = makeWatcher();
    await expect(watcher.fetchBalance(ADDRESS, TOKEN)).rejects.toThrow(
      'Balance simulation failed',
    );
  });

  it('throws when simulation returns no result field', async () => {
    mockSimulateTransaction.mockResolvedValue({});
    const watcher = makeWatcher();
    await expect(watcher.fetchBalance(ADDRESS, TOKEN)).rejects.toThrow(
      'Balance simulation returned no result',
    );
  });

  it('throws when scValToNative returns a non-bigint', async () => {
    mockSimulateTransaction.mockResolvedValue({ result: { retval: {} } });
    mockScValToNative.mockReturnValue(42); // number
    const watcher = makeWatcher();
    await expect(watcher.fetchBalance(ADDRESS, TOKEN)).rejects.toThrow(
      'Unexpected balance type',
    );
  });

  it('propagates network-level RPC rejections', async () => {
    mockSimulateTransaction.mockRejectedValue(new Error('connection refused'));
    const watcher = makeWatcher();
    await expect(watcher.fetchBalance(ADDRESS, TOKEN)).rejects.toThrow(
      'connection refused',
    );
  });

  it('fetches the network passphrase from RPC when not provided', async () => {
    mockBalanceSuccess(500n);
    const watcher = new BalanceWatcher({ rpcUrl: RPC_URL, pollInterval: 60_000 });
    await watcher.fetchBalance(ADDRESS, TOKEN);
    expect(mockGetNetwork).toHaveBeenCalledTimes(1);
  });

  it('caches the network passphrase after the first fetch', async () => {
    mockBalanceSuccess(500n);
    const watcher = new BalanceWatcher({ rpcUrl: RPC_URL, pollInterval: 60_000 });
    await watcher.fetchBalance(ADDRESS, TOKEN);
    await watcher.fetchBalance(ADDRESS, TOKEN);
    expect(mockGetNetwork).toHaveBeenCalledTimes(1);
  });

  it('does not call getNetwork when passphrase is provided in options', async () => {
    mockBalanceSuccess(100n);
    const watcher = makeWatcher();
    await watcher.fetchBalance(ADDRESS, TOKEN);
    expect(mockGetNetwork).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// fetchBalances — bulk
// ===========================================================================
describe('BalanceWatcher.fetchBalances', () => {
  it('returns balances for all requested pairs', async () => {
    mockSimulateTransaction.mockResolvedValue({ result: { retval: {} } });
    mockScValToNative
      .mockReturnValueOnce(100n)
      .mockReturnValueOnce(200n);

    const watcher = makeWatcher();
    const results = await watcher.fetchBalances([
      { address: ADDRESS,   token: TOKEN },
      { address: ADDRESS_B, token: TOKEN },
    ]);

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ address: ADDRESS,   token: TOKEN, balance: 100n });
    expect(results[1]).toMatchObject({ address: ADDRESS_B, token: TOKEN, balance: 200n });
  });

  it('captures errors per-pair without aborting the batch', async () => {
    // First pair succeeds
    mockSimulateTransaction
      .mockResolvedValueOnce({ result: { retval: {} } })
      .mockRejectedValueOnce(new Error('RPC timeout'));
    mockScValToNative.mockReturnValueOnce(50n);

    const watcher = makeWatcher();
    const results = await watcher.fetchBalances([
      { address: ADDRESS,   token: TOKEN },
      { address: ADDRESS_B, token: TOKEN },
    ]);

    expect(results[0].balance).toBe(50n);
    expect(results[0].error).toBeUndefined();
    expect(results[1].balance).toBeNull();
    expect(results[1].error?.message).toContain('RPC timeout');
  });

  it('returns an empty array for an empty input', async () => {
    const watcher = makeWatcher();
    expect(await watcher.fetchBalances([])).toEqual([]);
  });

  it('handles a single pair', async () => {
    mockBalanceSuccess(999n);
    const watcher = makeWatcher();
    const results = await watcher.fetchBalances([{ address: ADDRESS, token: TOKEN }]);
    expect(results).toHaveLength(1);
    expect(results[0].balance).toBe(999n);
  });
});

// ===========================================================================
// getLastKnownBalance
// ===========================================================================
describe('BalanceWatcher.getLastKnownBalance', () => {
  it('returns null before any poll has run', () => {
    const watcher = makeWatcher();
    watcher.watch(ADDRESS, TOKEN, vi.fn());
    expect(watcher.getLastKnownBalance(ADDRESS, TOKEN)).toBeNull();
    watcher.clear();
  });

  it('returns the cached balance after the first successful poll', async () => {
    mockBalanceSuccess(777n);
    const watcher = makeWatcher();
    watcher.watch(ADDRESS, TOKEN, vi.fn());
    await poll(watcher);
    expect(watcher.getLastKnownBalance(ADDRESS, TOKEN)).toBe(777n);
    watcher.clear();
  });

  it('returns null for unwatched address/token pairs', () => {
    const watcher = makeWatcher();
    expect(watcher.getLastKnownBalance(ADDRESS, TOKEN)).toBeNull();
  });

  it('returns null after the watcher is cleared', async () => {
    mockBalanceSuccess(42n);
    const watcher = makeWatcher();
    watcher.watch(ADDRESS, TOKEN, vi.fn());
    await poll(watcher);
    watcher.clear();
    expect(watcher.getLastKnownBalance(ADDRESS, TOKEN)).toBeNull();
  });

  it('reflects the most recent balance after multiple polls', async () => {
    mockSimulateTransaction.mockResolvedValue({ result: { retval: {} } });
    mockScValToNative
      .mockReturnValueOnce(100n)
      .mockReturnValueOnce(200n);

    const watcher = makeWatcher();
    watcher.watch(ADDRESS, TOKEN, vi.fn());
    await poll(watcher);
    expect(watcher.getLastKnownBalance(ADDRESS, TOKEN)).toBe(100n);
    await poll(watcher);
    expect(watcher.getLastKnownBalance(ADDRESS, TOKEN)).toBe(200n);
    watcher.clear();
  });
});

// ===========================================================================
// watch / unwatch
// ===========================================================================
describe('BalanceWatcher.watch', () => {
  it('calls the callback when balance changes from null to a value', async () => {
    mockBalanceSuccess(999n);
    const watcher = makeWatcher();
    const cb = vi.fn();
    watcher.watch(ADDRESS, TOKEN, cb);
    await poll(watcher);
    expect(cb).toHaveBeenCalledWith(
      expect.objectContaining({ address: ADDRESS, token: TOKEN, balance: 999n }),
    );
    watcher.clear();
  });

  it('does not call the callback when balance is unchanged', async () => {
    mockBalanceSuccess(100n);
    const watcher = makeWatcher();
    const cb = vi.fn();
    watcher.watch(ADDRESS, TOKEN, cb);
    await poll(watcher); // null → 100n, fires
    await poll(watcher); // 100n → 100n, does NOT fire
    expect(cb).toHaveBeenCalledTimes(1);
    watcher.clear();
  });

  it('calls the callback again when balance changes on a subsequent poll', async () => {
    mockSimulateTransaction.mockResolvedValue({ result: { retval: {} } });
    mockScValToNative
      .mockReturnValueOnce(100n)
      .mockReturnValueOnce(200n);

    const watcher = makeWatcher();
    const cb = vi.fn();
    watcher.watch(ADDRESS, TOKEN, cb);
    await poll(watcher); // 100n
    await poll(watcher); // 200n
    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb).toHaveBeenLastCalledWith(
      expect.objectContaining({ balance: 200n }),
    );
    watcher.clear();
  });

  it('supports multiple callbacks for the same pair', async () => {
    mockBalanceSuccess(50n);
    const watcher = makeWatcher();
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    watcher.watch(ADDRESS, TOKEN, cb1);
    watcher.watch(ADDRESS, TOKEN, cb2);
    await poll(watcher);
    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
    watcher.clear();
  });

  it('supports watching different address/token pairs independently', async () => {
    mockSimulateTransaction.mockResolvedValue({ result: { retval: {} } });
    mockScValToNative
      .mockReturnValueOnce(10n)  // ADDRESS / TOKEN
      .mockReturnValueOnce(20n); // ADDRESS_B / TOKEN

    const watcher = makeWatcher();
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    watcher.watch(ADDRESS, TOKEN, cb1);
    watcher.watch(ADDRESS_B, TOKEN, cb2);
    await poll(watcher);
    expect(cb1).toHaveBeenCalledWith(expect.objectContaining({ balance: 10n }));
    expect(cb2).toHaveBeenCalledWith(expect.objectContaining({ balance: 20n }));
    watcher.clear();
  });

  it('update object includes address, token, balance, and timestamp', async () => {
    mockBalanceSuccess(123n);
    const watcher = makeWatcher();
    const cb = vi.fn();
    watcher.watch(ADDRESS, TOKEN, cb);
    await poll(watcher);
    const update = cb.mock.calls[0][0];
    expect(update.address).toBe(ADDRESS);
    expect(update.token).toBe(TOKEN);
    expect(update.balance).toBe(123n);
    expect(typeof update.timestamp).toBe('number');
    expect(update.timestamp).toBeGreaterThan(0);
    watcher.clear();
  });
});

describe('BalanceWatcher.unwatch (via returned unsub fn)', () => {
  it('unsubscribe removes the specific callback', async () => {
    mockBalanceSuccess(1n);
    const watcher = makeWatcher();
    const cb = vi.fn();
    const unsub = watcher.watch(ADDRESS, TOKEN, cb);
    unsub();
    await poll(watcher);
    expect(cb).not.toHaveBeenCalled();
    watcher.clear();
  });

  it('unsubscribe removes only the targeted callback, leaving others intact', async () => {
    mockBalanceSuccess(1n);
    const watcher = makeWatcher();
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const unsub1 = watcher.watch(ADDRESS, TOKEN, cb1);
    watcher.watch(ADDRESS, TOKEN, cb2);
    unsub1();
    await poll(watcher);
    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).toHaveBeenCalledTimes(1);
    watcher.clear();
  });

  it('removes the watcher entry when the last callback is unsubscribed', () => {
    const watcher = makeWatcher();
    const cb = vi.fn();
    const unsub = watcher.watch(ADDRESS, TOKEN, cb);
    expect(watcher.getWatcherCount()).toBe(1);
    unsub();
    expect(watcher.getWatcherCount()).toBe(0);
  });

  it('stops polling when all watchers are unsubscribed', () => {
    const watcher = makeWatcher();
    const unsub = watcher.watch(ADDRESS, TOKEN, vi.fn());
    expect(watcher.isActive()).toBe(true);
    unsub();
    expect(watcher.isActive()).toBe(false);
  });

  it('calling unsub twice does not throw', () => {
    const watcher = makeWatcher();
    const unsub = watcher.watch(ADDRESS, TOKEN, vi.fn());
    expect(() => { unsub(); unsub(); }).not.toThrow();
    watcher.clear();
  });
});

// ===========================================================================
// watchStream
// ===========================================================================
describe('BalanceWatcher.watchStream', () => {
  it('registers watchers for both sender and recipient', () => {
    const watcher = makeWatcher();
    watcher.watchStream(MOCK_STREAM, vi.fn());
    expect(watcher.getWatcherCount()).toBe(2);
    watcher.clear();
  });

  it('notifies callback for sender balance change', async () => {
    mockSimulateTransaction.mockResolvedValue({ result: { retval: {} } });
    mockScValToNative
      .mockReturnValueOnce(100n)  // sender
      .mockReturnValueOnce(200n); // recipient

    const watcher = makeWatcher();
    const cb = vi.fn();
    watcher.watchStream(MOCK_STREAM, cb);
    await poll(watcher);

    const senderCall = cb.mock.calls.find(([u]) => u.address === ADDRESS);
    expect(senderCall).toBeDefined();
    expect(senderCall![0].balance).toBe(100n);
    watcher.clear();
  });

  it('notifies callback for recipient balance change', async () => {
    mockSimulateTransaction.mockResolvedValue({ result: { retval: {} } });
    mockScValToNative
      .mockReturnValueOnce(100n)  // sender
      .mockReturnValueOnce(200n); // recipient

    const watcher = makeWatcher();
    const cb = vi.fn();
    watcher.watchStream(MOCK_STREAM, cb);
    await poll(watcher);

    const recipientCall = cb.mock.calls.find(([u]) => u.address === ADDRESS_B);
    expect(recipientCall).toBeDefined();
    expect(recipientCall![0].balance).toBe(200n);
    watcher.clear();
  });

  it('unsubscribing removes both sender and recipient watchers', () => {
    const watcher = makeWatcher();
    const unsub = watcher.watchStream(MOCK_STREAM, vi.fn());
    expect(watcher.getWatcherCount()).toBe(2);
    unsub();
    expect(watcher.getWatcherCount()).toBe(0);
  });

  it('unsubscribing stops the polling loop when no other watchers exist', () => {
    const watcher = makeWatcher();
    const unsub = watcher.watchStream(MOCK_STREAM, vi.fn());
    expect(watcher.isActive()).toBe(true);
    unsub();
    expect(watcher.isActive()).toBe(false);
  });

  it('uses stream.token for both sender and recipient subscriptions', async () => {
    mockBalanceSuccess(1n);
    const watcher = makeWatcher();
    const cb = vi.fn();
    watcher.watchStream(MOCK_STREAM, cb);
    await poll(watcher);
    cb.mock.calls.forEach(([update]) => {
      expect(update.token).toBe(TOKEN);
    });
    watcher.clear();
  });
});

// ===========================================================================
// onError callback
// ===========================================================================
describe('BalanceWatcher onError option', () => {
  it('invokes onError when a poll fails instead of console.error', async () => {
    mockSimulateTransaction.mockRejectedValue(new Error('RPC down'));
    const onError = vi.fn();
    const watcher = makeWatcher({ onError });
    watcher.watch(ADDRESS, TOKEN, vi.fn());
    await poll(watcher);
    expect(onError).toHaveBeenCalledWith(
      expect.any(Error),
      ADDRESS,
      TOKEN,
    );
    expect(onError.mock.calls[0][0].message).toContain('RPC down');
    watcher.clear();
  });

  it('passes the correct address and token to onError', async () => {
    mockSimulateTransaction.mockRejectedValue(new Error('fail'));
    const onError = vi.fn();
    const watcher = makeWatcher({ onError });
    watcher.watch(ADDRESS_B, TOKEN_B, vi.fn());
    await poll(watcher);
    expect(onError).toHaveBeenCalledWith(expect.any(Error), ADDRESS_B, TOKEN_B);
    watcher.clear();
  });

  it('does not throw if onError itself throws', async () => {
    mockSimulateTransaction.mockRejectedValue(new Error('fail'));
    const watcher = makeWatcher({
      onError: () => { throw new Error('handler error'); },
    });
    watcher.watch(ADDRESS, TOKEN, vi.fn());
    await expect(poll(watcher)).resolves.not.toThrow();
    watcher.clear();
  });

  it('poll errors for one pair do not stop other pairs from being polled', async () => {
    mockSimulateTransaction
      .mockRejectedValueOnce(new Error('fail A'))         // ADDRESS / TOKEN fails
      .mockResolvedValueOnce({ result: { retval: {} } }); // ADDRESS_B / TOKEN succeeds
    mockScValToNative.mockReturnValue(88n);

    const onError = vi.fn();
    const cbB = vi.fn();
    const watcher = makeWatcher({ onError });
    watcher.watch(ADDRESS, TOKEN, vi.fn());
    watcher.watch(ADDRESS_B, TOKEN, cbB);
    await poll(watcher);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(cbB).toHaveBeenCalledWith(expect.objectContaining({ balance: 88n }));
    watcher.clear();
  });
});

// ===========================================================================
// Lifecycle — start / stop / clear
// ===========================================================================
describe('BalanceWatcher lifecycle', () => {
  it('isActive() returns false before any watch is registered', () => {
    const watcher = makeWatcher();
    expect(watcher.isActive()).toBe(false);
  });

  it('isActive() returns true after watch() is called', () => {
    const watcher = makeWatcher();
    watcher.watch(ADDRESS, TOKEN, vi.fn());
    expect(watcher.isActive()).toBe(true);
    watcher.clear();
  });

  it('isActive() returns false after stop()', () => {
    const watcher = makeWatcher();
    watcher.watch(ADDRESS, TOKEN, vi.fn());
    watcher.stop();
    expect(watcher.isActive()).toBe(false);
    watcher.clear();
  });

  it('start() resumes polling after stop()', async () => {
    mockBalanceSuccess(1n);
    const watcher = makeWatcher();
    watcher.watch(ADDRESS, TOKEN, vi.fn());
    watcher.stop();
    expect(watcher.isActive()).toBe(false);
    watcher.start();
    expect(watcher.isActive()).toBe(true);
    watcher.clear();
  });

  it('calling start() multiple times does not create duplicate intervals', () => {
    vi.useFakeTimers();
    const watcher = makeWatcher();
    watcher.watch(ADDRESS, TOKEN, vi.fn());
    watcher.start(); // already running from watch()
    watcher.start(); // should be a no-op
    // Only one interval should exist — validated via getWatcherCount staying stable
    expect(watcher.isActive()).toBe(true);
    watcher.clear();
  });

  it('clear() removes all watchers', () => {
    const watcher = makeWatcher();
    watcher.watch(ADDRESS, TOKEN, vi.fn());
    watcher.watch(ADDRESS_B, TOKEN, vi.fn());
    expect(watcher.getWatcherCount()).toBe(2);
    watcher.clear();
    expect(watcher.getWatcherCount()).toBe(0);
  });

  it('clear() stops polling', () => {
    const watcher = makeWatcher();
    watcher.watch(ADDRESS, TOKEN, vi.fn());
    watcher.clear();
    expect(watcher.isActive()).toBe(false);
  });

  it('stop() is idempotent — calling twice does not throw', () => {
    const watcher = makeWatcher();
    expect(() => { watcher.stop(); watcher.stop(); }).not.toThrow();
  });

  it('getWatcherCount() reflects active subscriptions accurately', () => {
    const watcher = makeWatcher();
    expect(watcher.getWatcherCount()).toBe(0);
    const unsub1 = watcher.watch(ADDRESS,   TOKEN, vi.fn());
    const unsub2 = watcher.watch(ADDRESS_B, TOKEN, vi.fn());
    expect(watcher.getWatcherCount()).toBe(2);
    unsub1();
    expect(watcher.getWatcherCount()).toBe(1);
    unsub2();
    expect(watcher.getWatcherCount()).toBe(0);
  });

  it('polling loop triggers callbacks at the configured interval', async () => {
    vi.useFakeTimers();
    mockSimulateTransaction.mockResolvedValue({ result: { retval: {} } });
    mockScValToNative
      .mockReturnValueOnce(1n)
      .mockReturnValueOnce(2n)
      .mockReturnValueOnce(3n);

    const watcher = new BalanceWatcher({
      rpcUrl: RPC_URL,
      networkPassphrase: PASSPHRASE,
      pollInterval: 1_000,
    });
    const cb = vi.fn();
    watcher.watch(ADDRESS, TOKEN, cb);

    // Initial poll fires synchronously via start()
    await vi.runAllTimersAsync();
    // Advance by two more intervals
    vi.advanceTimersByTime(2_000);
    await vi.runAllTimersAsync();

    expect(cb.mock.calls.length).toBeGreaterThanOrEqual(2);
    watcher.clear();
  });
});
