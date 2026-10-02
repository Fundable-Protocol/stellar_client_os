import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createBatches,
  prepareBatchEqualDistribution,
  prepareBatchWeightedDistribution,
} from '../utils/batchDistribution.js';

const mockDistributeEqual = vi.fn();
const mockDistributeWeighted = vi.fn();

const mockClient = {
  distributeEqual: mockDistributeEqual,
  distributeWeighted: mockDistributeWeighted,
} as any;

describe('createBatches', () => {
  it('splits arrays into fixed-size batches', () => {
    expect(createBatches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it.each([0, -1, 1.5])('rejects invalid batchSize %s', (batchSize) => {
    expect(() => createBatches([1, 2, 3], batchSize)).toThrow(
      /batchSize must be a positive integer/
    );
  });
});

describe('prepareBatchEqualDistribution', () => {
  beforeEach(() => {
    mockDistributeEqual.mockReset();
    mockDistributeEqual.mockResolvedValue({ id: 'tx' });
  });

  it('rejects invalid maxRecipientsPerBatch before RPC calls', async () => {
    await expect(
      prepareBatchEqualDistribution(mockClient, {
        sender: 'GAAAA',
        token: 'native',
        total_amount: 100n,
        recipients: ['GAAAA', 'GBBBB'],
        config: { maxRecipientsPerBatch: 0 },
      })
    ).rejects.toThrow(/config\.maxRecipientsPerBatch must be a positive integer/);

    expect(mockDistributeEqual).not.toHaveBeenCalled();
  });
});

describe('prepareBatchWeightedDistribution', () => {
  beforeEach(() => {
    mockDistributeWeighted.mockReset();
    mockDistributeWeighted.mockResolvedValue({ id: 'tx' });
  });

  it('rejects invalid maxRecipientsPerBatch before RPC calls', async () => {
    await expect(
      prepareBatchWeightedDistribution(mockClient, {
        sender: 'GAAAA',
        token: 'native',
        recipients: ['GAAAA', 'GBBBB'],
        amounts: [100n, 200n],
        config: { maxRecipientsPerBatch: -1 },
      })
    ).rejects.toThrow(/config\.maxRecipientsPerBatch must be a positive integer/);

    expect(mockDistributeWeighted).not.toHaveBeenCalled();
  });
});
