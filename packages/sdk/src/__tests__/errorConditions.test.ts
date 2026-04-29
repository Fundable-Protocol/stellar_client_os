/**
 * Unit tests for SDK error conditions — Issue #163
 *
 * Covers the three scenarios requested in the issue:
 *  1. Invalid WASM (empty, too short, wrong magic bytes)
 *  2. RPC timeouts (simulation, submission, polling)
 *  3. Insufficient funds / unfunded accounts
 *
 * All RPC interactions are mocked — no real network calls are made.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContractDeployer } from '../deployer/ContractDeployer';
import {
  DeployerError,
  InvalidWasmError,
  DeployerAccountError,
  WasmUploadError,
  FeeEstimationError,
  DeploymentTimeoutError,
} from '../deployer/errors';
import {
  parseContractError,
  FundableStellarError,
  executeWithErrorHandling,
} from '../utils/errors';

// ---------------------------------------------------------------------------
// RPC mock setup
// ---------------------------------------------------------------------------
const {
  mockGetAccount,
  mockSimulateTransaction,
  mockSendTransaction,
  mockGetTransaction,
  mockGetNetwork,
} = vi.hoisted(() => ({
  mockGetAccount: vi.fn(),
  mockSimulateTransaction: vi.fn(),
  mockSendTransaction: vi.fn(),
  mockGetTransaction: vi.fn(),
  mockGetNetwork: vi.fn(),
}));

vi.mock('@stellar/stellar-sdk/rpc', () => ({
  Server: vi.fn().mockReturnValue({
    getAccount: mockGetAccount,
    simulateTransaction: mockSimulateTransaction,
    sendTransaction: mockSendTransaction,
    getTransaction: mockGetTransaction,
    getNetwork: mockGetNetwork,
  }),
  Api: {
    isSimulationError: vi.fn((r: Record<string, unknown>) => r?.error !== undefined),
    isSimulationSuccess: vi.fn((r: Record<string, unknown>) => r?.error === undefined),
    GetTransactionStatus: {
      NOT_FOUND: 'NOT_FOUND',
      SUCCESS: 'SUCCESS',
      FAILED: 'FAILED',
    },
  },
}));

vi.mock('@stellar/stellar-sdk', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@stellar/stellar-sdk');
  const mockTx = {
    sign: vi.fn(),
    toEnvelope: vi.fn(() => ({ toXDR: vi.fn(() => 'base64xdr') })),
  };
  return {
    ...actual,
    TransactionBuilder: vi.fn().mockImplementation(() => ({
      addOperation: vi.fn().mockReturnThis(),
      setTimeout: vi.fn().mockReturnThis(),
      build: vi.fn(() => mockTx),
    })),
    Operation: {
      uploadContractWasm: vi.fn(() => ({})),
      createCustomContract: vi.fn(() => ({})),
    },
    xdr: {
      ...((actual as Record<string, unknown>).xdr as object),
      SorobanTransactionData: {
        fromXDR: vi.fn(() => ({
          resources: vi.fn(() => ({
            instructions: vi.fn(() => 500_000),
            readBytes: vi.fn(() => 1024),
            writeBytes: vi.fn(() => 512),
            footprint: vi.fn(() => ({
              readOnly: vi.fn(() => []),
              readWrite: vi.fn(() => []),
            })),
          })),
        })),
      },
      TransactionEnvelope: { fromXDR: vi.fn(() => ({})) },
      HashIdPreimage: {
        envelopeTypeContractId: vi.fn(() => ({ toXDR: vi.fn(() => Buffer.alloc(32)) })),
      },
      HashIdPreimageContractId: vi.fn(() => ({})),
      ContractIdPreimage: { contractIdPreimageFromAddress: vi.fn(() => ({})) },
      ContractIdPreimageFromAddress: vi.fn(() => ({})),
    },
    hash: vi.fn(() => Buffer.alloc(32, 0xab)),
    Address: vi.fn().mockImplementation(() => ({
      toScVal: vi.fn(),
      toScAddress: vi.fn(),
    })),
    StrKey: {
      encodeContract: vi.fn(() => 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM'),
    },
  };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
/** Valid WASM: magic number 0x00 0x61 0x73 0x6D + version */
const VALID_WASM = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
const DEPLOYER_ADDRESS = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const WASM_HASH = 'a'.repeat(64);

