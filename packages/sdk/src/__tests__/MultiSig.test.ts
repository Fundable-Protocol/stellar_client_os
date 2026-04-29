import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Keypair } from '@stellar/stellar-sdk';
import { ContractDeployer } from '../deployer/ContractDeployer';

// ---------------------------------------------------------------------------
// Minimal valid WASM buffer
// ---------------------------------------------------------------------------
const VALID_WASM = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
const WASM_HASH = 'a'.repeat(64);

// ---------------------------------------------------------------------------
// Mocks
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
    isSimulationError: vi.fn((r: any) => r?.error !== undefined),
    isSimulationSuccess: vi.fn((r: any) => r?.error === undefined),
    GetTransactionStatus: {
      SUCCESS: 'SUCCESS',
    },
  },
}));

vi.mock('@stellar/stellar-sdk', async () => {
  const actual = await vi.importActual<any>('@stellar/stellar-sdk');
  const mockTx = {
    sign: vi.fn(),
    signatures: [],
    toEnvelope: vi.fn(() => ({ toXDR: vi.fn(() => 'base64xdr') })),
  };
  return {
    ...actual,
    TransactionBuilder: vi.fn().mockImplementation(() => ({
      addOperation: vi.fn().mockReturnThis(),
      setTimeout: vi.fn().mockReturnThis(),
      build: vi.fn(() => ({
        ...mockTx,
        signatures: [], // Reset for each build
      })),
    })),
    Operation: {
      uploadContractWasm: vi.fn(() => ({})),
      createCustomContract: vi.fn(() => ({})),
    },
    xdr: {
      ...actual.xdr,
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
    },
    hash: vi.fn(() => Buffer.from('a'.repeat(32), 'hex')),
    Address: vi.fn().mockImplementation((addr: string) => ({ addr })),
  };
});

const mockAccount = {
  id: 'GABC...',
  sequenceNumber: () => '100',
};

const mockSimulationSuccess = {
  transactionData: 'base64data',
  minResourceFee: '1000',
};

describe('ContractDeployer - Multi-Sig Support', () => {
  let deployer: ContractDeployer;
  const key1 = Keypair.random();
  const key2 = Keypair.random();

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
    mockGetNetwork.mockResolvedValue({ passphrase: 'Test SDF Network ; September 2015' });
  });

  describe('uploadWasm', () => {
    it('supports multiple signers', async () => {
      const deployerConfig = {
        address: key1.publicKey(),
        signers: [key1, key2],
      };

      await deployer.uploadWasm(VALID_WASM, deployerConfig);

      // Verify account was loaded using the config address
      expect(mockGetAccount).toHaveBeenCalledWith(key1.publicKey());
    });

    it('supports signing callbacks', async () => {
      const signCallback = vi.fn().mockImplementation(async (tx) => {
        tx.sign(key1);
        return tx;
      });

      const deployerConfig = {
        address: key1.publicKey(),
        signers: [signCallback],
      };

      await deployer.uploadWasm(VALID_WASM, deployerConfig);

      expect(signCallback).toHaveBeenCalled();
    });

    it('supports mixing keypairs and callbacks', async () => {
      const signCallback = vi.fn().mockImplementation(async (tx) => {
        tx.sign(key2);
        return tx;
      });

      const deployerConfig = {
        address: key1.publicKey(),
        signers: [key1, signCallback],
      };

      await deployer.uploadWasm(VALID_WASM, deployerConfig);

      expect(signCallback).toHaveBeenCalled();
    });
  });

  describe('deployContract', () => {
    it('supports multiple signers', async () => {
      const deployerConfig = {
        address: key1.publicKey(),
        signers: [key1, key2],
      };

      await deployer.deployContract(WASM_HASH, deployerConfig);

      expect(mockGetAccount).toHaveBeenCalledWith(key1.publicKey());
    });
  });

  describe('estimate fees', () => {
    it('estimateUploadFee supports DeployerAccount (address only)', async () => {
      const deployerConfig = {
        address: 'GCMultiSig...',
        signers: [], // Signers not needed for simulation
      };

      await deployer.estimateUploadFee(VALID_WASM, deployerConfig);
      expect(mockGetAccount).toHaveBeenCalledWith('GCMultiSig...');
    });

    it('estimateDeployFee supports DeployerAccount (address only)', async () => {
      const deployerConfig = {
        address: 'GCMultiSig...',
        signers: [],
      };

      await deployer.estimateDeployFee(WASM_HASH, deployerConfig);
      expect(mockGetAccount).toHaveBeenCalledWith('GCMultiSig...');
    });
  });
});
