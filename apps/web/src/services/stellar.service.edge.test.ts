/**
 * Edge-case tests for StellarService
 *
 * Covers scenarios not exercised by the baseline stellar.service.test.ts:
 *  - RPC timeouts during account loading, simulation, submission, and polling
 *  - Insufficient funds (withdraw amount > withdrawable)
 *  - Simulation failures (contract errors, malformed responses)
 *  - Transaction submission errors (ERROR status, on-chain FAILED)
 *  - Transaction timeout (polling exhaustion)
 *  - Validation edge cases for createStream, distribute, distributeEqual
 *  - parseError mapping for various error shapes
 *  - Error class properties (TransactionTimeoutError, SimulationError, etc.)
 */

// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Networks } from '@stellar/stellar-sdk';
import { StellarService, createTestnetService } from './stellar.service';
import {
  ValidationError,
  InsufficientFundsError,
  AccountNotFoundError,
  NetworkError,
  TransactionError,
  TransactionTimeoutError,
  SimulationError,
  ContractError,
  StreamNotFoundError,
  StellarError,
  parseError,
} from './errors';
import type {
  StellarServiceConfig,
  CreateStreamParams,
  DistributeParams,
  DistributeEqualParams,
} from './types';

// ---------------------------------------------------------------------------
// Hoist mock variables so they are available inside vi.mock() factories
// ---------------------------------------------------------------------------
const {
  mockLoadAccount,
  mockGetAccount,
  mockSimulateTransaction,
  mockSendTransaction,
  mockGetTransaction,
  mockGetEvents,
  mockScValToNative,
} = vi.hoisted(() => ({
  mockLoadAccount: vi.fn(),
  mockGetAccount: vi.fn(),
  mockSimulateTransaction: vi.fn(),
  mockSendTransaction: vi.fn(),
  mockGetTransaction: vi.fn(),
  mockGetEvents: vi.fn(),
  mockScValToNative: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock withRetry to execute the function once with no retries or delays.
// This keeps tests fast — the real implementation retries up to 3 times with
// exponential back-off which would make each failing test take 7+ seconds.
// ---------------------------------------------------------------------------
vi.mock('@/utils/retry', async () => {
  const actual = await vi.importActual<typeof import('@/utils/retry')>('@/utils/retry');
  return {
    ...actual,
    withRetry: vi.fn(async (fn: () => Promise<unknown>) => fn()),
    withAbortSignal: vi.fn((p: Promise<unknown>) => p),
  };
});

vi.mock('@stellar/stellar-sdk/rpc', () => ({
  Server: vi.fn().mockImplementation(() => ({
    getAccount: mockGetAccount,
    simulateTransaction: mockSimulateTransaction,
    sendTransaction: mockSendTransaction,
    getTransaction: mockGetTransaction,
    getEvents: mockGetEvents,
  })),
  Api: {
    isSimulationError: vi.fn((r: Record<string, unknown>) => r?.error !== undefined),
    isSimulationSuccess: vi.fn((r: Record<string, unknown>) => r?.error === undefined),
    GetTransactionStatus: {
      NOT_FOUND: 'NOT_FOUND',
      SUCCESS: 'SUCCESS',
      FAILED: 'FAILED',
    },
  },
  assembleTransaction: vi.fn().mockReturnValue({
    build: vi.fn().mockReturnValue({
      sign: vi.fn(),
      toEnvelope: vi.fn(() => ({ toXDR: vi.fn(() => 'base64xdr') })),
    }),
  }),
}));

vi.mock('@stellar/stellar-sdk', async () => {
  const actual = await vi.importActual('@stellar/stellar-sdk');
  const mockTx = {
    sign: vi.fn(),
    toEnvelope: vi.fn(() => ({ toXDR: vi.fn(() => 'base64xdr') })),
  };
  return {
    ...actual,
    scValToNative: mockScValToNative,
    Horizon: {
      Server: vi.fn().mockImplementation(() => ({
        loadAccount: mockLoadAccount,
      })),
    },
    TransactionBuilder: vi.fn().mockImplementation(() => ({
      addOperation: vi.fn().mockReturnThis(),
      setTimeout: vi.fn().mockReturnThis(),
      build: vi.fn(() => mockTx),
    })),
    Operation: {
      invokeHostFunction: vi.fn(() => ({})),
    },
    Address: vi.fn().mockImplementation((addr: string) => ({
      addr,
      toScVal: vi.fn(() => ({ type: 'scvAddress', value: addr })),
      toScAddress: vi.fn(() => ({ type: 'scAddress', value: addr })),
    })),
    nativeToScVal: vi.fn((val: unknown) => ({ type: 'scvNative', value: val })),
    xdr: {
      ScVal: {
        scvVec: vi.fn((vals: unknown[]) => ({ type: 'scvVec', value: vals })),
      },
      HostFunction: {
        hostFunctionTypeInvokeContract: vi.fn(() => ({})),
      },
      InvokeContractArgs: vi.fn(() => ({})),
    },
    Account: vi.fn().mockImplementation((id: string, seq: string) => ({
      accountId: () => id,
      sequenceNumber: () => seq,
      incrementSequenceNumber: vi.fn(),
    })),
  };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const TEST_CONFIG: StellarServiceConfig = {
  network: {
    networkPassphrase: Networks.TESTNET,
    rpcUrl: 'https://soroban-testnet.stellar.org',
    horizonUrl: 'https://horizon-testnet.stellar.org',
  },
  contracts: {
    paymentStream: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM',
    distributor: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHK3M',
  },
  defaultTimeout: 30,
  maxRetries: 0,
};

// Valid Stellar addresses (G + 55 base32 chars)
const VALID_ADDRESS = 'GADOJRIVAOOOQ65ITAOARSZZYBV237L35CO7RXFWJCCWQ2FDNWQJZ5UK';
const VALID_TOKEN   = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM';
const VALID_RECIPIENT = 'GDIT5L4H65DJRJXWRWROM5Y5NI35FJHDSGWB5N5RVGWRHD5G5BZ7EOF3';

const VALID_STREAM_PARAMS: CreateStreamParams = {
  recipient: VALID_RECIPIENT,
  token: VALID_TOKEN,
  totalAmount: 1000n,
  startTime: 1000n,
  endTime: 2000n,
};

const VALID_DISTRIBUTE_PARAMS: DistributeParams = {
  recipients: [VALID_RECIPIENT],
  amounts: [500n],
  token: VALID_TOKEN,
};

const VALID_DISTRIBUTE_EQUAL_PARAMS: DistributeEqualParams = {
  recipients: [VALID_RECIPIENT],
  totalAmount: 1000n,
  token: VALID_TOKEN,
};

const mockRpcAccount = {
  id: VALID_ADDRESS,
  sequenceNumber: () => '100',
  incrementSequenceNumber: vi.fn(),
};

const mockSimSuccess = {
  transactionData: 'base64data',
  minResourceFee: '1000',
  result: { retval: { type: 'scvU64', value: 42n } },
};

const mockSendPending = { status: 'PENDING', hash: 'txhash_abc' };
const mockTxSuccess   = { status: 'SUCCESS', ledger: 42, returnValue: null };

// Convenience: a minimal keypair-like object
const makeKeypair = () =>
  ({ publicKey: () => VALID_ADDRESS, sign: vi.fn() } as unknown as import('@stellar/stellar-sdk').Keypair);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('StellarService — edge cases', () => {
  let service: StellarService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new StellarService(TEST_CONFIG);

    mockLoadAccount.mockResolvedValue({
      accountId: () => VALID_ADDRESS,
      sequenceNumber: () => '100',
      balances: [],
    });
    mockGetAccount.mockResolvedValue(mockRpcAccount);
    mockSimulateTransaction.mockResolvedValue(mockSimSuccess);
    mockSendTransaction.mockResolvedValue(mockSendPending);
    mockGetTransaction.mockResolvedValue(mockTxSuccess);
    mockGetEvents.mockResolvedValue({ events: [] });
    mockScValToNative.mockReturnValue(null);
  });

  // ── getAccount ─────────────────────────────────────────────────────────────
  describe('getAccount', () => {
    it('throws AccountNotFoundError on 404 response', async () => {
      mockLoadAccount.mockRejectedValue(
        Object.assign(new Error('Not Found'), { response: { status: 404 } })
      );
      await expect(service.getAccount(VALID_ADDRESS)).rejects.toThrow(AccountNotFoundError);
    });

    it('AccountNotFoundError carries the account ID', async () => {
      mockLoadAccount.mockRejectedValue(
        Object.assign(new Error('Not Found'), { response: { status: 404 } })
      );
      try {
        await service.getAccount(VALID_ADDRESS);
        expect.fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AccountNotFoundError);
        expect((err as AccountNotFoundError).accountId).toBe(VALID_ADDRESS);
      }
    });

    it('throws StellarError on ECONNREFUSED', async () => {
      mockLoadAccount.mockRejectedValue(new Error('ECONNREFUSED'));
      await expect(service.getAccount(VALID_ADDRESS)).rejects.toThrow(StellarError);
    });

    it('throws StellarError on ETIMEDOUT', async () => {
      mockLoadAccount.mockRejectedValue(new Error('ETIMEDOUT'));
      await expect(service.getAccount(VALID_ADDRESS)).rejects.toThrow(StellarError);
    });
  });

  // ── accountExists ──────────────────────────────────────────────────────────
  describe('accountExists', () => {
    it('returns false when loadAccount throws any error', async () => {
      mockLoadAccount.mockRejectedValue(new Error('Network error'));
      expect(await service.accountExists(VALID_ADDRESS)).toBe(false);
    });

    it('returns true when loadAccount succeeds', async () => {
      mockLoadAccount.mockResolvedValue({ accountId: () => VALID_ADDRESS, balances: [] });
      expect(await service.accountExists(VALID_ADDRESS)).toBe(true);
    });
  });

  // ── createStream — RPC failures ────────────────────────────────────────────
  describe('createStream — RPC failures', () => {
    it('throws SimulationError when simulation returns an error', async () => {
      mockSimulateTransaction.mockResolvedValue({ error: 'HostError: contract error' });
      await expect(service.createStream(VALID_STREAM_PARAMS, makeKeypair()))
        .rejects.toThrow(SimulationError);
    });

    it('throws ContractError when getAccount (RPC) throws', async () => {
      mockGetAccount.mockRejectedValue(new Error('ETIMEDOUT'));
      await expect(service.createStream(VALID_STREAM_PARAMS, makeKeypair()))
        .rejects.toThrow(ContractError);
    });

    it('throws ContractError when simulateTransaction throws a network error', async () => {
      mockSimulateTransaction.mockRejectedValue(new Error('socket hang up'));
      await expect(service.createStream(VALID_STREAM_PARAMS, makeKeypair()))
        .rejects.toThrow(ContractError);
    });

    it('throws TransactionError when sendTransaction returns ERROR status', async () => {
      mockSendTransaction.mockResolvedValue({
        status: 'ERROR',
        hash: 'err_hash',
        errorResult: { result: () => ({ switch: () => ({ name: 'txFailed' }) }) },
      });
      await expect(service.createStream(VALID_STREAM_PARAMS, makeKeypair()))
        .rejects.toThrow(TransactionError);
    });

    it('throws TransactionTimeoutError when polling exhausts timeout', async () => {
      const fastService = new StellarService({ ...TEST_CONFIG, defaultTimeout: 0 });
      mockSendTransaction.mockResolvedValue({ status: 'PENDING', hash: 'slow_tx' });
      mockGetTransaction.mockResolvedValue({ status: 'NOT_FOUND' });
      await expect(fastService.createStream(VALID_STREAM_PARAMS, makeKeypair()))
        .rejects.toThrow(TransactionTimeoutError);
    });

    it('throws TransactionError when on-chain transaction fails', async () => {
      mockSendTransaction.mockResolvedValue({ status: 'PENDING', hash: 'fail_tx' });
      mockGetTransaction.mockResolvedValue({
        status: 'FAILED',
        resultXdr: { result: () => ({ switch: () => ({ name: 'txFailed' }) }) },
      });
      await expect(service.createStream(VALID_STREAM_PARAMS, makeKeypair()))
        .rejects.toThrow(TransactionError);
    });
  });

  // ── withdraw — validation ──────────────────────────────────────────────────
  describe('withdraw — validation', () => {
    it('throws ValidationError for zero withdraw amount', async () => {
      await expect(service.withdraw(1n, 0n, makeKeypair())).rejects.toThrow(ValidationError);
    });

    it('throws ValidationError for negative withdraw amount', async () => {
      await expect(service.withdraw(1n, -1n, makeKeypair())).rejects.toThrow(ValidationError);
    });

    it('throws InsufficientFundsError when requested amount > withdrawable', async () => {
      // scValToNative is called inside invokeContractReadOnly to decode the result
      mockScValToNative.mockReturnValueOnce(50n); // withdrawable = 50n
      await expect(service.withdraw(1n, 100n, makeKeypair()))
        .rejects.toThrow(InsufficientFundsError);
    });

    it('InsufficientFundsError carries required and available amounts', async () => {
      mockScValToNative.mockReturnValueOnce(10n); // withdrawable = 10n
      try {
        await service.withdraw(1n, 500n, makeKeypair());
        expect.fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(InsufficientFundsError);
        expect((err as InsufficientFundsError).required).toBe(500n);
        expect((err as InsufficientFundsError).available).toBe(10n);
      }
    });
  });

  // ── distribute — validation ────────────────────────────────────────────────
  describe('distribute — validation edge cases', () => {
    it('rejects when recipients array is empty', async () => {
      await expect(
        service.distribute({ ...VALID_DISTRIBUTE_PARAMS, recipients: [] }, makeKeypair())
      ).rejects.toThrow(ValidationError);
    });

    it('rejects when amounts array is empty', async () => {
      await expect(
        service.distribute({ ...VALID_DISTRIBUTE_PARAMS, amounts: [] }, makeKeypair())
      ).rejects.toThrow(ValidationError);
    });

    it('rejects when a recipient address is invalid', async () => {
      await expect(
        service.distribute({ ...VALID_DISTRIBUTE_PARAMS, recipients: ['INVALID'] }, makeKeypair())
      ).rejects.toThrow(ValidationError);
    });

    it('rejects when one amount is zero', async () => {
      await expect(
        service.distribute({ ...VALID_DISTRIBUTE_PARAMS, amounts: [0n] }, makeKeypair())
      ).rejects.toThrow(ValidationError);
    });

    it('rejects when one amount is negative', async () => {
      await expect(
        service.distribute({ ...VALID_DISTRIBUTE_PARAMS, amounts: [-100n] }, makeKeypair())
      ).rejects.toThrow(ValidationError);
    });

    it('rejects when token address is invalid', async () => {
      await expect(
        service.distribute({ ...VALID_DISTRIBUTE_PARAMS, token: 'BAD_TOKEN' }, makeKeypair())
      ).rejects.toThrow(ValidationError);
    });

    it('rejects when recipients and amounts lengths differ', async () => {
      await expect(
        service.distribute(
          { ...VALID_DISTRIBUTE_PARAMS, recipients: [VALID_RECIPIENT, VALID_ADDRESS], amounts: [100n] },
          makeKeypair()
        )
      ).rejects.toThrow(ValidationError);
    });
  });

  // ── distributeEqual — validation ───────────────────────────────────────────
  describe('distributeEqual — validation edge cases', () => {
    it('rejects when recipients array is empty', async () => {
      await expect(
        service.distributeEqual({ ...VALID_DISTRIBUTE_EQUAL_PARAMS, recipients: [] }, makeKeypair())
      ).rejects.toThrow(ValidationError);
    });

    it('rejects when totalAmount is zero', async () => {
      await expect(
        service.distributeEqual({ ...VALID_DISTRIBUTE_EQUAL_PARAMS, totalAmount: 0n }, makeKeypair())
      ).rejects.toThrow(ValidationError);
    });

    it('rejects when totalAmount is negative', async () => {
      await expect(
        service.distributeEqual({ ...VALID_DISTRIBUTE_EQUAL_PARAMS, totalAmount: -1n }, makeKeypair())
      ).rejects.toThrow(ValidationError);
    });

    it('rejects when a recipient address is invalid', async () => {
      await expect(
        service.distributeEqual(
          { ...VALID_DISTRIBUTE_EQUAL_PARAMS, recipients: ['NOT_AN_ADDRESS'] },
          makeKeypair()
        )
      ).rejects.toThrow(ValidationError);
    });

    it('rejects when token address is invalid', async () => {
      await expect(
        service.distributeEqual({ ...VALID_DISTRIBUTE_EQUAL_PARAMS, token: 'BAD' }, makeKeypair())
      ).rejects.toThrow(ValidationError);
    });
  });

  // ── createStream — address validation ─────────────────────────────────────
  describe('createStream — address validation', () => {
    it('rejects when recipient is an empty string', async () => {
      await expect(
        service.createStream({ ...VALID_STREAM_PARAMS, recipient: '' }, makeKeypair())
      ).rejects.toThrow(ValidationError);
    });

    it('rejects when token is an empty string', async () => {
      await expect(
        service.createStream({ ...VALID_STREAM_PARAMS, token: '' }, makeKeypair())
      ).rejects.toThrow(ValidationError);
    });

    it('rejects when totalAmount is exactly 0', async () => {
      await expect(
        service.createStream({ ...VALID_STREAM_PARAMS, totalAmount: 0n }, makeKeypair())
      ).rejects.toThrow(ValidationError);
    });

    it('rejects when startTime equals endTime', async () => {
      await expect(
        service.createStream({ ...VALID_STREAM_PARAMS, startTime: 1000n, endTime: 1000n }, makeKeypair())
      ).rejects.toThrow(ValidationError);
    });

    it('rejects when endTime is before startTime', async () => {
      await expect(
        service.createStream({ ...VALID_STREAM_PARAMS, startTime: 2000n, endTime: 1000n }, makeKeypair())
      ).rejects.toThrow(ValidationError);
    });

    it('rejects an address starting with X', async () => {
      await expect(
        service.createStream({ ...VALID_STREAM_PARAMS, recipient: 'X' + 'A'.repeat(55) }, makeKeypair())
      ).rejects.toThrow(ValidationError);
    });

    it('rejects an address containing lowercase letters', async () => {
      await expect(
        service.createStream({ ...VALID_STREAM_PARAMS, recipient: 'g' + 'a'.repeat(55) }, makeKeypair())
      ).rejects.toThrow(ValidationError);
    });

    it('rejects an address containing invalid base32 digits (0, 1, 8, 9)', async () => {
      await expect(
        service.createStream({ ...VALID_STREAM_PARAMS, recipient: 'G' + '0'.repeat(55) }, makeKeypair())
      ).rejects.toThrow(ValidationError);
    });
  });

  // ── Error class properties ─────────────────────────────────────────────────
  describe('TransactionTimeoutError', () => {
    it('carries the transaction hash', () => {
      const err = new TransactionTimeoutError('tx_hash_123');
      expect(err.txHash).toBe('tx_hash_123');
      expect(err).toBeInstanceOf(TransactionError);
      expect(err).toBeInstanceOf(StellarError);
    });

    it('message contains "timed out"', () => {
      expect(new TransactionTimeoutError('h').message).toContain('timed out');
    });
  });

  describe('SimulationError', () => {
    it('carries the simulation result and correct code', () => {
      const simResult = { error: 'HostError: value error' };
      const err = new SimulationError('Simulation failed', simResult);
      expect(err.simulationResult).toEqual(simResult);
      expect(err.code).toBe('SIMULATION_ERROR');
    });
  });

  describe('ContractError', () => {
    it('carries contractId and method', () => {
      const err = new ContractError('failed', { contractId: 'CABC', method: 'create_stream' });
      expect(err.contractId).toBe('CABC');
      expect(err.method).toBe('create_stream');
      expect(err.code).toBe('CONTRACT_ERROR');
    });
  });

  describe('StreamNotFoundError', () => {
    it('carries the stream ID in the message', () => {
      const err = new StreamNotFoundError(42n);
      expect(err.streamId).toBe(42n);
      expect(err.message).toContain('42');
    });
  });
});

// ---------------------------------------------------------------------------
// parseError utility — edge cases
// ---------------------------------------------------------------------------
describe('parseError — edge cases', () => {
  it('returns the same StellarError instance unchanged', () => {
    const original = new StellarError('test', 'TEST_CODE');
    expect(parseError(original)).toBe(original);
  });

  it('maps ECONNREFUSED to NetworkError', () => {
    expect(parseError(new Error('ECONNREFUSED'))).toBeInstanceOf(NetworkError);
  });

  it('maps ETIMEDOUT to NetworkError', () => {
    expect(parseError(new Error('ETIMEDOUT'))).toBeInstanceOf(NetworkError);
  });

  it('maps "fetch" errors to NetworkError', () => {
    expect(parseError(new Error('Failed to fetch'))).toBeInstanceOf(NetworkError);
  });

  it('maps "network" errors to NetworkError', () => {
    expect(parseError(new Error('network error'))).toBeInstanceOf(NetworkError);
  });

  it('maps "timeout" errors to TransactionTimeoutError', () => {
    expect(parseError(new Error('Request timeout'))).toBeInstanceOf(TransactionTimeoutError);
  });

  it('maps "504" errors to TransactionTimeoutError', () => {
    expect(parseError(new Error('504 Gateway Timeout'))).toBeInstanceOf(TransactionTimeoutError);
  });

  it('maps "insufficient" errors to InsufficientFundsError', () => {
    expect(parseError(new Error('insufficient balance'))).toBeInstanceOf(InsufficientFundsError);
  });

  it('maps "op_underfunded" to InsufficientFundsError', () => {
    expect(parseError(new Error('op_underfunded'))).toBeInstanceOf(InsufficientFundsError);
  });

  it('maps "op_low_reserve" to InsufficientFundsError', () => {
    expect(parseError(new Error('op_low_reserve'))).toBeInstanceOf(InsufficientFundsError);
  });

  it('maps errors with result_codes array to TransactionError', () => {
    const err = parseError(
      Object.assign(new Error('tx failed'), {
        response: { data: { extras: { result_codes: ['tx_bad_auth'] } } },
      })
    );
    expect(err).toBeInstanceOf(TransactionError);
    expect((err as TransactionError).resultCodes).toContain('tx_bad_auth');
  });

  it('maps result_codes as a non-array string to TransactionError', () => {
    const err = parseError(
      Object.assign(new Error('tx failed'), {
        response: { data: { extras: { result_codes: 'tx_bad_seq' } } },
      })
    );
    expect(err).toBeInstanceOf(TransactionError);
  });

  it('returns a generic StellarError with UNKNOWN_ERROR for unrecognized errors', () => {
    const err = parseError(new Error('Something completely unexpected'));
    expect(err).toBeInstanceOf(StellarError);
    expect(err.code).toBe('UNKNOWN_ERROR');
  });

  it('handles null gracefully', () => {
    expect(parseError(null)).toBeInstanceOf(StellarError);
  });

  it('handles undefined gracefully', () => {
    expect(parseError(undefined)).toBeInstanceOf(StellarError);
  });

  it('handles a plain object gracefully', () => {
    expect(parseError({ code: 500, message: 'server error' })).toBeInstanceOf(StellarError);
  });

  it('handles a string error gracefully', () => {
    expect(parseError('something went wrong')).toBeInstanceOf(StellarError);
  });

  it('maps "Account not found" to AccountNotFoundError', () => {
    expect(parseError(new Error('Account not found: GABC'))).toBeInstanceOf(AccountNotFoundError);
  });
});

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------
describe('StellarService factory functions', () => {
  it('createTestnetService creates a StellarService instance', () => {
    const svc = createTestnetService({
      paymentStream: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM',
      distributor: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHK3M',
    });
    expect(svc).toBeInstanceOf(StellarService);
  });
});
