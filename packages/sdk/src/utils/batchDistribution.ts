/**
 * Utilities for handling large-scale token distributions while respecting Soroban gas limits.
 * 
 * The Soroban smart contract platform has gas limits that prevent arbitrarily large
 * transactions. This module provides functions to automatically split large distribution
 * operations into multiple smaller transactions that each stay within gas limits.
 * 
 * @module utils/batchDistribution
 */

import { AssembledTransaction } from '@stellar/stellar-sdk/contract';
import type { DistributorClient } from '../DistributorClient';

/**
 * Configuration for batch distribution operations.
 * 
 * @interface BatchDistributionConfig
 */
export interface BatchDistributionConfig {
  /**
   * Maximum number of recipients per batch/transaction.
   * 
   * Each recipient in a distribution operation consumes contract resources.
   * This limit ensures each transaction stays well below Soroban's gas limits.
   * 
   * Recommended values:
   * - Equal distribution: 100-200 recipients per batch
   * - Weighted distribution: 50-100 recipients per batch (more complex)
   * 
   * @default 100
   */
  maxRecipientsPerBatch?: number;

  /**
   * Callback function invoked when a batch starts processing.
   * 
   * Useful for progress tracking and user feedback during large distributions.
   * Called before each transaction is assembled.
   * 
   * @param batchNumber - Current batch number (1-indexed)
   * @param totalBatches - Total number of batches
   * @param recipientCount - Number of recipients in this batch
   * 
   * @example
   * ```ts
   * onBatchStart: (batch, total, count) => {
   *   console.log(`Processing batch ${batch}/${total} (${count} recipients)`);
   * }
   * ```
   */
  onBatchStart?: (batchNumber: number, totalBatches: number, recipientCount: number) => void;

  /**
   * Callback function invoked when a batch completes.
   * 
   * Useful for tracking progress and handling batch results individually.
   * Called after each transaction is assembled.
   * 
   * @param batchNumber - Batch number that completed (1-indexed)
   * @param totalBatches - Total number of batches
   * @param transaction - The assembled transaction for this batch
   * 
   * @example
   * ```ts
   * onBatchComplete: (batch, total, tx) => {
   *   console.log(`Batch ${batch}/${total} ready to submit`);
   * }
   * ```
   */
  onBatchComplete?: (batchNumber: number, totalBatches: number, transaction: AssembledTransaction<null>) => void;
}

/**
 * Parameters for an equal distribution across multiple batches.
 * 
 * @interface EqualDistributionParams
 */
export interface EqualDistributionParams {
  /** Sender address (must have sufficient token balance). */
  sender: string;

  /** Token contract ID to distribute. */
  token: string;

  /** Total amount to distribute across all recipients (in token base units). */
  total_amount: bigint;

  /** List of recipient addresses (will be split into batches). */
  recipients: string[];

  /** Batch configuration options. */
  config?: BatchDistributionConfig;
}

/**
 * Parameters for a weighted distribution across multiple batches.
 * 
 * @interface WeightedDistributionParams
 */
export interface WeightedDistributionParams {
  /** Sender address (must have sufficient token balance). */
  sender: string;

  /** Token contract ID to distribute. */
  token: string;

  /** Recipient addresses (will be split into batches along with amounts). */
  recipients: string[];

  /** Amount for each recipient, in parallel order with recipients array (in token base units). */
  amounts: bigint[];

  /** Batch configuration options. */
  config?: BatchDistributionConfig;
}

/**
 * Result of a batch distribution operation.
 * 
 * @interface BatchDistributionResult
 */
export interface BatchDistributionResult {
  /**
   * Array of assembled transactions, one per batch.
   * 
   * Each transaction is ready to sign and submit to the network.
   * Transactions should be submitted sequentially or with appropriate
   * account sequence number management.
   */
  transactions: AssembledTransaction<null>[];

  /**
   * Total number of batches that will be executed.
   */
  batchCount: number;

  /**
   * Recipients split into batches.
   * 
   * Each inner array contains the recipients for that batch.
   * Index corresponds to batch number (0-indexed).
   */
  recipientBatches: string[][];

  /**
   * Amounts split into batches (only for weighted distribution).
   * 
   * Each inner array contains the amounts for that batch.
   * Index corresponds to batch number (0-indexed).
   * 
   * @optional Only present for weighted distributions.
   */
  amountBatches?: bigint[][];
}

/**
 * Splits recipients into batches and creates assembled transactions for equal distribution.
 * 
 * For large recipient lists, this function automatically batches them to ensure each
 * transaction stays within Soroban's gas limits. Each batch is processed as a separate
 * `distributeEqual` call with its subset of recipients.
 * 
 * The total amount is NOT split proportionally - each batch still distributes to its
 * recipients from the full total_amount. If you need to split the total amount itself,
 * use the amounts parameter with `prepareBatchWeightedDistribution` instead.
 * 
 * @param client - DistributorClient instance
 * @param params - Distribution parameters and batch configuration
 * @returns Promise containing batched transactions and split recipient lists
 * 
 * @throws {Error} If recipients array is empty
 * @throws {Error} If recipient count doesn't match amounts length (for weighted)
 * 
 * @example
 * ```ts
 * const result = await prepareBatchEqualDistribution(client, {
 *   sender: 'GAAAA...',
 *   token: 'CXXXX...',
 *   total_amount: BigInt(1_000_000_000),
 *   recipients: largeRecipientList,
 *   config: {
 *     maxRecipientsPerBatch: 100,
 *     onBatchComplete: (batch, total) => 
 *       console.log(`Prepared batch ${batch}/${total}`)
 *   }
 * });
 * 
 * for (const tx of result.transactions) {
 *   const result = await tx.signAndSend();
 * }
 * ```
 */
