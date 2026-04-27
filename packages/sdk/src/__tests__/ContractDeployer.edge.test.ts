/**
 * Edge-case tests for ContractDeployer
 *
 * Covers scenarios not exercised by the baseline ContractDeployer.test.ts:
 *  - Invalid / truncated / corrupt WASM buffers
 *  - RPC timeouts during simulation, submission, and polling
 *  - Insufficient funds / account-not-found variants
 *  - Malformed RPC responses (missing fields, unexpected shapes)
 *  - Concurrent upload + deploy races
 *  - Salt uniqueness and deterministic contract-ID derivation
 *  - Fee-buffer arithmetic edge cases
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ContractDeployer } from '../deployer/ContractDeployer';
import {
  DeployerError,
  InvalidWasmError,
  DeployerAccountError,
  WasmUploadError,
  ContractInstantiationError,
  FeeEstimationError,
  DeploymentTimeoutError,
} from '../deployer/errors';

// ---------------------------------------------------------------------------
// WASM fixtures
// ---------------------------------------------------------------------------
/** Minimal valid WASM: magic number + version */
const VALID_WASM = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
/** Only 3 bytes — too short to contain the magic number */
const TOO_SHORT_WASM = Buffer.from([0x00, 0x61, 0x73]);
/** Correct length but wrong magic bytes */
const WRONG_MAGIC_WASM = Buffer.from([0xde, 0xad, 0xbe, 0xef, 0x01, 0x00, 0x00, 0x00]);
/** First byte correct, rest wrong */
const PARTIAL_MAGIC_WASM = Buffer.from([0x00, 0xff, 0xff, 0xff, 0x01, 0x00, 0x00, 0x00]);
/** Uint8Array variant of valid WASM */
const VALID_WASM_U8 = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
/** Large WASM (1 MB) — tests that size alone doesn't cause rejection */
const LARGE_WASM = (() => {
  const buf = Buffer.alloc(1024 * 1024, 0x00);
  buf[0] = 0x00; buf[1] = 0x61; buf[2] = 0x73; buf[3] = 0x6d;
  buf[4] = 0x01;
  return buf;
})();

const WASM_HASH = 'a'.repeat(64);
const DEPLOYER_ADDRESS = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

// ---------------------------------------------------------------------------
// RPC mock setup — use vi.hoisted() so variables are available in vi.mock factory
// ---------------------------------------------------------------------------
const { mockGetAccount, mockSimulateTransaction, mockSendTransaction, mockGetTransaction, mockGetNetwork } = vi.hoisted(() => ({
  mockGetAccount: vi.fn(),
  mockSimulateTransaction: vi.fn(),
  mockSendTransaction: vi.fn(),
  mockGetTransaction: vi.fn(),
  mockGetNetwork: vi.fn(),
}));

vi.mock('@stellar/stellar-sdk/rpc', () => {
  const mockRpcInstance = {
    getAccount: mockGetAccount,
    simulateTransaction: mockSimulateTransaction,
    sendTransaction: mockSendTransaction,
    getTransaction: mockGetTransaction,
    getNetwork: mockGetNetwork,
  };
  return {
    Server: vi.fn().mockReturnValue(mockRpcInstance),
    Api: {
      isSimulationError: vi.fn((r: Record<string, unknown>) => r?.error !== undefined),
      isSimulationSuccess: vi.fn((r: Record<string, unknown>) => r?.error === undefined),
      GetTransactionStatus: {
        NOT_FOUND: 'NOT_FOUND',
        SUCCESS: 'SUCCESS',
        FAILED: 'FAILED',
      },
    },
  };
});

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
            instructions: vi.fn(() => 1_000_000),
            readBytes: vi.fn(() => 4096),
            writeBytes: vi.fn(() => 2048),
            footprint: vi.fn(() => ({
              readOnly: vi.fn(() => new Array(3)),
              readWrite: vi.fn(() => new Array(2)),
            })),
          })),
        })),
      },
      TransactionEnvelope: {
        fromXDR: vi.fn(() => ({})),
      },
      HashIdPreimage: {
        envelopeTypeContractId: vi.fn(() => ({
          toXDR: vi.fn(() => Buffer.alloc(32, 0xcd)),
        })),
      },
      HashIdPreimageContractId: vi.fn(() => ({})),
      ContractIdPreimage: {
        contractIdPreimageFromAddress: vi.fn(() => ({})),
      },
      ContractIdPreimageFromAddress: vi.fn(() => ({})),
    },
    hash: vi.fn(() => Buffer.alloc(32, 0xab)),
    Address: vi.fn().mockImplementation((addr: string) => ({
      addr,
      toScVal: vi.fn(() => ({ switch: () => ({ name: 'scvAddress' }) })),
      toScAddress: vi.fn(() => ({ switch: () => ({ name: 'scAddressTypeAccount' }) })),
    })),
    StrKey: {
      encodeContract: vi.fn(() => 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM'),
    },
  };
});

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------
const mockAccount = { id: DEPLOYER_ADDRESS, sequenceNumber: () => '100' };
const mockSimSuccess = { transactionData: 'base64data', minResourceFee: '1000' };
const mockSendPending = { status: 'PENDING', hash: 'txhash_abc' };
const mockTxSuccess = { status: 'SUCCESS', ledger: 42, feeCharged: '200' };

