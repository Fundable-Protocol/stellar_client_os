/**
 * Soroban transaction helper utilities for gas price and resource limit estimation.
 *
 * These helpers provide utilities to estimate and suggest gas prices and resource limits
 * based on current network congestion and simulation results, making it easier to build
 * robust transaction submission logic.
 */

import { Server, Api } from '@stellar/stellar-sdk/rpc';
import { xdr } from '@stellar/stellar-sdk';
import type { Transaction } from '@stellar/stellar-sdk';

/**
 * Resource usage metrics for a Soroban transaction.
 */
export interface ResourceUsage {
  /** Estimated number of CPU instructions to be executed. */
  instructions: number;
  /** Estimated number of bytes to be read from ledger storage. */
  readBytes: number;
  /** Estimated number of bytes to be written to ledger storage. */
  writeBytes: number;
  /** Estimated number of ledger entries to be read. */
  readEntries: number;
  /** Estimated number of ledger entries to be written. */
  writeEntries: number;
}

/**
 * Fee and resource estimate for a Soroban transaction.
 */
export interface TransactionEstimate {
  /** Recommended fee in stroops (0.00001 XLM per stroop). */
  recommendedFee: string;
  /** Minimum resource fee from simulation (before safety buffer). */
  minResourceFee: string;
  /** Detailed resource usage breakdown. */
  resources: ResourceUsage;
  /** Whether the simulation succeeded. */
  success: boolean;
  /** Error message if simulation failed. */
  error?: string;
}

/**
 * Configuration options for transaction estimation.
 */
export interface EstimationOptions {
  /**
   * Safety multiplier applied on top of the simulated minimum resource fee.
   * Higher values provide more buffer against network congestion.
   * @default 1.2
   */
  feeBufferMultiplier?: number;
  /**
   * Base fee in stroops for each transaction operation.
   * @default '100'
   */
  baseFee?: string;
  /**
   * Maximum number of times to retry simulation on transient failures.
   * @default 3
   */
  maxRetries?: number;
  /**
   * Delay in milliseconds between retry attempts.
   * @default 1000
   */
  retryDelayMs?: number;
}

/**
 * Network congestion level based on recent ledger fees.
 */
export type CongestionLevel = 'low' | 'medium' | 'high';

/**
 * Network metrics for congestion analysis.
 */
export interface NetworkMetrics {
  /** Current congestion level. */
  congestionLevel: CongestionLevel;
  /** Average fee in stroops from recent ledgers. */
  averageFee: string;
  /** Minimum fee in stroops from recent ledgers. */
  minFee: string;
  /** Maximum fee in stroops from recent ledgers. */
  maxFee: string;
  /** Number of ledgers analyzed. */
  ledgerCount: number;
}

/**
 * Default estimation options.
 */
const DEFAULT_OPTIONS: Required<EstimationOptions> = {
  feeBufferMultiplier: 1.2,
  baseFee: '100',
  maxRetries: 3,
  retryDelayMs: 1000,
};

/**
 * Simulate a Soroban transaction and return fee/resource estimates.
 *
 * This function simulates the transaction on the network to determine the
 * minimum resource fee required, then applies a safety buffer to account for
 * network congestion and resource fluctuations.
 *
 * @param rpc - Soroban RPC server instance.
 * @param transaction - The transaction to simulate.
 * @param options - Configuration options for estimation.
 * @returns Transaction estimate with fee and resource usage.
 *
 * @example
 * ```ts
 * const estimate = await estimateTransactionFee(rpc, transaction, {
 *   feeBufferMultiplier: 1.5,
 * });
 * console.log(`Recommended fee: ${estimate.recommendedFee} stroops`);
 * console.log(`CPU instructions: ${estimate.resources.instructions}`);
 * ```
 */