export async function prepareBatchEqualDistribution(
  client: DistributorClient,
  params: EqualDistributionParams
): Promise<BatchDistributionResult> {
  const { sender, token, total_amount, recipients, config = {} } = params;
  const maxRecipientsPerBatch = config.maxRecipientsPerBatch ?? 100;

  if (recipients.length === 0) {
    throw new Error('Recipients array cannot be empty');
  }

  const recipientBatches = createBatches(recipients, maxRecipientsPerBatch);
  const transactions: AssembledTransaction<null>[] = [];
  const batchCount = recipientBatches.length;

  for (let i = 0; i < recipientBatches.length; i++) {
    const batchNumber = i + 1;
    const batchRecipients = recipientBatches[i];

    config.onBatchStart?.(batchNumber, batchCount, batchRecipients.length);

    const tx = await client.distributeEqual({
      sender,
      token,
      total_amount,
      recipients: batchRecipients,
    });

    transactions.push(tx);
    config.onBatchComplete?.(batchNumber, batchCount, tx);
  }

  return {
    transactions,
    batchCount,
    recipientBatches,
  };
}

/**
 * Splits recipients and amounts into batches and creates transactions for weighted distribution.
 * 
 * For large recipient/amount lists, this function automatically batches them to ensure each
 * transaction stays within Soroban's gas limits. Each batch is processed as a separate
 * `distributeWeighted` call with its subset of recipients and corresponding amounts.
 * 
 * The recipients and amounts arrays must have the same length. They will be split in parallel,
 * maintaining the recipient-amount correspondence.
 * 
 * @param client - DistributorClient instance
 * @param params - Distribution parameters and batch configuration
 * @returns Promise containing batched transactions, split recipient lists, and split amount lists
 * 
 * @throws {Error} If recipients array is empty
 * @throws {Error} If recipients and amounts arrays have different lengths
 * 
 * @example
 * ```ts
 * const recipients = ['GAAA...', 'GBBB...', 'GCCC...'];
 * const amounts = [BigInt(100), BigInt(200), BigInt(150)];
 * 
 * const result = await prepareBatchWeightedDistribution(client, {
 *   sender: 'GAAAA...',
 *   token: 'CXXXX...',
 *   recipients,
 *   amounts,
 *   config: {
 *     maxRecipientsPerBatch: 50,
 *     onBatchStart: (batch, total, count) =>
 *       console.log(`Starting batch ${batch}/${total}`),
 *     onBatchComplete: (batch, total) =>
 *       console.log(`Batch ${batch}/${total} prepared`)
 *   }
 * });
 * 
 * for (const tx of result.transactions) {
 *   const result = await tx.signAndSend();
 * }
 * ```
 */
export async function prepareBatchWeightedDistribution(
  client: DistributorClient,
  params: WeightedDistributionParams
): Promise<BatchDistributionResult> {
  const { sender, token, recipients, amounts, config = {} } = params;
  const maxRecipientsPerBatch = config.maxRecipientsPerBatch ?? 100;

  if (recipients.length === 0) {
    throw new Error('Recipients array cannot be empty');
  }

  if (recipients.length !== amounts.length) {
    throw new Error(
      `Recipients and amounts array length mismatch: ` +
      `${recipients.length} recipients vs ${amounts.length} amounts`
    );
  }

  const recipientBatches = createBatches(recipients, maxRecipientsPerBatch);
  const amountBatches = createBatches(amounts, maxRecipientsPerBatch);
  const transactions: AssembledTransaction<null>[] = [];
  const batchCount = recipientBatches.length;

  for (let i = 0; i < recipientBatches.length; i++) {
    const batchNumber = i + 1;
    const batchRecipients = recipientBatches[i];
    const batchAmounts = amountBatches[i];

    config.onBatchStart?.(batchNumber, batchCount, batchRecipients.length);

    const tx = await client.distributeWeighted({
      sender,
      token,
      recipients: batchRecipients,
      amounts: batchAmounts,
    });

    transactions.push(tx);
    config.onBatchComplete?.(batchNumber, batchCount, tx);
  }

  return {
    transactions,
    batchCount,
    recipientBatches,
    amountBatches,
  };
}

/**
 * Generic utility function to split an array into fixed-size batches.
 * 
 * Used internally to chunk recipients and amounts arrays.
 * 
 * @template T - Type of array elements
 * @param array - Array to split into batches
 * @param batchSize - Size of each batch
 * @returns Array of batches (last batch may be smaller)
 * 
 * @example
 * ```ts
 * const items = [1, 2, 3, 4, 5];
 * const batches = createBatches(items, 2);
 * // [[1, 2], [3, 4], [5]]
 * ```
 */
export function createBatches<T>(array: T[], batchSize: number): T[][] {
  const batches: T[][] = [];
  
  for (let i = 0; i < array.length; i += batchSize) {
    batches.push(array.slice(i, i + batchSize));
  }
  
  return batches;
}

/**
 * Calculates the recommended maximum recipients per batch based on distribution type.
 * 
 * Different operations have different gas costs:
 * - Equal distribution: simpler, can handle more recipients
 * - Weighted distribution: more complex, requires fewer recipients per batch
 * 
 * @param distributionType - Type of distribution ('equal' or 'weighted')
 * @returns Recommended maximum recipients per batch
 * 
 * @example
 * ```ts
 * const maxForEqual = getRecommendedBatchSize('equal');     // 150
 * const maxForWeighted = getRecommendedBatchSize('weighted'); // 75
 * ```
 */
export function getRecommendedBatchSize(
  distributionType: 'equal' | 'weighted'
): number {
  switch (distributionType) {
    case 'equal':
      return 150; // Equal distribution is cheaper
    case 'weighted':
      return 75; // Weighted distribution is more expensive
    default:
      return 100; // Safe default
  }
}
