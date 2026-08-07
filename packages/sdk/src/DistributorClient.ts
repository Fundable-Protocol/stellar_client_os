import { Client as ContractClient } from "./generated/distributor/src/index";
import {
  AssembledTransaction,
  ClientOptions as ContractClientOptions,
} from "@stellar/stellar-sdk/contract";
import { Address } from "@stellar/stellar-sdk";
import {
  UserStats,
  TokenStats,
  DistributionHistory,
} from "./generated/distributor/src/index";
import { executeWithErrorHandling } from "./utils/errors";
import {
  prepareBatchEqualDistribution,
  prepareBatchWeightedDistribution,
  BatchDistributionConfig,
  BatchDistributionResult,
} from "./utils/batchDistribution";

/**
 * Type alias for address parameters that accept both string and Address objects
 */
export type AddressParam = string | Address;

/**
 * Converts an AddressParam to its string representation
 */
function addressToString(address: AddressParam): string {
  return typeof address === "string" ? address : address.toString();
}

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
    sender: AddressParam;
    token: AddressParam;
    total_amount: bigint;
    recipients: AddressParam[];
  }): Promise<AssembledTransaction<null>> {
    return executeWithErrorHandling(
      () =>
        this.client.distribute_equal({
          sender: addressToString(params.sender),
          token: addressToString(params.token),
          total_amount: params.total_amount,
          recipients: params.recipients.map(addressToString),
        }),
      "Distribute tokens equally"
    );
  }

  /**
   * Distribute tokens among a list of recipients with specific amounts for each.
   * @param params Parameters including sender, token, recipients, and amounts.
   * @throws {FundableStellarError} If distribution fails with a human-readable error message
   */
  public async distributeWeighted(params: {
    sender: AddressParam;
    token: AddressParam;
    recipients: AddressParam[];
    amounts: bigint[];
  }): Promise<AssembledTransaction<null>> {
    return executeWithErrorHandling(
      () =>
        this.client.distribute_weighted({
          sender: addressToString(params.sender),
          token: addressToString(params.token),
          recipients: params.recipients.map(addressToString),
          amounts: params.amounts,
        }),
      "Distribute tokens with weights"
    );
  }

  /**
   * Get the administrator address for the contract.
   * @throws {FundableStellarError} If fetch fails with a human-readable error message
   */
  public async getAdmin(): Promise<AssembledTransaction<string | undefined>> {
    return executeWithErrorHandling(
      () => this.client.get_admin() as Promise<AssembledTransaction<string | undefined>>,
      "Get administrator"
    );
  }

  /**
   * Get stats for a specific user.
   * @param user The address of the user, or an object containing the user address.
   * @throws {FundableStellarError} If fetch fails with a human-readable error message
   */
  public async getUserStats(
    user: AddressParam
  ): Promise<AssembledTransaction<UserStats | undefined>> {
    return executeWithErrorHandling(
      () =>
        this.client.get_user_stats({ user: addressToString(user) }) as Promise<
          AssembledTransaction<UserStats | undefined>
        >,
      "Get user statistics"
    );
  }

  /**
   * Get stats for a specific token.
   * @param token The address of the token (contract ID), or an object containing the token address.
   * @throws {FundableStellarError} If fetch fails with a human-readable error message
   */
  public async getTokenStats(
    token: AddressParam
  ): Promise<AssembledTransaction<TokenStats | undefined>> {
    return executeWithErrorHandling(
      () =>
        this.client.get_token_stats({ token: addressToString(token) }) as Promise<
          AssembledTransaction<TokenStats | undefined>
        >,
      "Get token statistics"
    );
  }

  /**
   * Get the total number of distributions made through the contract.
   * @throws {FundableStellarError} If fetch fails with a human-readable error message
   */
  public async getTotalDistributions(): Promise<AssembledTransaction<bigint>> {
    return executeWithErrorHandling(
      () => this.client.get_total_distributions(),
      "Get total distributions"
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
      "Get total distributed amount"
    );
  }

  /**
   * Get distribution history with pagination.
   * @param startId The ID to start from, or an object containing startId and limit.
   * @param limit The maximum number of records to return.
   * @throws {FundableStellarError} If fetch fails with a human-readable error message
   */
  public async getDistributionHistory(
    startId: bigint,
    limit: bigint,
  ): Promise<AssembledTransaction<DistributionHistory[]>>;
  public async getDistributionHistory(
    params: { startId: bigint; limit: bigint },
  ): Promise<AssembledTransaction<DistributionHistory[]>>;
  public async getDistributionHistory(
    startId: bigint | { startId: bigint; limit: bigint },
    limit?: bigint,
  ): Promise<AssembledTransaction<DistributionHistory[]>> {
    let actualStartId: bigint;
    let actualLimit: bigint;

    if (typeof startId === "object") {
      actualStartId = startId.startId;
      actualLimit = startId.limit;
    } else {
      actualStartId = startId;
      actualLimit = limit!;
    }

    return executeWithErrorHandling(
      () => this.client.get_distribution_history({ start_id: actualStartId, limit: actualLimit }),
      "Get distribution history",
    );
  }

  /**
   * Initialize the contract.
   * @throws {FundableStellarError} If initialization fails with a human-readable error message
   */
  public async initialize(params: {
    admin: AddressParam;
    protocol_fee_percent: number;
    fee_address: AddressParam;
  }): Promise<AssembledTransaction<null>> {
    return executeWithErrorHandling(
      () =>
        this.client.initialize({
          admin: addressToString(params.admin),
          protocol_fee_percent: params.protocol_fee_percent,
          fee_address: addressToString(params.fee_address),
        }),
      "Initialize contract"
    );
  }

  /**
   * Set the protocol fee. Only the administrator can call this.
   * @param admin The administrator address, or an object containing admin and newFeePercent.
   * @param newFeePercent The new fee percentage.
   * @throws {FundableStellarError} If operation fails with a human-readable error message
   */
  public async setProtocolFee(
    admin: string,
    newFeePercent: number,
  ): Promise<AssembledTransaction<null>>;
  public async setProtocolFee(
    params: { admin: string; newFeePercent: number },
  ): Promise<AssembledTransaction<null>>;
  public async setProtocolFee(
    admin: string | { admin: string; newFeePercent: number },
    newFeePercent?: number,
  ): Promise<AssembledTransaction<null>> {
    let actualAdmin: string;
    let actualNewFeePercent: number;

    if (typeof admin === "object") {
      actualAdmin = admin.admin;
      actualNewFeePercent = admin.newFeePercent;
    } else {
      actualAdmin = admin;
      actualNewFeePercent = newFeePercent!;
    }

    return executeWithErrorHandling(
      () =>
        this.client.set_protocol_fee({ admin: actualAdmin, new_fee_percent: actualNewFeePercent }),
      "Set protocol fee",
    );
  }

  // ---------------------------------------------------------------------------
  // Batch distribution
  // ---------------------------------------------------------------------------

  /**
   * Distribute tokens equally to a large list of recipients, automatically
   * splitting into multiple transactions to stay within Soroban's gas limits.
   *
   * @param params.sender   Sender address (must hold sufficient token balance).
   * @param params.token    Token contract ID to distribute.
   * @param params.total_amount  Total amount to distribute (in token base units).
   * @param params.recipients   Full recipient list — will be chunked automatically.
   * @param params.config   Optional batch settings (size, progress callbacks).
   * @returns A {@link BatchDistributionResult} with one assembled transaction per
   *          batch, ready to sign and submit sequentially.
   *
   * @example
   * ```ts
   * const { transactions } = await client.batchDistribute({
   *   sender: 'GAAAA...',
   *   token: 'CXXXX...',
   *   total_amount: 1_000_000n,
   *   recipients: thousandsOfAddresses,
   *   config: { maxRecipientsPerBatch: 100 },
   * });
   * for (const tx of transactions) await tx.signAndSend({ signTransaction });
   * ```
   */
  public async batchDistribute(params: {
    sender: AddressParam;
    token: AddressParam;
    total_amount: bigint;
    recipients: AddressParam[];
    config?: BatchDistributionConfig;
  }): Promise<BatchDistributionResult>;

  /**
   * Distribute tokens with per-recipient amounts to a large list of recipients,
   * automatically splitting into multiple transactions to stay within Soroban's
   * gas limits.
   *
   * @param params.sender     Sender address (must hold sufficient token balance).
   * @param params.token      Token contract ID to distribute.
   * @param params.recipients Full recipient list — will be chunked in parallel with amounts.
   * @param params.amounts    Per-recipient amounts, parallel to `recipients`.
   * @param params.config     Optional batch settings (size, progress callbacks).
   * @returns A {@link BatchDistributionResult} with one assembled transaction per
   *          batch, ready to sign and submit sequentially.
   *
   * @example
   * ```ts
   * const { transactions } = await client.batchDistribute({
   *   sender: 'GAAAA...',
   *   token: 'CXXXX...',
   *   recipients: thousandsOfAddresses,
   *   amounts: correspondingAmounts,
   *   config: { maxRecipientsPerBatch: 75 },
   * });
   * for (const tx of transactions) await tx.signAndSend({ signTransaction });
   * ```
   */
  public async batchDistribute(params: {
    sender: AddressParam;
    token: AddressParam;
    recipients: AddressParam[];
    amounts: bigint[];
    config?: BatchDistributionConfig;
  }): Promise<BatchDistributionResult>;

  // Implementation signature — handles both overloads
  public async batchDistribute(
    params:
      | {
          sender: AddressParam;
          token: AddressParam;
          total_amount: bigint;
          recipients: AddressParam[];
          config?: BatchDistributionConfig;
        }
      | {
          sender: AddressParam;
          token: AddressParam;
          recipients: AddressParam[];
          amounts: bigint[];
          config?: BatchDistributionConfig;
        }
  ): Promise<BatchDistributionResult> {
    if ("amounts" in params) {
      // Weighted distribution
      return prepareBatchWeightedDistribution(this, {
        sender: params.sender,
        token: params.token,
        recipients: params.recipients,
        amounts: params.amounts,
        config: params.config,
      });
    }

    // Equal distribution
    return prepareBatchEqualDistribution(this, {
      sender: params.sender,
      token: params.token,
      total_amount: params.total_amount,
      recipients: params.recipients,
      config: params.config,
    });
  }
}
