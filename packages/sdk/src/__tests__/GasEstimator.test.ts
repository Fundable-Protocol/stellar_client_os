import { describe, expect, it, vi } from "vitest";
import {
  GasEstimator,
  estimateSorobanGas,
  type GasEstimatorRpc,
} from "../utils/GasEstimator";

function createRpc(overrides: Partial<GasEstimatorRpc> = {}): GasEstimatorRpc {
  return {
    simulateTransaction: vi.fn().mockResolvedValue({
      minResourceFee: "1000",
    }),
    getFeeStats: vi.fn().mockResolvedValue({
      inclusionFee: {
        p50: "100",
        p90: "120",
        p95: "140",
        p99: "200",
        transactionCount: "5",
      },
    }),
    ...overrides,
  } as GasEstimatorRpc;
}

describe("GasEstimator", () => {
  it("combines simulation resource fees with low congestion fee stats", async () => {
    const rpc = createRpc();
    const estimator = new GasEstimator({ rpc });

    const estimate = await estimator.estimate({} as any);

    expect(rpc.simulateTransaction).toHaveBeenCalled();
    expect(rpc.getFeeStats).toHaveBeenCalled();
    expect(estimate.minResourceFee).toBe("1000");
    expect(estimate.resourceFee).toBe("1200");
    expect(estimate.inclusionFee).toBe("110");
    expect(estimate.recommendedFee).toBe("1310");
    expect(estimate.congestionLevel).toBe("low");
  });

  it("uses higher percentiles and a larger buffer during high congestion", async () => {
    const rpc = createRpc({
      getFeeStats: vi.fn().mockResolvedValue({
        inclusionFee: {
          p50: "200",
          p90: "450",
          p95: "700",
          p99: "1200",
          transactionCount: "520",
        },
      }),
    });
    const estimator = new GasEstimator({ rpc });

    const estimate = await estimator.estimate({} as any);

    expect(estimate.congestionLevel).toBe("high");
    expect(estimate.inclusionFee).toBe("945");
    expect(estimate.recommendedFee).toBe("2145");
  });

  it("falls back to the configured base fee when fee stats are unavailable", async () => {
    const rpc = createRpc({
      getFeeStats: vi.fn().mockRejectedValue(new Error("method not found")),
    });
    const estimator = new GasEstimator({ rpc, baseFee: "250" });

    const estimate = await estimator.estimate({} as any);

    expect(estimate.congestionLevel).toBe("unknown");
    expect(estimate.inclusionFee).toBe("275");
    expect(estimate.recommendedFee).toBe("1475");
  });

  it("buffers resource limits parsed from Soroban transaction data", async () => {
    const resources = {
      instructions: () => 10,
      readBytes: () => 20,
      writeBytes: () => 30,
      footprint: () => ({
        readOnly: () => ["a", "b"],
        readWrite: () => ["c"],
      }),
    };
    const transactionData = {
      resources: () => resources,
    };
    const rpc = createRpc({
      simulateTransaction: vi.fn().mockResolvedValue({
        minResourceFee: "1000",
        transactionData,
      }),
    });
    const estimator = new GasEstimator({ rpc, resourceBuffer: 1.5 });

    const estimate = await estimator.estimate({} as any);

    expect(estimate.resourceLimits).toEqual({
      instructions: 15,
      readBytes: 30,
      writeBytes: 45,
      readEntries: 3,
      writeEntries: 2,
    });
  });

  it("throws when simulation returns an error response", async () => {
    const rpc = createRpc({
      simulateTransaction: vi
        .fn()
        .mockResolvedValue({ error: "host function failed" }),
    });
    const estimator = new GasEstimator({ rpc });

    await expect(estimator.estimate({} as any)).rejects.toThrow(
      "Gas estimation simulation failed: host function failed"
    );
  });

  it("provides a function helper for one-off estimates", async () => {
    const rpc = createRpc();

    const estimate = await estimateSorobanGas({} as any, { rpc });

    expect(estimate.recommendedFee).toBe("1310");
  });
});