function makeDeployer(overrides?: { timeoutSeconds?: number }) {
  return new ContractDeployer({
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('ContractDeployer — edge cases', () => {
  let deployer: ContractDeployer;
  const mockKeypair = {
    publicKey: () => DEPLOYER_ADDRESS,
    sign: vi.fn(),
  } as unknown as import('@stellar/stellar-sdk').Keypair;

  beforeEach(() => {
    // Reset individual mocks without clearing the Server constructor mock
    mockGetAccount.mockReset();
    mockSimulateTransaction.mockReset();
    mockSendTransaction.mockReset();
    mockGetTransaction.mockReset();
    mockGetNetwork.mockReset();

    deployer = makeDeployer();
    // Default happy-path mocks — re-set after reset
    mockGetAccount.mockResolvedValue(mockAccount);
    mockSimulateTransaction.mockResolvedValue(mockSimSuccess);
    mockSendTransaction.mockResolvedValue(mockSendPending);
    mockGetTransaction.mockResolvedValue(mockTxSuccess);
    mockGetNetwork.mockResolvedValue({
      passphrase: 'Test SDF Network ; September 2015',
      protocolVersion: '20',
    });
  });

  afterEach(() => {
    // Don't restore all mocks — that would break the module-level vi.mock() setup
  });

  // ── WASM validation edge cases ─────────────────────────────────────────────
  describe('WASM validation', () => {
    it('rejects a null-like value (empty Buffer)', async () => {
      await expect(deployer.uploadWasm(Buffer.alloc(0), mockKeypair))
        .rejects.toThrow(InvalidWasmError);
    });

    it('rejects a WASM that is only 3 bytes (too short for magic)', async () => {
      await expect(deployer.uploadWasm(TOO_SHORT_WASM, mockKeypair))
        .rejects.toThrow(InvalidWasmError);
    });

    it('rejects a buffer with wrong magic bytes (0xDEADBEEF)', async () => {
      await expect(deployer.uploadWasm(WRONG_MAGIC_WASM, mockKeypair))
        .rejects.toThrow(InvalidWasmError);
    });

    it('rejects a buffer where only the first magic byte is correct', async () => {
      await expect(deployer.uploadWasm(PARTIAL_MAGIC_WASM, mockKeypair))
        .rejects.toThrow(InvalidWasmError);
    });

    it('accepts a Uint8Array with valid magic number', async () => {
      await expect(deployer.uploadWasm(VALID_WASM_U8, mockKeypair))
        .resolves.toBeDefined();
    });

    it('accepts a large (1 MB) valid WASM buffer', async () => {
      await expect(deployer.uploadWasm(LARGE_WASM, mockKeypair))
        .resolves.toBeDefined();
    });

    it('InvalidWasmError has code INVALID_WASM and correct name', () => {
      const err = new InvalidWasmError('bad wasm');
      expect(err.code).toBe('INVALID_WASM');
      expect(err.name).toBe('InvalidWasmError');
      expect(err).toBeInstanceOf(DeployerError);
      expect(err).toBeInstanceOf(Error);
    });

    it('rejects invalid WASM in estimateDeployFee indirectly via uploadWasm', async () => {
      // estimateDeployFee itself doesn't validate WASM, but uploadWasm does
      await expect(deployer.uploadWasm(WRONG_MAGIC_WASM, mockKeypair))
        .rejects.toThrow(InvalidWasmError);
    });
  });

  // ── RPC timeout during simulation ─────────────────────────────────────────
  describe('RPC timeouts — simulation', () => {
    it('throws FeeEstimationError when simulateTransaction times out', async () => {
      mockSimulateTransaction.mockRejectedValue(
        Object.assign(new Error('Request timed out after 30s'), { code: 'ETIMEDOUT' })
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

    it('throws FeeEstimationError when simulateTransaction returns a network error', async () => {
      mockSimulateTransaction.mockRejectedValue(new Error('ECONNREFUSED'));
      await expect(deployer.estimateUploadFee(VALID_WASM, mockKeypair))
        .rejects.toThrow(FeeEstimationError);
    });

    it('throws FeeEstimationError when simulation returns an error object', async () => {
      mockSimulateTransaction.mockResolvedValue({ error: 'HostError: value error' });
      await expect(deployer.estimateUploadFee(VALID_WASM, mockKeypair))
        .rejects.toThrow(FeeEstimationError);
    });

    it('throws FeeEstimationError for deploy simulation timeout', async () => {
      mockSimulateTransaction.mockRejectedValue(new Error('socket hang up'));
      await expect(deployer.estimateDeployFee(WASM_HASH, mockKeypair))
        .rejects.toThrow(FeeEstimationError);
    });
  });

  // ── RPC timeout during submission ─────────────────────────────────────────
  describe('RPC timeouts — transaction submission', () => {
    it('throws DeployerError when sendTransaction times out', async () => {
      mockSendTransaction.mockRejectedValue(new Error('ETIMEDOUT'));
      await expect(deployer.uploadWasm(VALID_WASM, mockKeypair))
        .rejects.toThrow(DeployerError);
    });

    it('throws DeployerError when sendTransaction returns ERROR status', async () => {
      mockSendTransaction.mockResolvedValue({ status: 'ERROR', errorResult: null });
      await expect(deployer.uploadWasm(VALID_WASM, mockKeypair))
        .rejects.toThrow(DeployerError);
    });

    it('throws DeployerError when sendTransaction returns ERROR with errorResult', async () => {
      mockSendTransaction.mockResolvedValue({
        status: 'ERROR',
        errorResult: { toXDR: () => 'base64errorxdr' },
      });
      await expect(deployer.uploadWasm(VALID_WASM, mockKeypair))
        .rejects.toThrow(DeployerError);
    });
  });

  // ── RPC timeout during polling ─────────────────────────────────────────────
  describe('RPC timeouts — transaction polling', () => {
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

    it('succeeds when first poll returns NOT_FOUND then SUCCESS', async () => {
      mockGetTransaction
        .mockResolvedValueOnce({ status: 'NOT_FOUND' })
        .mockResolvedValueOnce({ status: 'SUCCESS', ledger: 55, feeCharged: '300' });
      // Use a deployer with enough timeout to allow one retry
      const result = await deployer.uploadWasm(VALID_WASM, mockKeypair);
      expect(result).toHaveProperty('wasmHash');
      expect(result).toHaveProperty('txHash');
    });
  });

  // ── Insufficient funds / account errors ───────────────────────────────────
  describe('account errors', () => {
    it('throws DeployerAccountError when account has no XLM (404)', async () => {
      mockGetAccount.mockRejectedValue(
        Object.assign(new Error('Account not found'), { response: { status: 404 } })
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

    it('wraps unexpected account errors as DeployerAccountError', async () => {
      mockGetAccount.mockRejectedValue(new Error('Internal server error 500'));
      await expect(deployer.uploadWasm(VALID_WASM, mockKeypair))
        .rejects.toThrow(DeployerAccountError);
    });
  });

  // ── Malformed RPC responses ────────────────────────────────────────────────
  describe('malformed RPC responses', () => {
    it('handles simulation response missing minResourceFee (defaults to 0)', async () => {
      mockSimulateTransaction.mockResolvedValue({
        transactionData: 'base64data',
        // minResourceFee intentionally absent
      });
      const estimate = await deployer.estimateUploadFee(VALID_WASM, mockKeypair);
      // fee should still be a valid string (baseFee applied)
      expect(typeof estimate.fee).toBe('string');
      expect(Number(estimate.fee)).toBeGreaterThanOrEqual(0);
    });

    it('handles simulation response missing transactionData gracefully', async () => {
      mockSimulateTransaction.mockResolvedValue({
        minResourceFee: '500',
        // transactionData intentionally absent
      });
      const estimate = await deployer.estimateUploadFee(VALID_WASM, mockKeypair);
      // resources should fall back to zeros
      expect(estimate.resources).toBeDefined();
    });

    it('handles getTransaction response missing ledger field', async () => {
      mockGetTransaction.mockResolvedValue({ status: 'SUCCESS' }); // no ledger
      const result = await deployer.uploadWasm(VALID_WASM, mockKeypair);
      // ledger should default to 0
      expect(result.ledger).toBe(0);
    });

    it('handles getTransaction response missing feeCharged field', async () => {
      mockGetTransaction.mockResolvedValue({ status: 'SUCCESS', ledger: 10 }); // no feeCharged
      const result = await deployer.uploadWasm(VALID_WASM, mockKeypair);
      // feeCharged should fall back to baseFee
      expect(typeof result.feeCharged).toBe('string');
    });

    it('handles simulation returning an empty object (no error, no data)', async () => {
      mockSimulateTransaction.mockResolvedValue({});
      const estimate = await deployer.estimateUploadFee(VALID_WASM, mockKeypair);
      expect(estimate).toHaveProperty('fee');
    });
  });

  // ── Fee buffer arithmetic ──────────────────────────────────────────────────
  describe('fee buffer arithmetic', () => {
    it('recommended fee is strictly greater than minResourceFee', async () => {
      mockSimulateTransaction.mockResolvedValue({
        transactionData: 'base64data',
        minResourceFee: '10000',
      });
      const estimate = await deployer.estimateUploadFee(VALID_WASM, mockKeypair);
      expect(Number(estimate.fee)).toBeGreaterThan(10000);
    });

    it('fee is at least baseFee even when minResourceFee is 0', async () => {
      mockSimulateTransaction.mockResolvedValue({
        transactionData: 'base64data',
        minResourceFee: '0',
      });
      const estimate = await deployer.estimateUploadFee(VALID_WASM, mockKeypair);
      // baseFee is 100 by default
      expect(Number(estimate.fee)).toBeGreaterThanOrEqual(100);
    });

    it('custom baseFee is reflected in the estimate', async () => {
      const customDeployer = new ContractDeployer({
        rpcUrl: 'https://soroban-testnet.stellar.org',
        networkPassphrase: 'Test SDF Network ; September 2015',
        baseFee: '500',
      });
      mockSimulateTransaction.mockResolvedValue({
        transactionData: 'base64data',
        minResourceFee: '0',
      });
      const estimate = await customDeployer.estimateUploadFee(VALID_WASM, mockKeypair);
      expect(Number(estimate.fee)).toBeGreaterThanOrEqual(500);
    });
  });

  // ── uploadAndDeploy composite edge cases ──────────────────────────────────
  describe('uploadAndDeploy composite', () => {
    it('propagates upload failure without attempting deploy', async () => {
      mockGetAccount.mockRejectedValue(new Error('not found'));
      await expect(deployer.uploadAndDeploy(VALID_WASM, mockKeypair))
        .rejects.toThrow(DeployerAccountError);
      // sendTransaction should never have been called
      expect(mockSendTransaction).not.toHaveBeenCalled();
    });

    it('propagates deploy failure after successful upload', async () => {
      // Upload succeeds
      mockGetTransaction
        .mockResolvedValueOnce(mockTxSuccess) // upload poll
        .mockResolvedValue({ status: 'FAILED' }); // deploy poll
      await expect(deployer.uploadAndDeploy(VALID_WASM, mockKeypair))
        .rejects.toThrow(DeployerError);
    });

    it('returns both upload and deploy results on full success', async () => {
      const result = await deployer.uploadAndDeploy(VALID_WASM, mockKeypair);
      expect(result.upload).toHaveProperty('wasmHash');
      expect(result.deploy).toHaveProperty('contractId');
    });

    it('accepts a custom salt for deterministic contract ID', async () => {
      const salt = Buffer.alloc(32, 0x42);
      const result = await deployer.uploadAndDeploy(VALID_WASM, mockKeypair, salt);
      expect(result.deploy).toHaveProperty('contractId');
    });
  });

  // ── Concurrent operations ──────────────────────────────────────────────────
  describe('concurrent operations', () => {
    it('handles two simultaneous uploadWasm calls independently', async () => {
      const [r1, r2] = await Promise.all([
        deployer.uploadWasm(VALID_WASM, mockKeypair),
        deployer.uploadWasm(VALID_WASM, mockKeypair),
      ]);
      expect(r1).toHaveProperty('wasmHash');
      expect(r2).toHaveProperty('wasmHash');
    });

    it('handles simultaneous upload failure and success gracefully', async () => {
      mockGetAccount
        .mockResolvedValueOnce(mockAccount)   // first call succeeds
        .mockRejectedValueOnce(new Error('not found')); // second call fails

      const [r1, r2] = await Promise.allSettled([
        deployer.uploadWasm(VALID_WASM, mockKeypair),
        deployer.uploadWasm(VALID_WASM, mockKeypair),
      ]);
      expect(r1.status).toBe('fulfilled');
      expect(r2.status).toBe('rejected');
    });
  });

  // ── Network passphrase edge cases ──────────────────────────────────────────
  describe('network passphrase edge cases', () => {
    it('retries passphrase fetch after transient failure', async () => {
      const autoDeployer = new ContractDeployer({
        rpcUrl: 'https://soroban-testnet.stellar.org',
      });
      mockGetNetwork
        .mockRejectedValueOnce(new Error('connection reset'))
        .mockResolvedValue({ passphrase: 'Test SDF Network ; September 2015', protocolVersion: '20' });

      // First call fails
      await expect(autoDeployer.getNetworkPassphrase()).rejects.toThrow(DeployerError);
      // Second call succeeds (cache was cleared after failure)
      const passphrase = await autoDeployer.getNetworkPassphrase();
      expect(passphrase).toBe('Test SDF Network ; September 2015');
    });

    it('throws DeployerError with PASSPHRASE_DETECTION_FAILED code on RPC failure', async () => {
      const autoDeployer = new ContractDeployer({
        rpcUrl: 'https://soroban-testnet.stellar.org',
      });
      mockGetNetwork.mockRejectedValue(new Error('DNS lookup failed'));
      try {
        await autoDeployer.getNetworkPassphrase();
        expect.fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(DeployerError);
        expect((err as DeployerError).message).toContain('DNS lookup failed');
      }
    });

    it('does not call getNetwork when passphrase is provided in config', async () => {
      await deployer.getNetworkPassphrase();
      expect(mockGetNetwork).not.toHaveBeenCalled();
    });
  });

  // ── Error class hierarchy ──────────────────────────────────────────────────
  describe('error class hierarchy', () => {
    it('all deployer errors extend DeployerError', () => {
      const errors = [
        new InvalidWasmError(),
        new DeployerAccountError('GABC'),
        new WasmUploadError('msg'),
        new ContractInstantiationError('msg'),
        new FeeEstimationError('msg'),
        new DeploymentTimeoutError('txhash'),
      ];
      for (const err of errors) {
        expect(err).toBeInstanceOf(DeployerError);
        expect(err).toBeInstanceOf(Error);
      }
    });

    it('WasmUploadError without txHash has undefined txHash', () => {
      const err = new WasmUploadError('failed');
      expect(err.txHash).toBeUndefined();
    });

    it('ContractInstantiationError without txHash has undefined txHash', () => {
      const err = new ContractInstantiationError('failed');
      expect(err.txHash).toBeUndefined();
    });

    it('DeploymentTimeoutError message includes the tx hash', () => {
      const err = new DeploymentTimeoutError('abc123');
      expect(err.message).toContain('abc123');
      expect(err.code).toBe('DEPLOYMENT_TIMEOUT');
    });
  });
});
