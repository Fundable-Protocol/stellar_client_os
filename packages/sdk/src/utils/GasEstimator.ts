import { xdr } from "@stellar/stellar-sdk";
import { Server, Api } from "@stellar/stellar-sdk/rpc";

const DEFAULT_BASE_FEE = "100";
const DEFAULT_RESOURCE_BUFFER = 1.2;
const DEFAULT_CONGESTION_BUFFER = 1.1;
const DEFAULT_HIGH_CONGESTION_BUFFER = 1.35;

type SimulatableTransaction = Parameters<Server["simulateTransaction"]>[0];

export interface GasEstimatorRpc {
  simulateTransaction(
    tx: SimulatableTransaction
  ): ReturnType<Server["simulateTransaction"]>;
  getFeeStats?: () => Promise<unknown>;
}

export interface GasEstimatorOptions {
  /** Existing Soroban RPC server. When omitted, `rpcUrl` is required. */
  rpc?: GasEstimatorRpc;
  /** Soroban RPC endpoint URL. */
  rpcUrl?: string;
  /** Base Stellar inclusion fee in stroops. Defaults to 100. */
  baseFee?: string;
  /** Multiplier applied to simulated Soroban resource limits. Defaults to 1.2. */
  resourceBuffer?: number;
  /** Multiplier applied to fee recommendations under normal congestion. Defaults to 1.1. */
  congestionBuffer?: number;
  /** Multiplier applied to fee recommendations under high/severe congestion. Defaults to 1.35. */
  highCongestionBuffer?: number;
}

export type CongestionLevel =
  | "low"
  | "moderate"
  | "high"
  | "severe"
  | "unknown";

export interface GasResourceLimits {
  instructions: number;
  readBytes: number;
  writeBytes: number;
  readEntries: number;
  writeEntries: number;
}

export interface GasPriceRecommendation {
  /** Recommended inclusion fee in stroops before Soroban resource fees. */
  inclusionFee: string;
  /** Network congestion estimate derived from RPC fee statistics. */
  congestionLevel: CongestionLevel;
  /** Raw fee stats returned by the RPC server, when available. */
  feeStats?: unknown;
}

export interface GasEstimate {
  /** Minimum Soroban resource fee returned by simulation. */
  minResourceFee: string;
  /** Buffered Soroban resource fee recommendation. */
  resourceFee: string;
  /** Recommended inclusion fee based on recent network congestion. */
  inclusionFee: string;
  /** Total recommended transaction fee in stroops. */
  recommendedFee: string;
  /** Buffered resource limits derived from simulation results. */
  resourceLimits: GasResourceLimits;
  /** Raw simulation response for advanced callers. */
  simulation: Api.SimulateTransactionSuccessResponse;
  /** Congestion estimate used to choose the recommended fee. */
  congestionLevel: CongestionLevel;
  /** Raw fee stats returned by the RPC server, when available. */
  feeStats?: unknown;
}

/**
 * Estimates Soroban transaction fees and resource limits from simulation data
 * plus current RPC fee statistics when available.
 */
export class GasEstimator {
  private readonly rpc: GasEstimatorRpc;
  private readonly baseFee: string;
  private readonly resourceBuffer: number;
  private readonly congestionBuffer: number;
  private readonly highCongestionBuffer: number;

function assertStroopString(value: string, name: string): string {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${name} must be a non-negative integer string in stroops`);
  }
  return value;
}

function assertFinitePositiveNumber(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a finite number greater than 0`);
  }
  return value;
}

  constructor(options: GasEstimatorOptions) {
    if (!options.rpc && !options.rpcUrl) {
      throw new Error("GasEstimator requires either rpc or rpcUrl");
    }

    this.rpc = options.rpc ?? new Server(options.rpcUrl!, { allowHttp: true });
    this.baseFee = assertStroopString(
      options.baseFee ?? DEFAULT_BASE_FEE,
      "baseFee"
    );
    this.resourceBuffer = assertFinitePositiveNumber(
      options.resourceBuffer ?? DEFAULT_RESOURCE_BUFFER,
      "resourceBuffer"
    );
    this.congestionBuffer = assertFinitePositiveNumber(
      options.congestionBuffer ?? DEFAULT_CONGESTION_BUFFER,
      "congestionBuffer"
    );
    this.highCongestionBuffer = assertFinitePositiveNumber(
      options.highCongestionBuffer ?? DEFAULT_HIGH_CONGESTION_BUFFER,
      "highCongestionBuffer"
    );
  }

  async estimate(tx: SimulatableTransaction): Promise<GasEstimate> {
    const simulation = await this.rpc.simulateTransaction(tx);

    if (Api.isSimulationError(simulation)) {
      throw new Error(`Gas estimation simulation failed: ${simulation.error}`);
    }

    const success = simulation as Api.SimulateTransactionSuccessResponse;
    const minResourceFee = success.minResourceFee ?? "0";
    const gasPrice = await this.estimateGasPrice();
    const feeBuffer =
      gasPrice.congestionLevel === "high" ||
      gasPrice.congestionLevel === "severe"
        ? this.highCongestionBuffer
        : this.congestionBuffer;

    const resourceFee = multiplyStroops(minResourceFee, this.resourceBuffer);
    const inclusionFee = multiplyStroops(gasPrice.inclusionFee, feeBuffer);
    const recommendedFee = addStroops(resourceFee, inclusionFee);

    return {
      minResourceFee,
      resourceFee,
      inclusionFee,
      recommendedFee,
      resourceLimits: bufferResourceLimits(
        extractResourceLimits(success),
        this.resourceBuffer
      ),
      simulation: success,
      congestionLevel: gasPrice.congestionLevel,
      feeStats: gasPrice.feeStats,
    };
  }

  async estimateGasPrice(): Promise<GasPriceRecommendation> {
    const feeStats = await this.fetchFeeStats();
    const inclusionFeeStats = extractInclusionFeeStats(feeStats);

    if (!inclusionFeeStats) {
      return {
        inclusionFee: this.baseFee,
        congestionLevel: "unknown",
        feeStats,
      };
    }

    const congestionLevel = classifyCongestion(
      inclusionFeeStats,
      Number(this.baseFee)
    );
    const percentile =
      congestionLevel === "severe"
        ? inclusionFeeStats.p99
        : congestionLevel === "high"
          ? inclusionFeeStats.p95
          : congestionLevel === "moderate"
            ? inclusionFeeStats.p90
            : inclusionFeeStats.p50;

    return {
      inclusionFee: String(Math.max(Number(this.baseFee), percentile)),
      congestionLevel,
      feeStats,
    };
  }

  private async fetchFeeStats(): Promise<unknown> {
    if (!this.rpc.getFeeStats) return undefined;

    try {
      return await this.rpc.getFeeStats();
    } catch {
      return undefined;
    }
  }
}