export async function estimateTransactionFee(
  rpc: Server,
  transaction: Transaction,
  options: EstimationOptions = {},
): Promise<TransactionEstimate> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  let lastError: Error | undefined;
  for (let attempt = 0; attempt < opts.maxRetries; attempt++) {
    try {
      const simulation = await rpc.simulateTransaction(transaction);

      if (Api.isSimulationError(simulation)) {
        return {
          recommendedFee: opts.baseFee,
          minResourceFee: '0',
          resources: {
            instructions: 0,
            readBytes: 0,
            writeBytes: 0,
            readEntries: 0,
            writeEntries: 0,
          },
          success: false,
          error: simulation.error,
        };
      }

      const successResponse = simulation as Api.SimulateTransactionSuccessResponse;
      const minResourceFee = successResponse.minResourceFee ?? '0';
      const sorobanData = successResponse.transactionData;

      // Apply safety buffer to account for network congestion
      const recommendedFee = String(
        Math.ceil(Number(minResourceFee) * opts.feeBufferMultiplier + Number(opts.baseFee)),
      );

      // Extract resource footprint from Soroban transaction data
      const resources = extractResources(sorobanData);

      return {
        recommendedFee,
        minResourceFee,
        resources,
        success: true,
      };
    } catch (err) {
      lastError = err as Error;
      if (attempt < opts.maxRetries - 1) {
        await sleep(opts.retryDelayMs);
      }
    }
  }

  return {
    recommendedFee: opts.baseFee,
    minResourceFee: '0',
    resources: {
      instructions: 0,
      readBytes: 0,
      writeBytes: 0,
      readEntries: 0,
      writeEntries: 0,
    },
    success: false,
    error: lastError?.message ?? 'Simulation failed after retries',
  };
}

/**
 * Extract resource usage from Soroban transaction data XDR.
 *
 * @param sorobanData - Base64-encoded Soroban transaction data.
 * @returns Resource usage metrics.
 */
function extractResources(sorobanData?: string): ResourceUsage {
  const defaultResources: ResourceUsage = {
    instructions: 0,
    readBytes: 0,
    writeBytes: 0,
    readEntries: 0,
    writeEntries: 0,
  };

  if (!sorobanData) {
    return defaultResources;
  }

  try {
    const data = xdr.SorobanTransactionData.fromXDR(sorobanData, 'base64');
    const footprint = data.resources();

    return {
      instructions: Number(footprint.instructions()),
      readBytes: Number(footprint.readBytes()),
      writeBytes: Number(footprint.writeBytes()),
      readEntries: footprint.footprint().readOnly().length,
      writeEntries: footprint.footprint().readWrite().length,
    };
  } catch {
    return defaultResources;
  }
}

/**
 * Analyze network congestion by examining recent ledger fees.
 *
 * This function queries the RPC server for recent ledger information and
 * calculates congestion metrics to help determine appropriate fee levels.
 *
 * @param rpc - Soroban RPC server instance.
 * @param ledgerCount - Number of recent ledgers to analyze (default: 10).
 * @returns Network congestion metrics.
 *
 * @example
 * ```ts
 * const metrics = await analyzeNetworkCongestion(rpc, 20);
 * console.log(`Congestion level: ${metrics.congestionLevel}`);
 * console.log(`Average fee: ${metrics.averageFee} stroops`);
 * ```
 */
export async function analyzeNetworkCongestion(
  rpc: Server,
  ledgerCount: number = 10,
): Promise<NetworkMetrics> {
  try {
    const latestLedger = await rpc.getLatestLedger();
    const sequence = Number(latestLedger.sequence);

    const fees: bigint[] = [];
    for (let i = 0; i < ledgerCount; i++) {
      try {
        const ledger = await rpc.getLedger({ sequence: sequence - i });
        const fee = BigInt(ledger.baseFeeInStroops || '100');
        fees.push(fee);
      } catch {
        // Skip ledgers that can't be fetched
      }
    }

    if (fees.length === 0) {
      return getDefaultMetrics();
    }

    const minFee = fees.reduce((a, b) => (a < b ? a : b));
    const maxFee = fees.reduce((a, b) => (a > b ? a : b));
    const totalFee = fees.reduce((a, b) => a + b, 0n);
    const averageFee = totalFee / BigInt(fees.length);

    // Determine congestion level based on fee distribution
    const congestionLevel = determineCongestionLevel(averageFee, minFee, maxFee);

    return {
      congestionLevel,
      averageFee: averageFee.toString(),
      minFee: minFee.toString(),
      maxFee: maxFee.toString(),
      ledgerCount: fees.length,
    };
  } catch {
    return getDefaultMetrics();
  }
}

