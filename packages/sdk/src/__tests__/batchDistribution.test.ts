import { describe, expect, it, vi, beforeEach } from "vitest";
import type { DistributorClient } from "../DistributorClient";
import {
  createBatches,
  prepareBatchEqualDistribution,
  prepareBatchWeightedDistribution,
} from "../utils/batchDistribution";

const SENDER = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const TOKEN = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";
const RECIPIENT_A = "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
const RECIPIENT_B = "GCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC";
const RECIPIENT_C = "GDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD";

function createMockClient(): DistributorClient {
  return {
    distributeEqual: vi.fn().mockResolvedValue({ signAndSend: vi.fn() }),
    distributeWeighted: vi.fn().mockResolvedValue({ signAndSend: vi.fn() }),
  } as unknown as DistributorClient;
}

describe("batchDistribution", () => {
  let client: DistributorClient;

  beforeEach(() => {
    client = createMockClient();
  });

  describe("createBatches", () => {
    it("splits arrays into fixed-size chunks", () => {
      expect(createBatches([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
    });

    it("rejects zero batch size", () => {
      expect(() => createBatches([1, 2, 3], 0)).toThrow(
        "batchSize must be a positive integer"
      );
    });

    it("rejects negative batch size", () => {
      expect(() => createBatches([1, 2, 3], -1)).toThrow(
        "batchSize must be a positive integer"
      );
    });

    it("rejects fractional batch size", () => {
      expect(() => createBatches([1, 2, 3], 1.5)).toThrow(
        "batchSize must be a positive integer"
      );
    });
  });

  describe("prepareBatchEqualDistribution", () => {
    it.each([0, -1, 1.5])(
      "rejects maxRecipientsPerBatch=%s before RPC calls",
      async (maxRecipientsPerBatch) => {
        await expect(
          prepareBatchEqualDistribution(client, {
            sender: SENDER,
            token: TOKEN,
            total_amount: 300n,
            recipients: [RECIPIENT_A, RECIPIENT_B],
            config: { maxRecipientsPerBatch },
          })
        ).rejects.toThrow(
          "config.maxRecipientsPerBatch must be a positive integer"
        );

        expect(client.distributeEqual).not.toHaveBeenCalled();
      }
    );
  });

  describe("prepareBatchWeightedDistribution", () => {
    it.each([0, -1, 1.5])(
      "rejects maxRecipientsPerBatch=%s before RPC calls",
      async (maxRecipientsPerBatch) => {
        await expect(
          prepareBatchWeightedDistribution(client, {
            sender: SENDER,
            token: TOKEN,
            recipients: [RECIPIENT_A, RECIPIENT_B, RECIPIENT_C],
            amounts: [100n, 200n, 300n],
            config: { maxRecipientsPerBatch },
          })
        ).rejects.toThrow(
          "config.maxRecipientsPerBatch must be a positive integer"
        );

        expect(client.distributeWeighted).not.toHaveBeenCalled();
      }
    );
  });
});
