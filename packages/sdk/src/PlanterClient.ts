import { Client as ContractClient } from "./generated/planter/src/index.js";
import {
  AssembledTransaction,
  ClientOptions as ContractClientOptions,
  Address,
} from "@stellar/stellar-sdk/contract";
import {
  PlanterInfo,
  ReferralInfo,
} from "./generated/planter/src/index.js";
import { executeWithErrorHandling } from "./utils/errors.js";

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
 * High-level client for interacting with the Planter contract.
 * Provides a type-safe and DX-optimized interface for all contract methods.
 *
 * All methods include error handling that parses Soroban simulation errors
 * and transaction result XDR to provide human-readable error messages.
 */
export class PlanterClient {
  private client: ContractClient;

  /**
   * Create a new PlanterClient.
   * @param options Configuration for the underlying contract client.
   */
  constructor(options: ContractClientOptions) {
    this.client = new ContractClient(options);
  }

  /**
   * Initialize the planter contract.
   * @param params Parameters including admin, reward token, and reward amount.
   * @throws {FundableStellarError} If initialization fails with a human-readable error message
   */
  public async initialize(params: {
    admin: AddressParam;
    rewardToken: AddressParam;
    rewardAmount: bigint;
  }): Promise<AssembledTransaction> {
    const tx = await this.client.initialize({
      admin: new Address(addressToString(params.admin)),
      rewardToken: new Address(addressToString(params.rewardToken)),
      rewardAmount: params.rewardAmount,
    });
    return executeWithErrorHandling(tx, "initialize");
  }

  /**
   * Register a new planter with an optional referrer.
   * @param params Parameters including planter address and optional referrer.
   * @throws {FundableStellarError} If registration fails with a human-readable error message
   */
  public async registerPlanter(params: {
    planter: AddressParam;
    referrer?: AddressParam;
  }): Promise<AssembledTransaction> {
    const tx = await this.client.register_planter({
      planter: new Address(addressToString(params.planter)),
      referrer: params.referrer
        ? new Address(addressToString(params.referrer))
        : undefined,
    });
    return executeWithErrorHandling(tx, "register_planter");
  }

  /**
   * Record a job completion for a planter.
   * @param params Parameters including planter address.
   * @throws {FundableStellarError} If job completion fails with a human-readable error message
   */
  public async completeJob(params: {
    planter: AddressParam;
  }): Promise<AssembledTransaction> {
    const tx = await this.client.complete_job({
      planter: new Address(addressToString(params.planter)),
    });
    return executeWithErrorHandling(tx, "complete_job");
  }

  /**
   * Claim referral reward for a referred planter's first job completion.
   * @param params Parameters including referrer and referred planter addresses.
   * @throws {FundableStellarError} If reward claim fails with a human-readable error message
   */
  public async claimReferralReward(params: {
    referrer: AddressParam;
    referredPlanter: AddressParam;
  }): Promise<AssembledTransaction> {
    const tx = await this.client.claim_referral_reward({
      referrer: new Address(addressToString(params.referrer)),
      referred_planter: new Address(addressToString(params.referredPlanter)),
    });
    return executeWithErrorHandling(tx, "claim_referral_reward");
  }

  /**
   * Get planter information.
   * @param params Parameters including planter address.
   * @returns Planter information including job count and reward status.
   */
  public async getPlanter(params: {
    planter: AddressParam;
  }): Promise<PlanterInfo> {
    const result = await this.client.get_planter({
      planter: new Address(addressToString(params.planter)),
    });
    return result;
  }

  /**
   * Get referral information for a referrer.
   * @param params Parameters including referrer address.
   * @returns Referral information including referral counts.
   */
  public async getReferralInfo(params: {
    referrer: AddressParam;
  }): Promise<ReferralInfo> {
    const result = await this.client.get_referral_info({
      referrer: new Address(addressToString(params.referrer)),
    });
    return result;
  }

  /**
   * Get current reward amount.
   * @returns Current reward amount in stroops.
   */
  public async getRewardAmount(): Promise<bigint> {
    const result = await this.client.get_reward_amount();
    return result;
  }

  /**
   * Update reward amount (admin only).
   * @param params Parameters including new reward amount.
   * @throws {FundableStellarError} If update fails with a human-readable error message
   */
  public async setRewardAmount(params: {
    newAmount: bigint;
  }): Promise<AssembledTransaction> {
    const tx = await this.client.set_reward_amount({
      new_amount: params.newAmount,
    });
    return executeWithErrorHandling(tx, "set_reward_amount");
  }
}