const mockAccount = { id: DEPLOYER_ADDRESS, sequenceNumber: () => '100' };
const mockSimSuccess = { transactionData: 'base64data', minResourceFee: '1000' };
const mockSendPending = { status: 'PENDING', hash: 'txhash_001' };
const mockTxSuccess = { status: 'SUCCESS', ledger: 10, feeCharged: '150' };

const mockKeypair = {
  publicKey: () => DEPLOYER_ADDRESS,
  sign: vi.fn(),
} as unknown as import('@stellar/stellar-sdk').Keypair;

function makeDeployer(overrides?: Partial<{ timeoutSeconds: number; baseFee: string }>) {
  return new ContractDeployer({
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
    ...overrides,
  });
}

beforeEach(() => {
  mockGetAccount.mockReset();
  mockSimulateTransaction.mockReset();
  mockSendTransaction.mockReset();
  mockGetTransaction.mockReset();
  mockGetNetwork.mockReset();

  // Default happy-path stubs
  mockGetAccount.mockResolvedValue(mockAccount);
  mockSimulateTransaction.mockResolvedValue(mockSimSuccess);
  mockSendTransaction.mockResolvedValue(mockSendPending);
  mockGetTransaction.mockResolvedValue(mockTxSuccess);
});

// ===========================================================================
// 1. INVALID WASM
// ===========================================================================
describe('Invalid WASM', () => {
  let deployer: ContractDeployer;

  beforeEach(() => {
    deployer = makeDeployer();
  });

  it('rejects an empty Buffer with InvalidWasmError', async () => {
    await expect(deployer.uploadWasm(Buffer.alloc(0), mockKeypair))
      .rejects.toThrow(InvalidWasmError);
  });

  it('rejects a Buffer shorter than 4 bytes (no room for magic)', async () => {
    const tooShort = Buffer.from([0x00, 0x61, 0x73]); // only 3 bytes
    await expect(deployer.uploadWasm(tooShort, mockKeypair))
      .rejects.toThrow(InvalidWasmError);
  });

  it('rejects a Buffer with wrong magic bytes (0xDEADBEEF)', async () => {
    const wrongMagic = Buffer.from([0xde, 0xad, 0xbe, 0xef, 0x01, 0x00, 0x00, 0x00]);
    await expect(deployer.uploadWasm(wrongMagic, mockKeypair))
      .rejects.toThrow(InvalidWasmError);
  });

  it('rejects a Buffer where only the first magic byte is correct', async () => {
    const partialMagic = Buffer.from([0x00, 0xff, 0xff, 0xff, 0x01, 0x00, 0x00, 0x00]);
    await expect(deployer.uploadWasm(partialMagic, mockKeypair))
      .rejects.toThrow(InvalidWasmError);
  });

  it('rejects invalid WASM in estimateUploadFee too', async () => {
    const wrongMagic = Buffer.from([0xde, 0xad, 0xbe, 0xef, 0x01, 0x00, 0x00, 0x00]);
    await expect(deployer.estimateUploadFee(wrongMagic, mockKeypair))
      .rejects.toThrow(InvalidWasmError);
  });

  it('accepts a valid Uint8Array with correct magic number', async () => {
    const validU8 = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
    await expect(deployer.uploadWasm(validU8, mockKeypair)).resolves.toHaveProperty('wasmHash');
  });

  it('InvalidWasmError has code INVALID_WASM and extends DeployerError', () => {
    const err = new InvalidWasmError('bad wasm');
    expect(err.code).toBe('INVALID_WASM');
    expect(err.name).toBe('InvalidWasmError');
    expect(err).toBeInstanceOf(DeployerError);
    expect(err).toBeInstanceOf(Error);
  });

  it('InvalidWasmError default message is descriptive', () => {
    const err = new InvalidWasmError();
    expect(err.message.length).toBeGreaterThan(0);
  });

  it('does not call RPC when WASM is invalid (fails fast)', async () => {
    await expect(deployer.uploadWasm(Buffer.alloc(0), mockKeypair)).rejects.toThrow(InvalidWasmError);
    expect(mockGetAccount).not.toHaveBeenCalled();
    expect(mockSimulateTransaction).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 2. RPC TIMEOUTS
// ===========================================================================
describe('RPC timeouts', () => {
  let deployer: ContractDeployer;

  beforeEach(() => {
    deployer = makeDeployer();
  });

  // ── Simulation timeouts ────────────────────────────────────────────────────
  describe('simulation timeouts', () => {
    it('throws FeeEstimationError when simulateTransaction times out (ETIMEDOUT)', async () => {
      mockSimulateTransaction.mockRejectedValue(
        Object.assign(new Error('Request timed out'), { code: 'ETIMEDOUT' }),
      );
      await expect(deployer.estimateUploadFee(VALID_WASM, mockKeypair))
        .rejects.toThrow(FeeEstimationError);
    });

    it('FeeEstimationError message includes the original timeout reason', async () => {
      mockSimulateTransaction.mockRejectedValue(new Error('ETIMEDOUT'));
      try {
        await deployer.estimateUploadFee(VALID_WASM, mockKeypair);
        expect.fail('should have thrown');
      } catch (err) {
        expect((err as FeeEstimationError).message).toContain('ETIMEDOUT');
      }
    });

    it('throws FeeEstimationError on ECONNREFUSED during simulation', async () => {
      mockSimulateTransaction.mockRejectedValue(new Error('ECONNREFUSED'));
      await expect(deployer.estimateUploadFee(VALID_WASM, mockKeypair))
        .rejects.toThrow(FeeEstimationError);
    });

    it('throws FeeEstimationError when simulation returns an error response', async () => {
      mockSimulateTransaction.mockResolvedValue({ error: 'HostError: value error' });
      await expect(deployer.estimateUploadFee(VALID_WASM, mockKeypair))
        .rejects.toThrow(FeeEstimationError);
    });

    it('throws FeeEstimationError on deploy simulation timeout', async () => {
      mockSimulateTransaction.mockRejectedValue(new Error('socket hang up'));
      await expect(deployer.estimateDeployFee(WASM_HASH, mockKeypair))
        .rejects.toThrow(FeeEstimationError);
    });

    it('FeeEstimationError has code FEE_ESTIMATION_ERROR', () => {
      const err = new FeeEstimationError('sim failed');
      expect(err.code).toBe('FEE_ESTIMATION_ERROR');
      expect(err).toBeInstanceOf(DeployerError);
    });
  });

  // ── Submission timeouts ────────────────────────────────────────────────────
  describe('submission timeouts', () => {
    it('throws WasmUploadError when sendTransaction times out', async () => {
      mockSendTransaction.mockRejectedValue(new Error('ETIMEDOUT'));
      await expect(deployer.uploadWasm(VALID_WASM, mockKeypair))
        .rejects.toThrow(WasmUploadError);
    });

    it('throws DeployerError when sendTransaction returns ERROR status', async () => {
      mockSendTransaction.mockResolvedValue({ status: 'ERROR', errorResult: null });
      await expect(deployer.uploadWasm(VALID_WASM, mockKeypair))
        .rejects.toThrow(DeployerError);
    });

    it('throws DeployerError when sendTransaction returns ERROR with XDR result', async () => {
      mockSendTransaction.mockResolvedValue({
        status: 'ERROR',
        errorResult: { toXDR: () => 'base64errorxdr' },
      });
      await expect(deployer.uploadWasm(VALID_WASM, mockKeypair))
        .rejects.toThrow(DeployerError);
    });
  });

  // ── Polling timeouts ───────────────────────────────────────────────────────
  describe('polling timeouts', () => {
    it('throws DeploymentTimeoutError when polling always returns NOT_FOUND', async () => {
      mockGetTransaction.mockResolvedValue({ status: 'NOT_FOUND' });
      const fastDeployer = makeDeployer({ timeoutSeconds: 0 });
      await expect(fastDeployer.uploadWasm(VALID_WASM, mockKeypair))
        .rejects.toThrow(DeploymentTimeoutError);
    });

    it('DeploymentTimeoutError carries the transaction hash', async () => {
      mockSendTransaction.mockResolvedValue({ status: 'PENDING', hash: 'timeout_tx_hash' });
      mockGetTransaction.mockResolvedValue({ status: 'NOT_FOUND' });
      const fastDeployer = makeDeployer({ timeoutSeconds: 0 });
      try {
        await fastDeployer.uploadWasm(VALID_WASM, mockKeypair);
        expect.fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(DeploymentTimeoutError);
        expect((err as DeploymentTimeoutError).txHash).toBe('timeout_tx_hash');
      }
    });

    it('DeploymentTimeoutError message includes the tx hash', () => {
      const err = new DeploymentTimeoutError('abc123');
      expect(err.message).toContain('abc123');
      expect(err.code).toBe('DEPLOYMENT_TIMEOUT');
    });

    it('throws DeployerError when getTransaction returns FAILED', async () => {
      mockGetTransaction.mockResolvedValue({ status: 'FAILED' });
      await expect(deployer.uploadWasm(VALID_WASM, mockKeypair))
        .rejects.toThrow(DeployerError);
    });

    it('throws DeploymentTimeoutError for deployContract when polling times out', async () => {
      mockGetTransaction.mockResolvedValue({ status: 'NOT_FOUND' });
      const fastDeployer = makeDeployer({ timeoutSeconds: 0 });
      await expect(fastDeployer.deployContract(WASM_HASH, mockKeypair))
        .rejects.toThrow(DeploymentTimeoutError);
    });

    it('succeeds when first poll is NOT_FOUND then SUCCESS', async () => {
      mockGetTransaction
        .mockResolvedValueOnce({ status: 'NOT_FOUND' })
        .mockResolvedValueOnce({ status: 'SUCCESS', ledger: 55, feeCharged: '300' });
      const result = await deployer.uploadWasm(VALID_WASM, mockKeypair);
      expect(result).toHaveProperty('wasmHash');
    });
  });

  // ── RPC timeout via executeWithErrorHandling ───────────────────────────────
  describe('RPC timeout via executeWithErrorHandling', () => {
    it('wraps an RPC timeout error as FundableStellarError', async () => {
      const rpcTimeout = async () => {
        throw Object.assign(new Error('Request timed out'), { code: 'ETIMEDOUT' });
      };
      await expect(executeWithErrorHandling(rpcTimeout))
        .rejects.toBeInstanceOf(FundableStellarError);
    });

    it('wraps a connection refused error as FundableStellarError', async () => {
      const rpcRefused = async () => {
        throw new Error('ECONNREFUSED connect ECONNREFUSED 127.0.0.1:8000');
      };
      await expect(executeWithErrorHandling(rpcRefused))
        .rejects.toBeInstanceOf(FundableStellarError);
    });

    it('wraps a rejected promise (not thrown) as FundableStellarError', async () => {
      const op = () => Promise.reject(new Error('network error'));
      await expect(executeWithErrorHandling(op))
        .rejects.toBeInstanceOf(FundableStellarError);
    });
  });
});

// ===========================================================================
// 3. INSUFFICIENT FUNDS / ACCOUNT ERRORS
// ===========================================================================
describe('Insufficient funds and account errors', () => {
  let deployer: ContractDeployer;

  beforeEach(() => {
    deployer = makeDeployer();
  });

  // ── Unfunded / missing account ─────────────────────────────────────────────
  describe('unfunded account', () => {
    it('throws DeployerAccountError when account is not found (404)', async () => {
      mockGetAccount.mockRejectedValue(
        Object.assign(new Error('Account not found'), { response: { status: 404 } }),
      );
      await expect(deployer.uploadWasm(VALID_WASM, mockKeypair))
        .rejects.toThrow(DeployerAccountError);
    });

    it('DeployerAccountError exposes the deployer address', async () => {
      mockGetAccount.mockRejectedValue(new Error('not found'));
      try {
        await deployer.uploadWasm(VALID_WASM, mockKeypair);
        expect.fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(DeployerAccountError);
        expect((err as DeployerAccountError).address).toBe(DEPLOYER_ADDRESS);
      }
    });

    it('DeployerAccountError message includes the address', () => {
      const err = new DeployerAccountError('GABC123');
      expect(err.message).toContain('GABC123');
      expect(err.code).toBe('DEPLOYER_ACCOUNT_ERROR');
    });

    it('throws DeployerAccountError for deployContract when account missing', async () => {
      mockGetAccount.mockRejectedValue(new Error('Account not found'));
      await expect(deployer.deployContract(WASM_HASH, mockKeypair))
        .rejects.toThrow(DeployerAccountError);
    });

    it('throws DeployerAccountError for estimateUploadFee when account missing', async () => {
      mockGetAccount.mockRejectedValue(new Error('Account not found'));
      await expect(deployer.estimateUploadFee(VALID_WASM, mockKeypair))
        .rejects.toThrow(DeployerAccountError);
    });

    it('throws DeployerAccountError for estimateDeployFee when account missing', async () => {
      mockGetAccount.mockRejectedValue(new Error('Account not found'));
      await expect(deployer.estimateDeployFee(WASM_HASH, mockKeypair))
        .rejects.toThrow(DeployerAccountError);
    });

    it('wraps unexpected account errors (e.g. 500) as DeployerAccountError', async () => {
      mockGetAccount.mockRejectedValue(new Error('Internal server error 500'));
      await expect(deployer.uploadWasm(VALID_WASM, mockKeypair))
        .rejects.toThrow(DeployerAccountError);
    });
  });

  // ── Insufficient funds via contract error codes ────────────────────────────
  describe('insufficient funds via contract error codes', () => {
    it('parseContractError maps code 10 to InsufficientWithdrawable', () => {
      const parsed = parseContractError(new Error('Error: 10'));
      expect(parsed.type).toBe('contract_error');
      expect(parsed.code).toBe(10);
      expect(parsed.message).toContain('InsufficientWithdrawable');
    });

    it('parseContractError maps code 11 to TransferFailed', () => {
      const parsed = parseContractError(new Error('Error: 11'));
      expect(parsed.type).toBe('contract_error');
      expect(parsed.code).toBe(11);
      expect(parsed.message).toContain('TransferFailed');
    });

    it('parseContractError maps code 4 to InvalidAmount', () => {
      const parsed = parseContractError(new Error('Error: 4'));
      expect(parsed.type).toBe('contract_error');
      expect(parsed.code).toBe(4);
      expect(parsed.message).toContain('InvalidAmount');
    });

    it('executeWithErrorHandling wraps InsufficientWithdrawable as FundableStellarError', async () => {
      try {
        await executeWithErrorHandling(async () => {
          throw new Error('Error: 10');
        });
        expect.fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(FundableStellarError);
        expect((err as FundableStellarError).code).toBe(10);
        expect((err as FundableStellarError).message).toContain('InsufficientWithdrawable');
      }
    });

    it('executeWithErrorHandling wraps TransferFailed as FundableStellarError', async () => {
      try {
        await executeWithErrorHandling(async () => {
          throw new Error('Error: 11');
        });
        expect.fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(FundableStellarError);
        expect((err as FundableStellarError).code).toBe(11);
      }
    });

    it('FundableStellarError.getUserMessage returns human-readable message for insufficient funds', () => {
      const parsed = parseContractError(new Error('Error: 10'));
      const err = new FundableStellarError(parsed);
      const msg = err.getUserMessage();
      expect(msg).toContain('InsufficientWithdrawable');
      expect(msg).not.toContain('Code:');
    });
  });

  // ── Insufficient funds via mocked RPC simulation response ─────────────────
  describe('insufficient funds via mocked RPC simulation', () => {
    it('throws FeeEstimationError when simulation returns insufficient-funds error', async () => {
      mockSimulateTransaction.mockResolvedValue({
        error: 'HostError: insufficient balance to pay fees',
      });
      await expect(deployer.estimateUploadFee(VALID_WASM, mockKeypair))
        .rejects.toThrow(FeeEstimationError);
    });

    it('FeeEstimationError message includes the simulation error detail', async () => {
      mockSimulateTransaction.mockResolvedValue({
        error: 'HostError: insufficient balance',
      });
      try {
        await deployer.estimateUploadFee(VALID_WASM, mockKeypair);
        expect.fail('should have thrown');
      } catch (err) {
        expect((err as FeeEstimationError).message).toContain('insufficient balance');
      }
    });

    it('throws WasmUploadError when on-chain tx fails due to insufficient fee', async () => {
      // Simulate a transaction that is submitted but fails on-chain
      mockGetTransaction.mockResolvedValue({ status: 'FAILED' });
      await expect(deployer.uploadWasm(VALID_WASM, mockKeypair))
        .rejects.toThrow(DeployerError);
    });
  });
});
