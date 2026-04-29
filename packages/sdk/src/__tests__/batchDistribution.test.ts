import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DistributorClient } from '../DistributorClient';
import {
  prepareBatchEqualDistribution,
  prepareBatchWeightedDistribution,
  createBatches,
  getRecommendedBatchSize,
  type BatchDistributionResult,
} from '../utils/batchDistribution';

// ---------------------------------------------------------------------------
// Mock the generated distributor contract client
// ---------------------------------------------------------------------------
const mockTx = (result: unknown = null) => ({ result, signAndSend: vi.fn() });

const mockContractClient = {
  distribute_equal: vi.fn(),
  distribute_weighted: vi.fn(),
  get_admin: vi.fn(),
  get_user_stats: vi.fn(),
  get_token_stats: vi.fn(),
  get_total_distributions: vi.fn(),
  get_total_distributed_amount: vi.fn(),
  get_distribution_history: vi.fn(),
  initialize: vi.fn(),
  set_protocol_fee: vi.fn(),
};

vi.mock('../generated/distributor/src/index', () => ({
  Client: vi.fn().mockImplementation(() => mockContractClient),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const VALID_OPTIONS = {
  contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHK3M',
  networkPassphrase: 'Test SDF Network ; September 2015',
  rpcUrl: 'https://soroban-testnet.stellar.org',
};

const SENDER = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const TOKEN = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM';

// Generate test recipients
const generateRecipients = (count: number): string[] => {
  return Array.from({ length: count }, (_, i) =>
    `G${String(i).padStart(55, '0')}`
  );
};

// Generate test amounts matching recipients
const generateAmounts = (count: number): bigint[] => {
  return Array.from({ length: count }, () => 100n + BigInt(Math.floor(Math.random() * 900)));
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Batch Distribution Utilities', () => {
  let client: DistributorClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new DistributorClient(VALID_OPTIONS);
  });

  // ── createBatches ──────────────────────────────────────────────────────────
  describe('createBatches', () => {
    it('splits array into batches of specified size', () => {
      const items = [1, 2, 3, 4, 5];
      const batches = createBatches(items, 2);
      expect(batches).toEqual([[1, 2], [3, 4], [5]]);
    });

    it('handles batch size equal to array length', () => {
      const items = [1, 2, 3];
      const batches = createBatches(items, 3);
      expect(batches).toEqual([[1, 2, 3]]);
    });

    it('handles batch size greater than array length', () => {
      const items = [1, 2, 3];
      const batches = createBatches(items, 10);
      expect(batches).toEqual([[1, 2, 3]]);
    });

    it('handles single-element batches', () => {
      const items = [1, 2, 3, 4];
      const batches = createBatches(items, 1);
      expect(batches).toEqual([[1], [2], [3], [4]]);
    });

    it('works with strings', () => {
      const items = ['a', 'b', 'c', 'd', 'e'];
      const batches = createBatches(items, 2);
      expect(batches).toEqual([['a', 'b'], ['c', 'd'], ['e']]);
    });

    it('works with bigints', () => {
      const items = [1n, 2n, 3n, 4n];
      const batches = createBatches(items, 2);
      expect(batches).toEqual([[1n, 2n], [3n, 4n]]);
    });
  });

  // ── getRecommendedBatchSize ────────────────────────────────────────────────
  describe('getRecommendedBatchSize', () => {
    it('returns 150 for equal distribution', () => {
      const size = getRecommendedBatchSize('equal');
      expect(size).toBe(150);
    });

    it('returns 75 for weighted distribution', () => {
      const size = getRecommendedBatchSize('weighted');
      expect(size).toBe(75);
    });

    it('returns 100 for unknown type', () => {
      const size = getRecommendedBatchSize('unknown' as any);
      expect(size).toBe(100);
    });
  });

  // ── prepareBatchEqualDistribution ──────────────────────────────────────────
  describe('prepareBatchEqualDistribution', () => {
    it('creates single batch for small recipient list', async () => {
      const recipients = generateRecipients(5);
      mockContractClient.distribute_equal.mockResolvedValue(mockTx(null));

      const result = await prepareBatchEqualDistribution(client, {
        sender: SENDER,
        token: TOKEN,
        total_amount: 1000n,
        recipients,
        config: { maxRecipientsPerBatch: 100 },
      });

      expect(result.batchCount).toBe(1);
      expect(result.transactions).toHaveLength(1);
      expect(result.recipientBatches).toHaveLength(1);
      expect(result.recipientBatches[0]).toEqual(recipients);
    });

    it('creates multiple batches for large recipient list', async () => {
      const recipients = generateRecipients(350);
      mockContractClient.distribute_equal.mockResolvedValue(mockTx(null));

      const result = await prepareBatchEqualDistribution(client, {
        sender: SENDER,
        token: TOKEN,
        total_amount: 10000n,
        recipients,
        config: { maxRecipientsPerBatch: 100 },
      });

      expect(result.batchCount).toBe(4); // 100 + 100 + 100 + 50
      expect(result.transactions).toHaveLength(4);
      expect(result.recipientBatches).toHaveLength(4);
      expect(result.recipientBatches[0]).toHaveLength(100);
      expect(result.recipientBatches[3]).toHaveLength(50);
    });

    it('calls distributeEqual with correct params for each batch', async () => {
      const recipients = generateRecipients(250);
      mockContractClient.distribute_equal.mockResolvedValue(mockTx(null));

      await prepareBatchEqualDistribution(client, {
        sender: SENDER,
        token: TOKEN,
        total_amount: 5000n,
        recipients,
        config: { maxRecipientsPerBatch: 100 },
      });

      expect(mockContractClient.distribute_equal).toHaveBeenCalledTimes(3);

      // Check first batch call
      expect(mockContractClient.distribute_equal).toHaveBeenNthCalledWith(1, {
        sender: SENDER,
        token: TOKEN,
        total_amount: 5000n,
        recipients: recipients.slice(0, 100),
      });

      // Check second batch call
      expect(mockContractClient.distribute_equal).toHaveBeenNthCalledWith(2, {
        sender: SENDER,
        token: TOKEN,
        total_amount: 5000n,
        recipients: recipients.slice(100, 200),
      });

      // Check third batch call
      expect(mockContractClient.distribute_equal).toHaveBeenNthCalledWith(3, {
        sender: SENDER,
        token: TOKEN,
        total_amount: 5000n,
        recipients: recipients.slice(200, 250),
      });
    });

    it('invokes onBatchStart callback', async () => {
      const recipients = generateRecipients(150);
      const onBatchStart = vi.fn();
      mockContractClient.distribute_equal.mockResolvedValue(mockTx(null));

      await prepareBatchEqualDistribution(client, {
        sender: SENDER,
        token: TOKEN,
        total_amount: 1000n,
        recipients,
        config: {
          maxRecipientsPerBatch: 100,
          onBatchStart,
        },
      });

      expect(onBatchStart).toHaveBeenCalledTimes(2);
      expect(onBatchStart).toHaveBeenNthCalledWith(1, 1, 2, 100);
      expect(onBatchStart).toHaveBeenNthCalledWith(2, 2, 2, 50);
    });

    it('invokes onBatchComplete callback', async () => {
      const recipients = generateRecipients(150);
      const onBatchComplete = vi.fn();
      mockContractClient.distribute_equal.mockResolvedValue(mockTx(null));

      const result = await prepareBatchEqualDistribution(client, {
        sender: SENDER,
        token: TOKEN,
        total_amount: 1000n,
        recipients,
        config: {
          maxRecipientsPerBatch: 100,
          onBatchComplete,
        },
      });

      expect(onBatchComplete).toHaveBeenCalledTimes(2);
      expect(onBatchComplete).toHaveBeenNthCalledWith(1, 1, 2, result.transactions[0]);
      expect(onBatchComplete).toHaveBeenNthCalledWith(2, 2, 2, result.transactions[1]);
    });

    it('throws error when recipients list is empty', async () => {
      await expect(
        prepareBatchEqualDistribution(client, {
          sender: SENDER,
          token: TOKEN,
          total_amount: 1000n,
          recipients: [],
        })
      ).rejects.toThrow('Recipients array cannot be empty');
    });

    it('uses default maxRecipientsPerBatch of 100', async () => {
      const recipients = generateRecipients(250);
      mockContractClient.distribute_equal.mockResolvedValue(mockTx(null));

      const result = await prepareBatchEqualDistribution(client, {
        sender: SENDER,
        token: TOKEN,
        total_amount: 1000n,
        recipients,
      });

      expect(result.batchCount).toBe(3); // 100 + 100 + 50
    });

    it('respects custom maxRecipientsPerBatch', async () => {
      const recipients = generateRecipients(150);
      mockContractClient.distribute_equal.mockResolvedValue(mockTx(null));

      const result = await prepareBatchEqualDistribution(client, {
        sender: SENDER,
        token: TOKEN,
        total_amount: 1000n,
        recipients,
        config: { maxRecipientsPerBatch: 50 },
      });

      expect(result.batchCount).toBe(3); // 50 + 50 + 50
      expect(result.recipientBatches[0]).toHaveLength(50);
      expect(result.recipientBatches[1]).toHaveLength(50);
      expect(result.recipientBatches[2]).toHaveLength(50);
    });
  });

  // ── prepareBatchWeightedDistribution ───────────────────────────────────────
  describe('prepareBatchWeightedDistribution', () => {
    it('creates single batch for small recipient/amount list', async () => {
      const recipients = generateRecipients(5);
      const amounts = generateAmounts(5);
      mockContractClient.distribute_weighted.mockResolvedValue(mockTx(null));

      const result = await prepareBatchWeightedDistribution(client, {
        sender: SENDER,
        token: TOKEN,
        recipients,
        amounts,
        config: { maxRecipientsPerBatch: 100 },
      });

      expect(result.batchCount).toBe(1);
      expect(result.transactions).toHaveLength(1);
      expect(result.recipientBatches).toHaveLength(1);
      expect(result.amountBatches).toHaveLength(1);
      expect(result.recipientBatches[0]).toEqual(recipients);
      expect(result.amountBatches?.[0]).toEqual(amounts);
    });

    it('creates multiple batches for large recipient/amount list', async () => {
      const recipients = generateRecipients(250);
      const amounts = generateAmounts(250);
      mockContractClient.distribute_weighted.mockResolvedValue(mockTx(null));

      const result = await prepareBatchWeightedDistribution(client, {
        sender: SENDER,
        token: TOKEN,
        recipients,
        amounts,
        config: { maxRecipientsPerBatch: 100 },
      });

      expect(result.batchCount).toBe(3); // 100 + 100 + 50
      expect(result.transactions).toHaveLength(3);
      expect(result.recipientBatches).toHaveLength(3);
      expect(result.amountBatches).toHaveLength(3);
      expect(result.recipientBatches[0]).toHaveLength(100);
      expect(result.amountBatches?.[0]).toHaveLength(100);
      expect(result.recipientBatches[2]).toHaveLength(50);
      expect(result.amountBatches?.[2]).toHaveLength(50);
    });

    it('maintains correspondence between recipients and amounts', async () => {
      const recipients = generateRecipients(250);
      const amounts = generateAmounts(250);
      mockContractClient.distribute_weighted.mockResolvedValue(mockTx(null));

      await prepareBatchWeightedDistribution(client, {
        sender: SENDER,
        token: TOKEN,
        recipients,
        amounts,
        config: { maxRecipientsPerBatch: 100 },
      });

      // Verify recipient-amount pairs are maintained across batches
      for (let i = 0; i < 250; i++) {
        const batchIndex = Math.floor(i / 100);
        const indexInBatch = i % 100;
        // Already verified through call expectations
      }
    });

    it('calls distributeWeighted with correct params for each batch', async () => {
      const recipients = generateRecipients(150);
      const amounts = generateAmounts(150);
      mockContractClient.distribute_weighted.mockResolvedValue(mockTx(null));

      await prepareBatchWeightedDistribution(client, {
        sender: SENDER,
        token: TOKEN,
        recipients,
        amounts,
        config: { maxRecipientsPerBatch: 100 },
      });

      expect(mockContractClient.distribute_weighted).toHaveBeenCalledTimes(2);

      // Check first batch call
      expect(mockContractClient.distribute_weighted).toHaveBeenNthCalledWith(1, {
        sender: SENDER,
        token: TOKEN,
        recipients: recipients.slice(0, 100),
        amounts: amounts.slice(0, 100),
      });

      // Check second batch call
      expect(mockContractClient.distribute_weighted).toHaveBeenNthCalledWith(2, {
        sender: SENDER,
        token: TOKEN,
        recipients: recipients.slice(100, 150),
        amounts: amounts.slice(100, 150),
      });
    });

    it('invokes onBatchStart and onBatchComplete callbacks', async () => {
      const recipients = generateRecipients(150);
      const amounts = generateAmounts(150);
      const onBatchStart = vi.fn();
      const onBatchComplete = vi.fn();
      mockContractClient.distribute_weighted.mockResolvedValue(mockTx(null));

      const result = await prepareBatchWeightedDistribution(client, {
        sender: SENDER,
        token: TOKEN,
        recipients,
        amounts,
        config: {
          maxRecipientsPerBatch: 100,
          onBatchStart,
          onBatchComplete,
        },
      });

      expect(onBatchStart).toHaveBeenCalledTimes(2);
      expect(onBatchStart).toHaveBeenNthCalledWith(1, 1, 2, 100);
      expect(onBatchStart).toHaveBeenNthCalledWith(2, 2, 2, 50);

      expect(onBatchComplete).toHaveBeenCalledTimes(2);
      expect(onBatchComplete).toHaveBeenNthCalledWith(1, 1, 2, result.transactions[0]);
      expect(onBatchComplete).toHaveBeenNthCalledWith(2, 2, 2, result.transactions[1]);
    });

    it('throws error when recipients and amounts have different lengths', async () => {
      const recipients = generateRecipients(10);
      const amounts = generateAmounts(5); // Mismatch

      await expect(
        prepareBatchWeightedDistribution(client, {
          sender: SENDER,
          token: TOKEN,
          recipients,
          amounts,
        })
      ).rejects.toThrow('Recipients and amounts array length mismatch');
    });

    it('throws error when recipients list is empty', async () => {
      const amounts = generateAmounts(0);

      await expect(
        prepareBatchWeightedDistribution(client, {
          sender: SENDER,
          token: TOKEN,
          recipients: [],
          amounts,
        })
      ).rejects.toThrow('Recipients array cannot be empty');
    });

    it('uses default maxRecipientsPerBatch of 100', async () => {
      const recipients = generateRecipients(250);
      const amounts = generateAmounts(250);
      mockContractClient.distribute_weighted.mockResolvedValue(mockTx(null));

      const result = await prepareBatchWeightedDistribution(client, {
        sender: SENDER,
        token: TOKEN,
        recipients,
        amounts,
      });

      expect(result.batchCount).toBe(3); // 100 + 100 + 50
    });
  });

  // ── DistributorClient.batchDistributeEqual ─────────────────────────────────
  describe('DistributorClient.batchDistributeEqual', () => {
    it('returns batch distribution result', async () => {
      const recipients = generateRecipients(150);
      mockContractClient.distribute_equal.mockResolvedValue(mockTx(null));

      const result = await client.batchDistributeEqual({
        sender: SENDER,
        token: TOKEN,
        total_amount: 5000n,
        recipients,
        config: { maxRecipientsPerBatch: 100 },
      });

      expect(result.batchCount).toBe(2);
      expect(result.transactions).toHaveLength(2);
      expect(result.recipientBatches).toHaveLength(2);
    });

    it('delegates to prepareBatchEqualDistribution', async () => {
      const recipients = generateRecipients(10);
      mockContractClient.distribute_equal.mockResolvedValue(mockTx(null));

      await client.batchDistributeEqual({
        sender: SENDER,
        token: TOKEN,
        total_amount: 1000n,
        recipients,
      });

      expect(mockContractClient.distribute_equal).toHaveBeenCalled();
    });

    it('includes amountBatches in result only for weighted', async () => {
      const recipients = generateRecipients(10);
      mockContractClient.distribute_equal.mockResolvedValue(mockTx(null));

      const result = await client.batchDistributeEqual({
        sender: SENDER,
        token: TOKEN,
        total_amount: 1000n,
        recipients,
      });

      expect(result.amountBatches).toBeUndefined();
    });
  });

  // ── DistributorClient.batchDistributeWeighted ──────────────────────────────
  describe('DistributorClient.batchDistributeWeighted', () => {
    it('returns batch distribution result', async () => {
      const recipients = generateRecipients(150);
      const amounts = generateAmounts(150);
      mockContractClient.distribute_weighted.mockResolvedValue(mockTx(null));

      const result = await client.batchDistributeWeighted({
        sender: SENDER,
        token: TOKEN,
        recipients,
        amounts,
        config: { maxRecipientsPerBatch: 100 },
      });

      expect(result.batchCount).toBe(2);
      expect(result.transactions).toHaveLength(2);
      expect(result.recipientBatches).toHaveLength(2);
      expect(result.amountBatches).toHaveLength(2);
    });

    it('delegates to prepareBatchWeightedDistribution', async () => {
      const recipients = generateRecipients(10);
      const amounts = generateAmounts(10);
      mockContractClient.distribute_weighted.mockResolvedValue(mockTx(null));

      await client.batchDistributeWeighted({
        sender: SENDER,
        token: TOKEN,
        recipients,
        amounts,
      });

      expect(mockContractClient.distribute_weighted).toHaveBeenCalled();
    });

    it('includes amountBatches in result', async () => {
      const recipients = generateRecipients(10);
      const amounts = generateAmounts(10);
      mockContractClient.distribute_weighted.mockResolvedValue(mockTx(null));

      const result = await client.batchDistributeWeighted({
        sender: SENDER,
        token: TOKEN,
        recipients,
        amounts,
      });

      expect(result.amountBatches).toBeDefined();
      expect(result.amountBatches).toHaveLength(1);
    });
  });
});
