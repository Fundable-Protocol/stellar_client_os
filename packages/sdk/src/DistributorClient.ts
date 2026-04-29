import { Client as ContractClient } from "./generated/distributor/src/index";
import {
  AssembledTransaction,
  ClientOptions as ContractClientOptions,
} from "@stellar/stellar-sdk/contract";
import {
  UserStats,
  TokenStats,
  DistributionHistory,
} from "./generated/distributor/src/index";
import { executeWithErrorHandling } from "./utils/errors";
import {
  prepareBatchEqualDistribution,
  prepareBatchWeightedDistribution,
  type EqualDistributionParams,
  type WeightedDistributionParams,
  type BatchDistributionResult,
} from "./utils/batchDistribution";

/**
 * High-level client for interacting with the Distributor contract.
 * Provides a type-safe and DX-optimized interface for all contract methods.
 *
 * All methods now include error handling that parses Soroban simulation errors
 * and transaction result XDR to provide human-readable error messages.
 */
export class DistributorClient {
  private client: ContractClient;

  /**
   * Create a new DistributorClient.
   * @param options Configuration for the underlying contract client.
   */
  constructor(options: ContractClientOptions) {
    this.client = new ContractClient(options);
  }

  /**
   * Distribute tokens equally among a list of recipients.
   * @param params Parameters including sender, token, total amount, and recipients.
   * @throws {FundableStellarError} If distribution fails with a human-readable error message
   */
  public async distributeEqual(params: {
    sender: string;
    token: string;
    total_amount: bigint;
    recipients: string[];
  }): Promise<AssembledTransaction<null>> {
    return executeWithErrorHandling(
      () => this.client.distribute_equal(params),
      "Distribute tokens equally",
    );
  }

  /**
   * Distribute tokens among a list of recipients with specific amounts for each.
   * @param params Parameters including sender, token, recipients, and amounts.
   * @throws {FundableStellarError} If distribution fails with a human-readable error message
   */
  public async distributeWeighted(params: {
    sender: string;
    token: string;
    recipients: string[];
    amounts: bigint[];
  }): Promise<AssembledTransaction<null>> {
    return executeWithErrorHandling(
      () => this.client.distribute_weighted(params),
      "Distribute tokens with weights",
    );
  }

  /**
   * Get the administrator address for the contract.
   * @throws {FundableStellarError} If fetch fails with a human-readable error message
   */
  public async getAdmin(): Promise<AssembledTransaction<string | undefined>> {
    return executeWithErrorHandling(
      () => this.client.get_admin() as any,
      "Get administrator",
    );
  }

  /**
   * Get stats for a specific user.
   * @param user The address of the user.
   * @throws {FundableStellarError} If fetch fails with a human-readable error message
   */
  public async getUserStats(
    user: string,
  ): Promise<AssembledTransaction<UserStats | undefined>> {
    return executeWithErrorHandling(
      () => this.client.get_user_stats({ user }) as any,
      "Get user statistics",
    );
  }

  /**
   * Get stats for a specific token.
   * @param token The address of the token (contract ID).
   * @throws {FundableStellarError} If fetch fails with a human-readable error message
   */
  public async getTokenStats(
    token: string,
  ): Promise<AssembledTransaction<TokenStats | undefined>> {
    return executeWithErrorHandling(
      () => this.client.get_token_stats({ token }) as any,
      "Get token statistics",
    );
  }

  /**
   * Get the total number of distributions made through the contract.
   * @throws {FundableStellarError} If fetch fails with a human-readable error message
   */
  public async getTotalDistributions(): Promise<AssembledTransaction<bigint>> {
    return executeWithErrorHandling(
      () => this.client.get_total_distributions(),
      "Get total distributions",
    );
  }

  /**
   * Get the total amount distributed through the contract.
   * @throws {FundableStellarError} If fetch fails with a human-readable error message
   */
  public async getTotalDistributedAmount(): Promise<
    AssembledTransaction<bigint>
  > {
    return executeWithErrorHandling(
      () => this.client.get_total_distributed_amount(),
      "Get total distributed amount",
    );
  }

