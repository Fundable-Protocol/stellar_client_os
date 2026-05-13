import { describe, expect, it, vi } from "vitest";
import type { DistributorClient } from "../DistributorClient";
import {
  createBatches,
  prepareBatchEqualDistribution,
  prepareBatchWeightedDistribution,
} from "../utils/batchDistribution";

const SENDER = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const TOKEN = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";
const RECIPIENTS = [
  "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
  "GCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
  "GDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD",
];

const mockTx = { result: null, signAndSend: vi.fn() };

function createMockDistributorClient(): DistributorClient {
  return {
    distributeEqual: vi.fn().mockResolvedValue(mockTx),
    distributeWeighted: vi.fn().mockResolvedValue(mockTx),
  } as unknown as DistributorClient;
}

describe("batch distribution utilities", () => {
  describe("createBatches", () => {
    it("splits arrays into fixed-size batches", () => {
      expect(createBatches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    });

    it.each([0, -1, 1.5])("rejects invalid batch size %s", (batchSize) => {
      expect(() => createBatches([1, 2, 3], batchSize)).toThrow(
        "batchSize must be a positive integer"
      );
    });
  });

  describe("prepareBatchEqualDistribution", () => {
    it.each([0, -1, 1.5])(
      "rejects invalid maxRecipientsPerBatch %s before RPC calls",
      async (maxRecipientsPerBatch) => {
        const client = createMockDistributorClient();

        await expect(
          prepareBatchEqualDistribution(client, {
            sender: SENDER,
            token: TOKEN,
            total_amount: 1000n,
            recipients: RECIPIENTS,
            config: { maxRecipientsPerBatch },
          })
        ).rejects.toThrow(
          "config.maxRecipientsPerBatch must be a positive integer"
        );

        expect(client.distributeEqual).not.toHaveBeenCalled();
      }
    );

    it("uses a valid custom maxRecipientsPerBatch", async () => {
      const client = createMockDistributorClient();

      const result = await prepareBatchEqualDistribution(client, {
        sender: SENDER,
        token: TOKEN,
        total_amount: 1000n,
        recipients: RECIPIENTS,
        config: { maxRecipientsPerBatch: 2 },
      });

      expect(result.batchCount).toBe(2);
      expect(result.recipientBatches).toEqual([
        [RECIPIENTS[0], RECIPIENTS[1]],
        [RECIPIENTS[2]],
      ]);
      expect(client.distributeEqual).toHaveBeenCalledTimes(2);
    });
  });

  describe("prepareBatchWeightedDistribution", () => {
    it.each([0, -1, 1.5])(
      "rejects invalid maxRecipientsPerBatch %s before RPC calls",
      async (maxRecipientsPerBatch) => {
        const client = createMockDistributorClient();

        await expect(
          prepareBatchWeightedDistribution(client, {
            sender: SENDER,
            token: TOKEN,
            recipients: RECIPIENTS,
            amounts: [500n, 300n, 200n],
            config: { maxRecipientsPerBatch },
          })
        ).rejects.toThrow(
          "config.maxRecipientsPerBatch must be a positive integer"
        );

        expect(client.distributeWeighted).not.toHaveBeenCalled();
      }
    );

    it("uses a valid custom maxRecipientsPerBatch", async () => {
      const client = createMockDistributorClient();

      const result = await prepareBatchWeightedDistribution(client, {
        sender: SENDER,
        token: TOKEN,
        recipients: RECIPIENTS,
        amounts: [500n, 300n, 200n],
        config: { maxRecipientsPerBatch: 2 },
      });

      expect(result.batchCount).toBe(2);
      expect(result.amountBatches).toEqual([[500n, 300n], [200n]]);
      expect(client.distributeWeighted).toHaveBeenCalledTimes(2);
    });
  });
});
