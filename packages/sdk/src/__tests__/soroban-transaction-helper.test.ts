import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  estimateTransactionFee,
  analyzeNetworkCongestion,
  suggestFee,
  suggestResourceLimits,
  type TransactionEstimate,
  type NetworkMetrics,
  type ResourceUsage,
} from '../utils/soroban-transaction-helper';
import { Server, Api } from '@stellar/stellar-sdk/rpc';
import { TransactionBuilder, Networks, Keypair } from '@stellar/stellar-sdk';

describe('soroban transaction helper', () => {
  describe('estimateTransactionFee', () => {
    it('returns successful estimate with resource usage', async () => {
      const mockRpc = {
        simulateTransaction: vi.fn().mockResolvedValue({
          minResourceFee: '50000',
          transactionData: 'AAAAAQAAAAA=',
          results: [],
        }),
      } as unknown as Server;

      const keypair = Keypair.random();
      const sourceAccount = {
        accountId: () => keypair.publicKey(),
        sequenceNumber: () => '1',
        incrementSequenceNumber: () => {},
      };

      const tx = new TransactionBuilder(sourceAccount as any, {
        fee: '100',
        networkPassphrase: Networks.TESTNET,
      })
        .setTimeout(30)
        .build();

      const estimate = await estimateTransactionFee(mockRpc, tx);

      expect(estimate.success).toBe(true);
      expect(estimate.minResourceFee).toBe('50000');
      expect(estimate.recommendedFee).toBe('60100'); // 50000 * 1.2 + 100
      expect(estimate.resources).toBeDefined();
    });

    it('applies custom fee buffer multiplier', async () => {
      const mockRpc = {
        simulateTransaction: vi.fn().mockResolvedValue({
          minResourceFee: '50000',
          transactionData: 'AAAAAQAAAAA=',
          results: [],
        }),
      } as unknown as Server;

      const keypair = Keypair.random();
      const sourceAccount = {
        accountId: () => keypair.publicKey(),
        sequenceNumber: () => '1',
        incrementSequenceNumber: () => {},
      };

      const tx = new TransactionBuilder(sourceAccount as any, {
        fee: '100',
        networkPassphrase: Networks.TESTNET,
      })
        .setTimeout(30)
        .build();

      const estimate = await estimateTransactionFee(mockRpc, tx, {
        feeBufferMultiplier: 1.5,
      });

      expect(estimate.recommendedFee).toBe('75100'); // 50000 * 1.5 + 100
    });

    it('handles simulation errors gracefully', async () => {
      const mockRpc = {
        simulateTransaction: vi.fn().mockResolvedValue({
          error: 'Insufficient fee',
          results: [],
        }),
      } as unknown as Server;

      const keypair = Keypair.random();
      const sourceAccount = {
        accountId: () => keypair.publicKey(),
        sequenceNumber: () => '1',
        incrementSequenceNumber: () => {},
      };

      const tx = new TransactionBuilder(sourceAccount as any, {
        fee: '100',
        networkPassphrase: Networks.TESTNET,
      })
        .setTimeout(30)
        .build();

      const estimate = await estimateTransactionFee(mockRpc, tx);

      expect(estimate.success).toBe(false);
      expect(estimate.error).toBe('Insufficient fee');
    });

    it('retries on transient failures', async () => {
      const mockRpc = {
        simulateTransaction: vi.fn()
          .mockRejectedValueOnce(new Error('Network error'))
          .mockResolvedValue({
            minResourceFee: '30000',
            transactionData: 'AAAAAQAAAAA=',
            results: [],
          }),
      } as unknown as Server;

      const keypair = Keypair.random();
      const sourceAccount = {
        accountId: () => keypair.publicKey(),
        sequenceNumber: () => '1',
        incrementSequenceNumber: () => {},
      };

      const tx = new TransactionBuilder(sourceAccount as any, {
        fee: '100',
        networkPassphrase: Networks.TESTNET,
      })
        .setTimeout(30)
        .build();

      const estimate = await estimateTransactionFee(mockRpc, tx, {
        maxRetries: 2,
        retryDelayMs: 10,
      });

      expect(estimate.success).toBe(true);
      expect(mockRpc.simulateTransaction).toHaveBeenCalledTimes(2);
    });

    it('returns failure after max retries exceeded', async () => {
      const mockRpc = {
        simulateTransaction: vi.fn().mockRejectedValue(new Error('Persistent error')),
      } as unknown as Server;

      const keypair = Keypair.random();
      const sourceAccount = {
        accountId: () => keypair.publicKey(),
        sequenceNumber: () => '1',
        incrementSequenceNumber: () => {},
      };

      const tx = new TransactionBuilder(sourceAccount as any, {
        fee: '100',
        networkPassphrase: Networks.TESTNET,
      })
        .setTimeout(30)
        .build();

      const estimate = await estimateTransactionFee(mockRpc, tx, {
        maxRetries: 2,
        retryDelayMs: 10,
      });

      expect(estimate.success).toBe(false);
      expect(estimate.error).toBe('Persistent error');
    });
  });

  describe('analyzeNetworkCongestion', () => {
    it('analyzes network congestion from recent ledgers', async () => {
      const mockRpc = {
        getLatestLedger: vi.fn().mockResolvedValue({
          sequence: '100',
        }),
        getLedger: vi.fn()
          .mockResolvedValueOnce({ baseFeeInStroops: '100' })
          .mockResolvedValueOnce({ baseFeeInStroops: '150' })
          .mockResolvedValueOnce({ baseFeeInStroops: '200' }),
      } as unknown as Server;

      const metrics = await analyzeNetworkCongestion(mockRpc, 3);

      expect(metrics.congestionLevel).toBeDefined();
      expect(metrics.averageFee).toBeDefined();
      expect(metrics.minFee).toBe('100');
      expect(metrics.maxFee).toBe('200');
      expect(metrics.ledgerCount).toBe(3);
    });

    it('returns default metrics on RPC failure', async () => {
      const mockRpc = {
        getLatestLedger: vi.fn().mockRejectedValue(new Error('RPC error')),
      } as unknown as Server;

      const metrics = await analyzeNetworkCongestion(mockRpc);

      expect(metrics.congestionLevel).toBe('medium');
      expect(metrics.averageFee).toBe('100');
      expect(metrics.ledgerCount).toBe(0);
    });

    it('determines low congestion when fees are minimal', async () => {
      const mockRpc = {
        getLatestLedger: vi.fn().mockResolvedValue({
          sequence: '100',
        }),
        getLedger: vi.fn().mockResolvedValue({ baseFeeInStroops: '100' }),
      } as unknown as Server;

      const metrics = await analyzeNetworkCongestion(mockRpc, 5);

      expect(metrics.congestionLevel).toBe('low');
    });

    it('handles missing ledger data gracefully', async () => {
      const mockRpc = {
        getLatestLedger: vi.fn().mockResolvedValue({
          sequence: '100',
        }),
        getLedger: vi.fn()
          .mockResolvedValueOnce({ baseFeeInStroops: '100' })
          .mockRejectedValueOnce(new Error('Ledger not found'))
          .mockResolvedValueOnce({ baseFeeInStroops: '150' }),
      } as unknown as Server;

      const metrics = await analyzeNetworkCongestion(mockRpc, 3);

      expect(metrics.ledgerCount).toBeLessThanOrEqual(3);
    });
  });

  describe('suggestFee', () => {
    it('suggests fee based on estimate and network metrics', () => {
      const estimate: TransactionEstimate = {
        recommendedFee: '50000',
        minResourceFee: '40000',
        resources: {
          instructions: 100000,
          readBytes: 5000,
          writeBytes: 2000,
          readEntries: 5,
          writeEntries: 2,
        },
        success: true,
      };

      const metrics: NetworkMetrics = {
        congestionLevel: 'medium',
        averageFee: '150',
        minFee: '100',
        maxFee: '200',
        ledgerCount: 10,
      };

      const suggested = suggestFee(estimate, metrics);

      expect(suggested).toBeDefined();
      expect(BigInt(suggested)).toBeGreaterThanOrEqual(BigInt(estimate.recommendedFee));
    });

    it('applies high congestion multiplier', () => {
      const estimate: TransactionEstimate = {
        recommendedFee: '50000',
        minResourceFee: '40000',
        resources: {
          instructions: 100000,
          readBytes: 5000,
          writeBytes: 2000,
          readEntries: 5,
          writeEntries: 2,
        },
        success: true,
      };

      const metrics: NetworkMetrics = {
        congestionLevel: 'high',
        averageFee: '500',
        minFee: '200',
        maxFee: '800',
        ledgerCount: 10,
      };

      const suggested = suggestFee(estimate, metrics);

      expect(BigInt(suggested)).toBeGreaterThan(BigInt(estimate.recommendedFee));
    });

    it('uses base fee when estimate failed', () => {
      const estimate: TransactionEstimate = {
        recommendedFee: '100',
        minResourceFee: '0',
        resources: {
          instructions: 0,
          readBytes: 0,
          writeBytes: 0,
          readEntries: 0,
          writeEntries: 0,
        },
        success: false,
        error: 'Simulation failed',
      };

      const metrics: NetworkMetrics = {
        congestionLevel: 'medium',
        averageFee: '200',
        minFee: '100',
        maxFee: '300',
        ledgerCount: 10,
      };

      const suggested = suggestFee(estimate, metrics);

      expect(suggested).toBe('100');
    });

    it('ensures fee is at least network average', () => {
      const estimate: TransactionEstimate = {
        recommendedFee: '50',
        minResourceFee: '40',
        resources: {
          instructions: 100000,
          readBytes: 5000,
          writeBytes: 2000,
          readEntries: 5,
          writeEntries: 2,
        },
        success: true,
      };

      const metrics: NetworkMetrics = {
        congestionLevel: 'low',
        averageFee: '500',
        minFee: '400',
        maxFee: '600',
        ledgerCount: 10,
      };

      const suggested = suggestFee(estimate, metrics);

      expect(BigInt(suggested)).toBeGreaterThanOrEqual(BigInt(metrics.averageFee));
    });
  });

  describe('suggestResourceLimits', () => {
    it('applies buffer multiplier to resource estimates', () => {
      const estimate: TransactionEstimate = {
        recommendedFee: '50000',
        minResourceFee: '40000',
        resources: {
          instructions: 100000,
          readBytes: 5000,
          writeBytes: 2000,
          readEntries: 5,
          writeEntries: 2,
        },
        success: true,
      };

      const limits = suggestResourceLimits(estimate, 1.5);

      expect(limits.instructions).toBe(150000); // 100000 * 1.5
      expect(limits.readBytes).toBe(7500); // 5000 * 1.5
      expect(limits.writeBytes).toBe(3000); // 2000 * 1.5
      expect(limits.readEntries).toBe(8); // 5 * 1.5 rounded up
      expect(limits.writeEntries).toBe(3); // 2 * 1.5 rounded up
    });

    it('uses default buffer when not specified', () => {
      const estimate: TransactionEstimate = {
        recommendedFee: '50000',
        minResourceFee: '40000',
        resources: {
          instructions: 100000,
          readBytes: 5000,
          writeBytes: 2000,
          readEntries: 5,
          writeEntries: 2,
        },
        success: true,
      };

      const limits = suggestResourceLimits(estimate);

      expect(limits.instructions).toBe(130000); // 100000 * 1.3
    });

    it('returns safe defaults when estimate failed', () => {
      const estimate: TransactionEstimate = {
        recommendedFee: '100',
        minResourceFee: '0',
        resources: {
          instructions: 0,
          readBytes: 0,
          writeBytes: 0,
          readEntries: 0,
          writeEntries: 0,
        },
        success: false,
        error: 'Simulation failed',
      };

      const limits = suggestResourceLimits(estimate);

      expect(limits.instructions).toBe(5_000_000);
      expect(limits.readBytes).toBe(200_000);
      expect(limits.writeBytes).toBe(100_000);
      expect(limits.readEntries).toBe(50);
      expect(limits.writeEntries).toBe(20);
    });

    it('ensures minimum buffer multiplier', () => {
      const estimate: TransactionEstimate = {
        recommendedFee: '50000',
        minResourceFee: '40000',
        resources: {
          instructions: 100000,
          readBytes: 5000,
          writeBytes: 2000,
          readEntries: 5,
          writeEntries: 2,
        },
        success: true,
      };

      const limits = suggestResourceLimits(estimate, 0.5); // Below minimum

      expect(limits.instructions).toBeGreaterThanOrEqual(110000); // At least 1.1x
    });
  });
});