  /**
   * Get distribution history with pagination.
   * @param startId The ID to start from.
   * @param limit The maximum number of records to return.
   * @throws {FundableStellarError} If fetch fails with a human-readable error message
   */
  public async getDistributionHistory(
    startId: bigint,
    limit: bigint,
  ): Promise<AssembledTransaction<DistributionHistory[]>> {
    return executeWithErrorHandling(
      () => this.client.get_distribution_history({ start_id: startId, limit }),
      "Get distribution history",
    );
  }

  /**
   * Initialize the contract.
   * @throws {FundableStellarError} If initialization fails with a human-readable error message
   */
  public async initialize(params: {
    admin: string;
    protocol_fee_percent: number;
    fee_address: string;
  }): Promise<AssembledTransaction<null>> {
    return executeWithErrorHandling(
      () => this.client.initialize(params),
      "Initialize contract",
    );
  }

  /**
   * Set the protocol fee. Only the administrator can call this.
   * @throws {FundableStellarError} If operation fails with a human-readable error message
   */
  public async setProtocolFee(
    admin: string,
    newFeePercent: number,
  ): Promise<AssembledTransaction<null>> {
    return executeWithErrorHandling(
      () =>
        this.client.set_protocol_fee({ admin, new_fee_percent: newFeePercent }),
      "Set protocol fee",
    );
  }

  /**
   * Batch distribute tokens equally among a large list of recipients.
   *
   * Automatically splits large recipient lists into multiple transactions to avoid
   * Soroban gas limit issues. Each batch is processed separately with the same
   * total amount distributed per batch.
   *
   * Use this when you have 200+ recipients and want to avoid gas limit errors.
   *
   * @param params Distribution parameters including sender, token, total amount, recipients, and batch config
   * @returns Promise containing batched transactions and split recipient lists
   *
   * @throws {Error} If recipients array is empty
   * @throws {FundableStellarError} If any batch transaction fails
   *
   * @example
   * ```ts
   * const result = await client.batchDistributeEqual({
   *   sender: 'GAAAA...',
   *   token: 'CXXXX...',
   *   total_amount: BigInt(1_000_000_000),
   *   recipients: largeRecipientList, // 1000+ addresses
   *   config: {
   *     maxRecipientsPerBatch: 150,
   *     onBatchComplete: (batch, total) =>
   *       console.log(`Batch ${batch}/${total} prepared`)
   *   }
   * });
   *
   * // Submit each transaction sequentially
   * for (const tx of result.transactions) {
   *   await tx.signAndSend();
   * }
   * ```
   */
  public async batchDistributeEqual(
    params: EqualDistributionParams,
  ): Promise<BatchDistributionResult> {
    return prepareBatchEqualDistribution(this, params);
  }

  /**
   * Batch distribute tokens with varying amounts to a large list of recipients.
   *
   * Automatically splits large recipient/amount lists into multiple transactions to avoid
   * Soroban gas limit issues. Each recipient-amount pair is maintained together across batches.
   *
   * Use this when you have 200+ recipients with specific amounts and want to avoid gas limit errors.
   *
   * @param params Distribution parameters including sender, token, recipients, amounts, and batch config
   * @returns Promise containing batched transactions, split recipient lists, and split amount lists
   *
   * @throws {Error} If recipients array is empty
   * @throws {Error} If recipients and amounts arrays have different lengths
   * @throws {FundableStellarError} If any batch transaction fails
   *
   * @example
   * ```ts
   * const recipients = ['GAAAA...', 'GBBBB...', 'GCCCC...'];
   * const amounts = [BigInt(100), BigInt(200), BigInt(150)];
   *
   * const result = await client.batchDistributeWeighted({
   *   sender: 'GAAAA...',
   *   token: 'CXXXX...',
   *   recipients,
   *   amounts,
   *   config: {
   *     maxRecipientsPerBatch: 75,
   *     onBatchStart: (batch, total, count) =>
   *       console.log(`Batch ${batch}/${total} with ${count} recipients`),
   *     onBatchComplete: (batch, total) =>
   *       console.log(`Batch ${batch}/${total} prepared`)
   *   }
   * });
   *
   * for (const tx of result.transactions) {
   *   await tx.signAndSend();
   * }
   * ```
   */
  public async batchDistributeWeighted(
    params: WeightedDistributionParams,
  ): Promise<BatchDistributionResult> {
    return prepareBatchWeightedDistribution(this, params);
  }
}
