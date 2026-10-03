/**
 * Unit tests for the mock RPC server (src/test-utils/mockRpcServer.ts).
 *
 * These tests verify the mock's own API contract:
 *  - All scenario helpers set up the expected default responses.
 *  - resetMockRpcServer() clears call history AND registered return values.
 *  - Both mock paths (@stellar/stellar-sdk/rpc and @stellar/stellar-sdk) expose
 *    a Server constructor that returns the shared mock instance.
 *  - The Api helpers (isSimulationError, isSimulationSuccess, GetTransactionStatus)
 *    behave exactly as documented.
 *
 * Import order matters: mockRpcServer must be imported BEFORE any SDK module so
 * that Vitest hoists the vi.mock() calls correctly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMockRpcServer,
  resetMockRpcServer,
  DEFAULT_MOCK_ACCOUNT,
  DEFAULT_SIMULATION_SUCCESS,
  DEFAULT_TX_SUCCESS,
  DEFAULT_SEND_TX_RESPONSE,
  DEFAULT_NETWORK_INFO,
  DEFAULT_LATEST_LEDGER,
  DEFAULT_FEE_STATS,
} from '../test-utils/mockRpcServer.js';
import { Server as RpcServer, Api } from '@stellar/stellar-sdk/rpc';
import { rpc as StellarRpc } from '@stellar/stellar-sdk';

// ---------------------------------------------------------------------------
// Shared mock instance
// ---------------------------------------------------------------------------
const rpc = createMockRpcServer();

beforeEach(() => {
  resetMockRpcServer();
});

// ---------------------------------------------------------------------------
// Module-level vi.mock() integration — Server constructor wiring
// ---------------------------------------------------------------------------
describe('module mock wiring', () => {
  it('@stellar/stellar-sdk/rpc Server constructor returns the mock instance', () => {
    const server = new RpcServer('https://soroban-testnet.stellar.org');
    expect(server).toBe(rpc);
  });

  it('@stellar/stellar-sdk rpc.Server constructor returns the mock instance', () => {
    const server = new StellarRpc.Server('https://soroban-testnet.stellar.org');
    expect(server).toBe(rpc);
  });

});

// ---------------------------------------------------------------------------
// Api namespace shape
// ---------------------------------------------------------------------------
describe('Api namespace', () => {
  it('isSimulationError returns true for objects with an error field', () => {
    expect(Api.isSimulationError({ error: 'HostError' } as any)).toBe(true);
    expect(Api.isSimulationError({ error: '' } as any)).toBe(true);
  });

  it('isSimulationError returns false for objects without an error field', () => {
    expect(Api.isSimulationError({ minResourceFee: '100' } as any)).toBe(false);
    expect(Api.isSimulationError({} as any)).toBe(false);
  });

  it('isSimulationSuccess returns true for objects without an error field', () => {
    expect(Api.isSimulationSuccess({ minResourceFee: '100' } as any)).toBe(true);
    expect(Api.isSimulationSuccess({} as any)).toBe(true);
  });

  it('isSimulationSuccess returns false for objects with an error field', () => {
    expect(Api.isSimulationSuccess({ error: 'bad' } as any)).toBe(false);
  });

  it('GetTransactionStatus has correct string constants', () => {
    expect(Api.GetTransactionStatus.SUCCESS).toBe('SUCCESS');
    expect(Api.GetTransactionStatus.FAILED).toBe('FAILED');
    expect(Api.GetTransactionStatus.NOT_FOUND).toBe('NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// resetMockRpcServer
// ---------------------------------------------------------------------------
describe('resetMockRpcServer', () => {
  it('clears registered return values so subsequent calls return undefined', async () => {
    rpc.getAccount.mockResolvedValue(DEFAULT_MOCK_ACCOUNT);
    resetMockRpcServer();
    // After reset the mock has no return value configured → resolves to undefined
    const result = await rpc.getAccount('G...');
    expect(result).toBeUndefined();
  });

  it('clears call history', async () => {
    rpc.simulateTransaction.mockResolvedValue(DEFAULT_SIMULATION_SUCCESS);
    await rpc.simulateTransaction({} as any);
    expect(rpc.simulateTransaction).toHaveBeenCalledTimes(1);

    resetMockRpcServer();
    expect(rpc.simulateTransaction).toHaveBeenCalledTimes(0);
  });

  it('does not affect mock functions registered after the reset', async () => {
    resetMockRpcServer();
    rpc.getNetwork.mockResolvedValue(DEFAULT_NETWORK_INFO);
    const info = await rpc.getNetwork();
    expect(info).toEqual(DEFAULT_NETWORK_INFO);
  });
});

// ---------------------------------------------------------------------------
// scenarios.success
// ---------------------------------------------------------------------------
describe('scenarios.success', () => {
  beforeEach(() => rpc.scenarios.success());

  it('getAccount resolves with the default mock account', async () => {
    const account = await rpc.getAccount(DEFAULT_MOCK_ACCOUNT.id);
    expect(account).toEqual(DEFAULT_MOCK_ACCOUNT);
  });

  it('simulateTransaction resolves with the default simulation response', async () => {
    const sim = await rpc.simulateTransaction({} as any);
    expect(sim).toEqual(DEFAULT_SIMULATION_SUCCESS);
  });

  it('sendTransaction resolves with the default send response', async () => {
    const send = await rpc.sendTransaction({} as any);
    expect(send).toEqual(DEFAULT_SEND_TX_RESPONSE);
  });

  it('getTransaction resolves with SUCCESS status', async () => {
    const tx = await rpc.getTransaction('hash');
    expect(tx.status).toBe('SUCCESS');
    if (tx.status === 'SUCCESS') {
      expect(tx.ledger).toBe(DEFAULT_TX_SUCCESS.ledger);
    }
  });

  it('getNetwork resolves with the default network info', async () => {
    const network = await rpc.getNetwork();
    expect(network).toEqual(DEFAULT_NETWORK_INFO);
  });

  it('getLatestLedger resolves with the default ledger', async () => {
    const ledger = await rpc.getLatestLedger();
    expect(ledger).toEqual(DEFAULT_LATEST_LEDGER);
  });

  it('getFeeStats resolves with the default fee stats', async () => {
    const stats = await rpc.getFeeStats();
    expect(stats).toEqual(DEFAULT_FEE_STATS);
  });

  it('getEvents resolves with an empty event list', async () => {
    const events = await rpc.getEvents({});
    expect(events.events).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// scenarios.pendingThenSuccess
// ---------------------------------------------------------------------------
describe('scenarios.pendingThenSuccess', () => {
  it('first call returns PENDING, second returns SUCCESS', async () => {
    rpc.scenarios.pendingThenSuccess({ ledger: 789 });

    const first = await rpc.getTransaction('hash');
    expect(first.status).toBe('PENDING');

    const second = await rpc.getTransaction('hash');
    expect(second.status).toBe('SUCCESS');
    if (second.status === 'SUCCESS') {
      expect(second.ledger).toBe(789);
    }
  });
});

// ---------------------------------------------------------------------------
// scenarios.notFoundThenSuccess
// ---------------------------------------------------------------------------
describe('scenarios.notFoundThenSuccess', () => {
  it('first call returns NOT_FOUND, second returns SUCCESS', async () => {
    rpc.scenarios.notFoundThenSuccess({ ledger: 999 });

    const first = await rpc.getTransaction('hash');
    expect(first.status).toBe('NOT_FOUND');

    const second = await rpc.getTransaction('hash');
    expect(second.status).toBe('SUCCESS');
    if (second.status === 'SUCCESS') {
      expect(second.ledger).toBe(999);
    }
  });
});

// ---------------------------------------------------------------------------
// scenarios.transactionFailed
// ---------------------------------------------------------------------------
describe('scenarios.transactionFailed', () => {
  it('getTransaction always resolves with FAILED status', async () => {
    rpc.scenarios.transactionFailed({ ledger: 42 });
    const tx = await rpc.getTransaction('hash');
    expect(tx.status).toBe('FAILED');
    if (tx.status === 'FAILED') {
      expect(tx.ledger).toBe(42);
    }
  });
});

// ---------------------------------------------------------------------------
// scenarios.simulationError
// ---------------------------------------------------------------------------
describe('scenarios.simulationError', () => {
  it('simulateTransaction resolves with an error-shaped object', async () => {
    rpc.scenarios.simulationError('HostError: bad value');
    const sim = await rpc.simulateTransaction({} as any);
    expect(Api.isSimulationError(sim as any)).toBe(true);
    expect((sim as any).error).toBe('HostError: bad value');
  });

  it('uses a default message when none is provided', async () => {
    rpc.scenarios.simulationError();
    const sim = await rpc.simulateTransaction({} as any);
    expect((sim as any).error).toContain('HostError');
  });
});

// ---------------------------------------------------------------------------
// scenarios.simulationNetworkError
// ---------------------------------------------------------------------------
describe('scenarios.simulationNetworkError', () => {
  it('simulateTransaction rejects with the provided message', async () => {
    rpc.scenarios.simulationNetworkError('ECONNREFUSED');
    await expect(rpc.simulateTransaction({} as any)).rejects.toThrow('ECONNREFUSED');
  });
});

// ---------------------------------------------------------------------------
// scenarios.sendTransactionError
// ---------------------------------------------------------------------------
describe('scenarios.sendTransactionError', () => {
  it('sendTransaction resolves with ERROR status', async () => {
    rpc.scenarios.sendTransactionError();
    const send = await rpc.sendTransaction({} as any);
    expect(send.status).toBe('ERROR');
  });

  it('errorResult.toXDR returns the provided XDR string', async () => {
    rpc.scenarios.sendTransactionError('customXDR==');
    const send = await rpc.sendTransaction({} as any);
    expect(send.errorResult?.toXDR('base64')).toBe('customXDR==');
  });
});

// ---------------------------------------------------------------------------
// scenarios.accountNotFound
// ---------------------------------------------------------------------------
describe('scenarios.accountNotFound', () => {
  it('getAccount rejects with a descriptive error', async () => {
    rpc.scenarios.accountNotFound('GABC...');
    await expect(rpc.getAccount('GABC...')).rejects.toThrow('Account not found: GABC...');
  });
});

// ---------------------------------------------------------------------------
// scenarios.networkError
// ---------------------------------------------------------------------------
describe('scenarios.networkError', () => {
  it('getNetwork rejects with the provided message', async () => {
    rpc.scenarios.networkError('connection refused');
    await expect(rpc.getNetwork()).rejects.toThrow('connection refused');
  });
});

// ---------------------------------------------------------------------------
// scenarios.highCongestionFeeStats
// ---------------------------------------------------------------------------
describe('scenarios.highCongestionFeeStats', () => {
  it('getFeeStats resolves with high-congestion fee data', async () => {
    rpc.scenarios.highCongestionFeeStats();
    const stats = await rpc.getFeeStats();
    const p99 = Number(stats.inclusionFee?.p99);
    expect(p99).toBeGreaterThan(500);
  });
});

// ---------------------------------------------------------------------------
// scenarios.contractEvents
// ---------------------------------------------------------------------------
describe('scenarios.contractEvents', () => {
  it('getEvents resolves with the provided events', async () => {
    const events = [
      { pagingToken: 'tok-1', topic: ['StreamCreated'], value: { stream_id: 1n } },
      { pagingToken: 'tok-2', topic: ['StreamDeposit'],  value: { stream_id: 1n, amount: 100n } },
    ];
    rpc.scenarios.contractEvents(events, 555);
    const response = await rpc.getEvents({});
    expect(response.events).toHaveLength(2);
    expect(response.latestLedger).toBe(555);
    expect(response.events[0].pagingToken).toBe('tok-1');
  });
});

// ---------------------------------------------------------------------------
// scenarios.getEventsError
// ---------------------------------------------------------------------------
describe('scenarios.getEventsError', () => {
  it('getEvents rejects with the provided message', async () => {
    rpc.scenarios.getEventsError('RPC timeout');
    await expect(rpc.getEvents({})).rejects.toThrow('RPC timeout');
  });
});

// ---------------------------------------------------------------------------
// Per-test mock overrides on top of a scenario
// ---------------------------------------------------------------------------
describe('per-test overrides on top of scenarios', () => {
  it('mockResolvedValueOnce overrides work after scenarios.success()', async () => {
    rpc.scenarios.success();
    // Override just one call
    rpc.getTransaction.mockResolvedValueOnce({ status: 'PENDING' });
    // First call → PENDING override
    expect((await rpc.getTransaction('h')).status).toBe('PENDING');
    // Second call → falls back to scenario default (SUCCESS)
    expect((await rpc.getTransaction('h')).status).toBe('SUCCESS');
  });

  it('calling scenarios.success() after reset reapplies defaults', async () => {
    rpc.scenarios.simulationError('test error');
    // Confirm it's in error mode
    expect(Api.isSimulationError((await rpc.simulateTransaction({} as any)) as any)).toBe(true);

    resetMockRpcServer();
    rpc.scenarios.success();
    // Should be back to success mode
    expect(Api.isSimulationError((await rpc.simulateTransaction({} as any)) as any)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Verify vi.fn() identity — mock functions are real Vitest mock functions
// ---------------------------------------------------------------------------
describe('mock function identity', () => {
  it('all RPC methods expose toHaveBeenCalled matchers', () => {
    const methods = [
      'getAccount',
      'simulateTransaction',
      'sendTransaction',
      'getTransaction',
      'getNetwork',
      'getLatestLedger',
      'getLedger',
      'getFeeStats',
      'getEvents',
    ] as const;

    for (const method of methods) {
      expect(vi.isMockFunction(rpc[method])).toBe(true);
    }
  });
});