export async function estimateSorobanGas(
  tx: SimulatableTransaction,
  options: GasEstimatorOptions
): Promise<GasEstimate> {
  return new GasEstimator(options).estimate(tx);
}

function extractResourceLimits(
  simulation: Api.SimulateTransactionSuccessResponse
): GasResourceLimits {
  const transactionData = simulation.transactionData;

  if (!transactionData) {
    return emptyResourceLimits();
  }

  try {
    const data =
      typeof transactionData === "string"
        ? xdr.SorobanTransactionData.fromXDR(transactionData, "base64")
        : transactionData;
    const resources = (data as xdr.SorobanTransactionData).resources();

    return {
      instructions: resources.instructions(),
      readBytes: resources.readBytes(),
      writeBytes: resources.writeBytes(),
      readEntries: resources.footprint().readOnly().length,
      writeEntries: resources.footprint().readWrite().length,
    };
  } catch {
    return emptyResourceLimits();
  }
}

function bufferResourceLimits(
  limits: GasResourceLimits,
  multiplier: number
): GasResourceLimits {
  return {
    instructions: Math.ceil(limits.instructions * multiplier),
    readBytes: Math.ceil(limits.readBytes * multiplier),
    writeBytes: Math.ceil(limits.writeBytes * multiplier),
    readEntries: Math.ceil(limits.readEntries * multiplier),
    writeEntries: Math.ceil(limits.writeEntries * multiplier),
  };
}

function emptyResourceLimits(): GasResourceLimits {
  return {
    instructions: 0,
    readBytes: 0,
    writeBytes: 0,
    readEntries: 0,
    writeEntries: 0,
  };
}

function extractInclusionFeeStats(feeStats: unknown):
  | {
      p50: number;
      p90: number;
      p95: number;
      p99: number;
      transactionCount: number;
    }
  | undefined {
  if (!isRecord(feeStats)) return undefined;

  const stats = isRecord(feeStats.inclusionFee)
    ? feeStats.inclusionFee
    : isRecord(feeStats.sorobanInclusionFee)
      ? feeStats.sorobanInclusionFee
      : feeStats;

  const p50 = readNumber(stats.p50);
  const p90 = readNumber(stats.p90);
  const p95 = readNumber(stats.p95);
  const p99 = readNumber(stats.p99);

  if ([p50, p90, p95, p99].some((value) => value === undefined)) {
    return undefined;
  }

  return {
    p50: p50!,
    p90: p90!,
    p95: p95!,
    p99: p99!,
    transactionCount: readNumber(stats.transactionCount) ?? 0,
  };
}

function classifyCongestion(
  stats: {
    p50: number;
    p90: number;
    p95: number;
    p99: number;
    transactionCount: number;
  },
  baseFee: number
): CongestionLevel {
  const safeBaseFee = Math.max(baseFee, 1);
  const p95Ratio = stats.p95 / safeBaseFee;

  if (stats.p99 >= safeBaseFee * 20 || p95Ratio >= 10) return "severe";
  if (stats.p95 >= safeBaseFee * 5 || stats.transactionCount >= 500)
    return "high";
  if (stats.p90 >= safeBaseFee * 2 || stats.transactionCount >= 100)
    return "moderate";
  return "low";
}

function multiplyStroops(value: string, multiplier: number): string {
  return String(Math.ceil(Number(value) * multiplier - 1e-9));
}

function addStroops(left: string, right: string): string {
  return String(BigInt(left) + BigInt(right));
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
