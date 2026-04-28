import { Client as ContractClient } from "./generated/distributor/src/index";
import {
  AssembledTransaction,
  ClientOptions as ContractClientOptions,
  Address,
} from "@stellar/stellar-sdk/contract";
import {
  UserStats,
  TokenStats,
  DistributionHistory,
} from "./generated/distributor/src/index";
import { executeWithErrorHandling } from "./utils/errors";

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
      () => this.client.get_admin() as any,
      "Get administrator"
    );
  }

  /**
   * Get stats for a specific user.
   * @param user The address of the user.
   * @throws {FundableStellarError} If fetch fails with a human-readable error message
   */
  public async getUserStats(
    user: AddressParam
  ): Promise<AssembledTransaction<UserStats | undefined>> {
    return executeWithErrorHandling(
      () => this.client.get_user_stats({ user: addressToString(user) }) as any,
      "Get user statistics"
    );
  }

  /**
   * Get stats for a specific token.
   * @param token The address of the token (contract ID).
   * @throws {FundableStellarError} If fetch fails with a human-readable error message
   */
  public async getTokenStats(
    token: AddressParam
  ): Promise<AssembledTransaction<TokenStats | undefined>> {
    return executeWithErrorHandling(
      () =>
        this.client.get_token_stats({ token: addressToString(token) }) as any,
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
   * @param startId The ID to start from.
   * @param limit The maximum number of records to return.
   * @throws {FundableStellarError} If fetch fails with a human-readable error message
   */
  public async getDistributionHistory(
    startId: bigint,
    limit: bigint
  ): Promise<AssembledTransaction<DistributionHistory[]>> {
    return executeWithErrorHandling(
      () => this.client.get_distribution_history({ start_id: startId, limit }),
      "Get distribution history"
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
   * @throws {FundableStellarError} If operation fails with a human-readable error message
   */
  public async setProtocolFee(
    admin: AddressParam,
    newFeePercent: number
  ): Promise<AssembledTransaction<null>> {
    return executeWithErrorHandling(
      () =>
        this.client.set_protocol_fee({
          admin: addressToString(admin),
          new_fee_percent: newFeePercent,
        }),
      "Set protocol fee"
    );
  }
}
