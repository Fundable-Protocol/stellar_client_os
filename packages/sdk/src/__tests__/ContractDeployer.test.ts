import { describe, it, expect, vi, beforeEach } from 'vitest';
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
// Minimal valid WASM buffer (magic number 0x00 0x61 0x73 0x6D + version)
// ---------------------------------------------------------------------------
const VALID_WASM = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
const INVALID_WASM = Buffer.from([0xff, 0xff, 0xff, 0xff]);
const EMPTY_WASM = Buffer.alloc(0);

const WASM_HASH = 'a'.repeat(64); // 64-char hex string
const DEPLOYER_SECRET = 'SCZANGBA5RLBRQTFXV5IFRSKDNQKQD4XNKXNQKXNQKXNQKXNQKXNQKX';

// ---------------------------------------------------------------------------
// Mock @stellar/stellar-sdk/rpc Server
// ---------------------------------------------------------------------------
const mockGetAccount = vi.fn();
const mockSimulateTransaction = vi.fn();
const mockSendTransaction = vi.fn();
const mockGetTransaction = vi.fn();
const mockGetNetwork = vi.fn();

vi.mock('@stellar/stellar-sdk/rpc', () => ({
  Server: vi.fn().mockImplementation(() => ({
    getAccount: mockGetAccount,
    simulateTransaction: mockSimulateTransaction,
    sendTransaction: mockSendTransaction,
    getTransaction: mockGetTransaction,
    getNetwork: mockGetNetwork,
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
}));

// Mock stellar-sdk so TransactionBuilder / Operation don't need a real network
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
            instructions: vi.fn(() => 1000),
            readBytes: vi.fn(() => 512),
            writeBytes: vi.fn(() => 256),
            footprint: vi.fn(() => ({
              readOnly: vi.fn(() => []),
              readWrite: vi.fn(() => []),
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
    hash: vi.fn(() => Buffer.from('a'.repeat(64), 'hex')),
    Address: vi.fn().mockImplementation((addr: string) => ({ addr })),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const mockAccount = {
  id: 'GABC...',
  sequenceNumber: () => '100',
};

const mockSimulationSuccess = {
  transactionData: 'base64data',
  minResourceFee: '1000',
};

const mockTxSuccess = {
  status: 'SUCCESS',
  hash: 'txhash123',
  ledger: 42,
  feeCharged: '200',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('ContractDeployer', () => {
  let deployer: ContractDeployer;
  // Use a real Keypair-like object for tests
  const mockKeypair = {
    publicKey: () => 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
    sign: vi.fn(),
  } as unknown as import('@stellar/stellar-sdk').Keypair;

  beforeEach(() => {
    vi.clearAllMocks();
    deployer = new ContractDeployer({
      rpcUrl: 'https://soroban-testnet.stellar.org',
      networkPassphrase: 'Test SDF Network ; September 2015',
    });
    mockGetAccount.mockResolvedValue(mockAccount);
    mockSimulateTransaction.mockResolvedValue(mockSimulationSuccess);
    mockSendTransaction.mockResolvedValue({ status: 'PENDING', hash: 'txhash123' });
    mockGetTransaction.mockResolvedValue({ status: 'SUCCESS', ledger: 42 });
    mockGetNetwork.mockResolvedValue({ passphrase: 'Test SDF Network ; September 2015', protocolVersion: '20' });
  });

  // ── static factories ───────────────────────────────────────────────────────
  describe('static factories', () => {
    it('forTestnet creates deployer with testnet RPC', () => {
      const d = ContractDeployer.forTestnet();
      expect(d).toBeInstanceOf(ContractDeployer);
    });

    it('forMainnet creates deployer with mainnet RPC', () => {
      const d = ContractDeployer.forMainnet();
      expect(d).toBeInstanceOf(ContractDeployer);
    });

    it('forTestnet accepts config overrides', () => {
      const d = ContractDeployer.forTestnet({ baseFee: '500' });
      expect(d).toBeInstanceOf(ContractDeployer);
    });
  });

  // ── WASM validation ────────────────────────────────────────────────────────
  describe('WASM validation', () => {
    it('rejects empty WASM buffer', async () => {
      await expect(deployer.uploadWasm(EMPTY_WASM, mockKeypair)).rejects.toThrow(InvalidWasmError);
    });

    it('rejects buffer without WASM magic number', async () => {
      await expect(deployer.uploadWasm(INVALID_WASM, mockKeypair)).rejects.toThrow(InvalidWasmError);
    });

    it('rejects empty WASM in estimateUploadFee', async () => {
      await expect(deployer.estimateUploadFee(EMPTY_WASM, mockKeypair)).rejects.toThrow(InvalidWasmError);
    });

    it('accepts valid WASM magic number', async () => {
      // Should not throw on validation — may fail later on network
      mockGetAccount.mockResolvedValue(mockAccount);
      mockSimulateTransaction.mockResolvedValue(mockSimulationSuccess);
      mockSendTransaction.mockResolvedValue({ status: 'PENDING', hash: 'txhash123' });
      mockGetTransaction.mockResolvedValue({ status: 'SUCCESS', ledger: 42 });
      await expect(deployer.uploadWasm(VALID_WASM, mockKeypair)).resolves.toBeDefined();
    });
  });

  // ── account loading ────────────────────────────────────────────────────────
  describe('account loading', () => {
    it('throws DeployerAccountError when account not found', async () => {
      mockGetAccount.mockRejectedValue(new Error('Account not found'));
      await expect(deployer.uploadWasm(VALID_WASM, mockKeypair)).rejects.toThrow(DeployerAccountError);
    });

    it('DeployerAccountError includes the address', async () => {
      mockGetAccount.mockRejectedValue(new Error('404'));
      try {
        await deployer.uploadWasm(VALID_WASM, mockKeypair);
      } catch (err) {
        expect(err).toBeInstanceOf(DeployerAccountError);
        expect((err as DeployerAccountError).address).toBe(mockKeypair.publicKey());
      }
    });
  });

  // ── fee estimation ─────────────────────────────────────────────────────────
  describe('estimateUploadFee', () => {
    it('returns a FeeEstimate with fee, resources, and minResourceFee', async () => {
      const estimate = await deployer.estimateUploadFee(VALID_WASM, mockKeypair);
      expect(estimate).toHaveProperty('fee');
      expect(estimate).toHaveProperty('resources');
      expect(estimate).toHaveProperty('minResourceFee');
    });

    it('fee is greater than minResourceFee (buffer applied)', async () => {
      const estimate = await deployer.estimateUploadFee(VALID_WASM, mockKeypair);
      expect(Number(estimate.fee)).toBeGreaterThan(Number(estimate.minResourceFee));
    });

    it('throws FeeEstimationError when simulation fails', async () => {
      mockSimulateTransaction.mockResolvedValue({ error: 'HostError: some contract error' });
      await expect(deployer.estimateUploadFee(VALID_WASM, mockKeypair)).rejects.toThrow(FeeEstimationError);
    });

    it('throws FeeEstimationError when RPC call throws', async () => {
      mockSimulateTransaction.mockRejectedValue(new Error('Network timeout'));
      await expect(deployer.estimateUploadFee(VALID_WASM, mockKeypair)).rejects.toThrow(FeeEstimationError);
    });
  });

  describe('estimateDeployFee', () => {
    it('returns a FeeEstimate', async () => {
      const estimate = await deployer.estimateDeployFee(WASM_HASH, mockKeypair);
      expect(estimate).toHaveProperty('fee');
      expect(estimate).toHaveProperty('resources');
    });

    it('throws FeeEstimationError on simulation error', async () => {
      mockSimulateTransaction.mockResolvedValue({ error: 'simulation failed' });
      await expect(deployer.estimateDeployFee(WASM_HASH, mockKeypair)).rejects.toThrow(FeeEstimationError);
    });
  });

  // ── uploadWasm ─────────────────────────────────────────────────────────────
  describe('uploadWasm', () => {
    it('returns WasmUploadResult with wasmHash, txHash, and ledger', async () => {
      const result = await deployer.uploadWasm(VALID_WASM, mockKeypair);
      expect(result).toHaveProperty('wasmHash');
      expect(result).toHaveProperty('txHash');
      expect(result).toHaveProperty('ledger');
      expect(result).toHaveProperty('feeCharged');
    });

    it('wasmHash is a 64-char hex string (SHA-256)', async () => {
      const result = await deployer.uploadWasm(VALID_WASM, mockKeypair);
      expect(result.wasmHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('throws DeployerError when sendTransaction returns ERROR', async () => {
      mockSendTransaction.mockResolvedValue({ status: 'ERROR', errorResult: null });
      await expect(deployer.uploadWasm(VALID_WASM, mockKeypair)).rejects.toThrow(DeployerError);
    });

    it('throws DeploymentTimeoutError when transaction never confirms', async () => {
      mockGetTransaction.mockResolvedValue({ status: 'NOT_FOUND' });
      const fastDeployer = new ContractDeployer({
        rpcUrl: 'https://soroban-testnet.stellar.org',
        networkPassphrase: 'Test SDF Network ; September 2015',
        timeoutSeconds: 0, // immediate timeout
      });
      await expect(fastDeployer.uploadWasm(VALID_WASM, mockKeypair)).rejects.toThrow(DeploymentTimeoutError);
    });

    it('throws DeployerError when on-chain transaction fails', async () => {
      mockGetTransaction.mockResolvedValue({ status: 'FAILED' });
      await expect(deployer.uploadWasm(VALID_WASM, mockKeypair)).rejects.toThrow(DeployerError);
    });
  });

  // ── deployContract ─────────────────────────────────────────────────────────
  describe('deployContract', () => {
    it('returns ContractDeployResult with contractId, txHash, and ledger', async () => {
      const result = await deployer.deployContract(WASM_HASH, mockKeypair);
      expect(result).toHaveProperty('contractId');
      expect(result).toHaveProperty('txHash');
      expect(result).toHaveProperty('ledger');
      expect(result).toHaveProperty('feeCharged');
    });

    it('accepts an optional salt buffer', async () => {
      const salt = Buffer.alloc(32, 0xab);
      const result = await deployer.deployContract(WASM_HASH, mockKeypair, salt);
      expect(result).toHaveProperty('contractId');
    });

    it('throws DeployerError when sendTransaction returns ERROR', async () => {
      mockSendTransaction.mockResolvedValue({ status: 'ERROR', errorResult: null });
      await expect(deployer.deployContract(WASM_HASH, mockKeypair)).rejects.toThrow(DeployerError);
    });

    it('throws DeploymentTimeoutError when transaction never confirms', async () => {
      mockGetTransaction.mockResolvedValue({ status: 'NOT_FOUND' });
      const fastDeployer = new ContractDeployer({
        rpcUrl: 'https://soroban-testnet.stellar.org',
        networkPassphrase: 'Test SDF Network ; September 2015',
        timeoutSeconds: 0,
      });
      await expect(fastDeployer.deployContract(WASM_HASH, mockKeypair)).rejects.toThrow(DeploymentTimeoutError);
    });
  });

  // ── uploadAndDeploy ────────────────────────────────────────────────────────
  describe('uploadAndDeploy', () => {
    it('returns both upload and deploy results', async () => {
      const result = await deployer.uploadAndDeploy(VALID_WASM, mockKeypair);
      expect(result).toHaveProperty('upload');
      expect(result).toHaveProperty('deploy');
      expect(result.upload).toHaveProperty('wasmHash');
      expect(result.deploy).toHaveProperty('contractId');
    });

    it('stops at upload if WASM is invalid', async () => {
      await expect(deployer.uploadAndDeploy(INVALID_WASM, mockKeypair)).rejects.toThrow(InvalidWasmError);
    });

    it('stops at upload if account is not found', async () => {
      mockGetAccount.mockRejectedValue(new Error('not found'));
      await expect(deployer.uploadAndDeploy(VALID_WASM, mockKeypair)).rejects.toThrow(DeployerAccountError);
    });
  });

  // ── error class shapes ─────────────────────────────────────────────────────
  describe('error class properties', () => {
    it('InvalidWasmError has correct code', () => {
      const err = new InvalidWasmError();
      expect(err.code).toBe('INVALID_WASM');
      expect(err.name).toBe('InvalidWasmError');
    });

    it('DeployerAccountError exposes address', () => {
      const err = new DeployerAccountError('GABC...');
      expect(err.address).toBe('GABC...');
      expect(err.code).toBe('DEPLOYER_ACCOUNT_ERROR');
    });

    it('WasmUploadError exposes txHash', () => {
      const err = new WasmUploadError('failed', 'txabc');
      expect(err.txHash).toBe('txabc');
    });

    it('ContractInstantiationError exposes txHash', () => {
      const err = new ContractInstantiationError('failed', 'txdef');
      expect(err.txHash).toBe('txdef');
    });

    it('DeploymentTimeoutError exposes txHash', () => {
      const err = new DeploymentTimeoutError('txghi');
      expect(err.txHash).toBe('txghi');
      expect(err.code).toBe('DEPLOYMENT_TIMEOUT');
    });

    it('FeeEstimationError has correct code', () => {
      const err = new FeeEstimationError('sim failed');
      expect(err.code).toBe('FEE_ESTIMATION_ERROR');
    });
  });

  // ── network passphrase auto-detection ──────────────────────────────────────
  describe('network passphrase auto-detection', () => {
    it('fetches passphrase from RPC when not provided in config', async () => {
      const autoDeployer = new ContractDeployer({
        rpcUrl: 'https://soroban-testnet.stellar.org',
        // networkPassphrase intentionally omitted
      });
      const passphrase = await autoDeployer.getNetworkPassphrase();
      expect(passphrase).toBe('Test SDF Network ; September 2015');
      expect(mockGetNetwork).toHaveBeenCalledTimes(1);
    });

    it('does not call getNetwork when passphrase is already configured', async () => {
      const passphrase = await deployer.getNetworkPassphrase();
      expect(passphrase).toBe('Test SDF Network ; September 2015');
      expect(mockGetNetwork).not.toHaveBeenCalled();
    });

    it('fetches passphrase only once across multiple calls (caching)', async () => {
      const autoDeployer = new ContractDeployer({
        rpcUrl: 'https://soroban-testnet.stellar.org',
      });
      await autoDeployer.getNetworkPassphrase();
      await autoDeployer.getNetworkPassphrase();
      await autoDeployer.getNetworkPassphrase();
      expect(mockGetNetwork).toHaveBeenCalledTimes(1);
    });

    it('uses auto-detected passphrase when building transactions', async () => {
      const autoDeployer = new ContractDeployer({
        rpcUrl: 'https://soroban-testnet.stellar.org',
      });
      // Should not throw — passphrase resolved from RPC before tx is built
      await expect(autoDeployer.uploadWasm(VALID_WASM, mockKeypair)).resolves.toBeDefined();
      expect(mockGetNetwork).toHaveBeenCalledTimes(1);
    });

    it('ContractDeployer.create() resolves passphrase eagerly', async () => {
      const autoDeployer = await ContractDeployer.create({
        rpcUrl: 'https://soroban-testnet.stellar.org',
      });
      // getNetwork must have been called during create()
      expect(mockGetNetwork).toHaveBeenCalledTimes(1);
      // Subsequent call must not hit the network again
      await autoDeployer.getNetworkPassphrase();
      expect(mockGetNetwork).toHaveBeenCalledTimes(1);
    });

    it('throws DeployerError (PASSPHRASE_DETECTION_FAILED) when RPC getNetwork fails', async () => {
      mockGetNetwork.mockRejectedValue(new Error('connection refused'));
      const autoDeployer = new ContractDeployer({
        rpcUrl: 'https://soroban-testnet.stellar.org',
      });
      await expect(autoDeployer.getNetworkPassphrase()).rejects.toThrow(
        'Failed to auto-detect network passphrase from RPC: connection refused',
      );
    });

    it('clears cache after a getNetwork failure so a retry succeeds', async () => {
      const autoDeployer = new ContractDeployer({
        rpcUrl: 'https://soroban-testnet.stellar.org',
      });
      // First call fails
      mockGetNetwork.mockRejectedValueOnce(new Error('timeout'));
      await expect(autoDeployer.getNetworkPassphrase()).rejects.toThrow();
      // Second call succeeds (cache was cleared)
      mockGetNetwork.mockResolvedValue({ passphrase: 'Test SDF Network ; September 2015', protocolVersion: '20' });
      const passphrase = await autoDeployer.getNetworkPassphrase();
      expect(passphrase).toBe('Test SDF Network ; September 2015');
    });
  });
});