/**
 * Determine congestion level based on fee metrics.
 */
function determineCongestionLevel(averageFee: bigint, minFee: bigint, maxFee: bigint): CongestionLevel {
  const feeRange = maxFee - minFee;
  const averageOffset = averageFee - minFee;

  // If fees are consistently low, congestion is low
  if (averageFee <= 100n) {
    return 'low';
  }

  // If average is close to max, congestion is high
  if (feeRange > 0n && averageOffset > feeRange / 2n) {
    return 'high';
  }

  // Otherwise, medium congestion
  return 'medium';
}

/**
 * Get default network metrics when analysis fails.
 */
function getDefaultMetrics(): NetworkMetrics {
  return {
    congestionLevel: 'medium',
    averageFee: '100',
    minFee: '100',
    maxFee: '100',
    ledgerCount: 0,
  };
}

/**
 * Suggest an appropriate fee based on network congestion and transaction estimate.
 *
 * This function combines network congestion analysis with transaction simulation
 * to recommend an optimal fee that balances cost and reliability.
 *
 * @param estimate - Transaction estimate from simulation.
 * @param metrics - Network congestion metrics.
 * @param options - Configuration options.
 * @returns Recommended fee in stroops.
 *
 * @example
 * ```ts
 * const estimate = await estimateTransactionFee(rpc, transaction);
 * const metrics = await analyzeNetworkCongestion(rpc);
 * const suggestedFee = suggestFee(estimate, metrics);
 * console.log(`Suggested fee: ${suggestedFee} stroops`);
 * ```
 */
export function suggestFee(
  estimate: TransactionEstimate,
  metrics: NetworkMetrics,
  options: EstimationOptions = {},
): string {
  if (!estimate.success) {
    return options.baseFee ?? DEFAULT_OPTIONS.baseFee;
  }

  const baseFee = BigInt(estimate.recommendedFee);
  const networkFee = BigInt(metrics.averageFee);

  // Adjust fee based on congestion level
  let congestionMultiplier = 1.0;
  switch (metrics.congestionLevel) {
    case 'high':
      congestionMultiplier = 1.5;
      break;
    case 'medium':
      congestionMultiplier = 1.2;
      break;
    case 'low':
      congestionMultiplier = 1.0;
      break;
  }

  // Calculate suggested fee
  const suggestedFee = baseFee * BigInt(Math.ceil(congestionMultiplier * 100)) / 100n;
  const finalFee = suggestedFee > networkFee ? suggestedFee : networkFee;

  return finalFee.toString();
}

/**
 * Suggest resource limits based on transaction estimate with safety margins.
 *
 * This function takes the resource usage from simulation and adds safety margins
 * to ensure the transaction has sufficient resources even under varying conditions.
 *
 * @param estimate - Transaction estimate from simulation.
 * @param resourceBufferMultiplier - Multiplier for resource buffer (default: 1.3).
 * @returns Suggested resource limits.
 *
 * @example
 * ```ts
 * const estimate = await estimateTransactionFee(rpc, transaction);
 * const limits = suggestResourceLimits(estimate, 1.5);
 * console.log(`CPU instructions limit: ${limits.instructions}`);
 * ```
 */
export function suggestResourceLimits(
  estimate: TransactionEstimate,
  resourceBufferMultiplier: number = 1.3,
): ResourceUsage {
  if (!estimate.success) {
    return {
      instructions: 5_000_000,
      readBytes: 200_000,
      writeBytes: 100_000,
      readEntries: 50,
      writeEntries: 20,
    };
  }

  const buffer = Math.max(resourceBufferMultiplier, 1.1);

  return {
    instructions: Math.ceil(estimate.resources.instructions * buffer),
    readBytes: Math.ceil(estimate.resources.readBytes * buffer),
    writeBytes: Math.ceil(estimate.resources.writeBytes * buffer),
    readEntries: Math.ceil(estimate.resources.readEntries * buffer),
    writeEntries: Math.ceil(estimate.resources.writeEntries * buffer),
  };
}

/**
 * Sleep for a specified number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
