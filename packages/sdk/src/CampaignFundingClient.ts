import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
} from "@stellar/stellar-sdk/contract";
import { Address } from "@stellar/stellar-sdk";
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
 * Campaign lifecycle status.
 *
 * Mirrors the `CampaignStatus` enum in the on-chain contract.
 */
export type CampaignStatus =
  | { tag: "Active"; values: void }
  | { tag: "Successful"; values: void }
  | { tag: "Failed"; values: void }
  | { tag: "Claimed"; values: void };

/**
 * On-chain campaign record returned by `getCampaign`.
 */
export interface Campaign {
  id: bigint;
  creator: string;
  token: string;
  target_amount: bigint;
  min_target: bigint;
  deadline: bigint;
  total_raised: bigint;
  status: CampaignStatus;
}

/**
 * Error codes emitted by the campaign-funding contract.
 *
 * Mirrors the `Error` enum in the on-chain contract.
 */
export const CampaignFundingErrors: Record<number, { message: string }> = {
  1: { message: "AlreadyInitialized" },
  2: { message: "NotInitialized" },
  3: { message: "Unauthorized" },
  4: { message: "InvalidAmount" },
  5: { message: "InvalidDeadline" },
  6: { message: "InvalidTarget" },
  7: { message: "CampaignNotFound" },
  8: { message: "CampaignNotActive" },
  9: { message: "DeadlineNotReached" },
  10: { message: "CampaignNotFailed" },
  11: { message: "CampaignNotSuccessful" },
  12: { message: "NoContributionFound" },
  13: { message: "AlreadyClaimed" },
  14: { message: "FeeTooHigh" },
  15: { message: "ArithmeticOverflow" },
  16: { message: "TargetExceeded" },
  17: { message: "StreamContractNotSet" },
  18: { message: "RewardsAlreadyStreamed" },
  19: { message: "CampaignNotClaimed" },
};

/**
 * High-level client for interacting with the campaign-funding contract.
 *
 * Provides a type-safe, DX-optimised interface for all contract methods,
 * including the `streamSponsorRewards` function that replaces the previous
 * lump-sum reward distribution with a 12-month linear payment stream.
 *
 * ## Example
 * ```ts
 * import { CampaignFundingClient, signAndWait } from "@fundable/sdk";
 *
 * const client = new CampaignFundingClient({
 *   contractId: "C...",
 *   networkPassphrase: "Test SDF Network ; September 2015",
 *   rpcUrl: "https://soroban-testnet.stellar.org",
 * });
 *
 * // After the campaign is claimed, stream rewards to each sponsor:
 * const tx = await client.streamSponsorRewards({
 *   campaignId: 1n,
 *   contributor: "GBBB...",
 * });
 * const result = await signAndWait(tx, rpcUrl, signFn);
 * console.log("Stream ID:", result.result);
 * ```
 */
export class CampaignFundingClient {
  private client: ContractClient;

  /**
   * Create a new CampaignFundingClient.
   * @param options Configuration for the underlying contract client.
   */
  constructor(options: ContractClientOptions) {
    this.client = new ContractClient(options);
  }

  // -------------------------------------------------------------------------
  // Initialisation
  // -------------------------------------------------------------------------

  /**
   * Initialise the campaign-funding contract.
   *
   * Must be called once before any other function.
   *
   * @param params.admin         - Admin address authorised to update protocol
   *                               parameters and set the stream contract.
   * @param params.fee_collector - Address that receives protocol fees.
   * @param params.fee_rate      - Protocol fee in basis points (0–500).
   * @throws {FundableStellarError} If initialisation fails.
   */
  public async initialize(params: {
    admin: AddressParam;
    fee_collector: AddressParam;
    fee_rate: number;
  }): Promise<AssembledTransaction<null>> {
    return executeWithErrorHandling(
      () =>
        this.client.initialize({
          admin: addressToString(params.admin),
          fee_collector: addressToString(params.fee_collector),
          fee_rate: params.fee_rate,
        }),
      "Initialize campaign-funding contract"
    );
  }

  // -------------------------------------------------------------------------
  // Campaign lifecycle
  // -------------------------------------------------------------------------

  /**
   * Create a new funding campaign.
   *
   * @returns An `AssembledTransaction` that resolves to the new campaign ID.
   * @throws {FundableStellarError} On validation failure.
   */
  public async createCampaign(params: {
    creator: AddressParam;
    token: AddressParam;
    target_amount: bigint;
    min_target: bigint;
    deadline: bigint;
  }): Promise<AssembledTransaction<bigint>> {
    return executeWithErrorHandling(
      () =>
        this.client.create_campaign({
          creator: addressToString(params.creator),
          token: addressToString(params.token),
          target_amount: params.target_amount,
          min_target: params.min_target,
          deadline: params.deadline,
        }),
      "Create campaign"
    );
  }

  /**
   * Contribute tokens to an active campaign.
   *
   * @throws {FundableStellarError} If the campaign is not active, amount is
   *   invalid, or the contribution would exceed the hard cap.
   */
  public async contribute(params: {
    contributor: AddressParam;
    campaign_id: bigint;
    amount: bigint;
  }): Promise<AssembledTransaction<null>> {
    return executeWithErrorHandling(
      () =>
        this.client.contribute({
          contributor: addressToString(params.contributor),
          campaign_id: params.campaign_id,
          amount: params.amount,
        }),
      "Contribute to campaign"
    );
  }

  /**
   * Evaluate an active campaign after its deadline and mark it `Successful`
   * or `Failed`.
   *
   * This call is permissionless — anyone may trigger expiry.
   *
   * @throws {FundableStellarError} If the campaign is not active or the
   *   deadline has not yet been reached.
   */
  public async triggerExpiry(params: {
    campaign_id: bigint;
  }): Promise<AssembledTransaction<null>> {
    return executeWithErrorHandling(
      () => this.client.trigger_expiry({ campaign_id: params.campaign_id }),
      "Trigger campaign expiry"
    );
  }

  /**
   * Claim the raised funds after a successful campaign.
   *
   * Only the campaign creator may call this.  A protocol fee is deducted and
   * the net proceeds are sent to the creator.
   *
   * @throws {FundableStellarError} If the campaign is not successful, already
   *   claimed, or the caller is not the creator.
   */
  public async claimFunds(params: {
    campaign_id: bigint;
  }): Promise<AssembledTransaction<null>> {
    return executeWithErrorHandling(
      () => this.client.claim_funds({ campaign_id: params.campaign_id }),
      "Claim campaign funds"
    );
  }

  /**
   * Claim a full refund after a failed campaign.
   *
   * Each contributor calls this to recover their contribution.
   *
   * @throws {FundableStellarError} If the campaign is not failed or the caller
   *   has no contribution.
   */
  public async refund(params: {
    contributor: AddressParam;
    campaign_id: bigint;
  }): Promise<AssembledTransaction<null>> {
    return executeWithErrorHandling(
      () =>
        this.client.refund({
          contributor: addressToString(params.contributor),
          campaign_id: params.campaign_id,
        }),
      "Refund campaign contribution"
    );
  }

  // -------------------------------------------------------------------------
  // Reward streaming
  // -------------------------------------------------------------------------

  /**
   * Stream a sponsor's reward back to them over 12 months.
   *
   * Instead of a lump-sum payout at campaign completion, sponsors receive
   * their reward via a linear payment stream that vests continuously over the
   * 12 months following the current ledger time.  The campaign contract
   * delegates the stream creation to the payment-stream contract that was
   * configured via `setStreamContract`.
   *
   * This call is **permissionless** after `claimFunds` has been called — any
   * account can initiate the reward stream for any contributor.
   *
   * ### Pre-conditions
   * 1. `setStreamContract` must have been called by the admin.
   * 2. The campaign must be in the `Claimed` state (creator called
   *    `claimFunds`).
   * 3. The contributor must have a non-zero escrowed balance.
   * 4. No reward stream has been created for this contributor yet.
   *
   * @param params.campaign_id  - ID of the completed campaign.
   * @param params.contributor  - Sponsor address to receive the reward stream.
   * @returns An `AssembledTransaction` that resolves to the new stream ID
   *   (assigned by the payment-stream contract).
   * @throws {FundableStellarError} With a human-readable message for each
   *   pre-condition failure.
   *
   * @example
   * ```ts
   * const tx = await client.streamSponsorRewards({
   *   campaign_id: 1n,
   *   contributor: "GBBB...",
   * });
   * const { result: streamId } = await signAndWait(tx, rpcUrl, signFn);
   * console.log("Reward stream ID:", streamId);
   * ```
   */
  public async streamSponsorRewards(params: {
    campaign_id: bigint;
    contributor: AddressParam;
  }): Promise<AssembledTransaction<bigint>> {
    return executeWithErrorHandling(
      () =>
        this.client.stream_sponsor_rewards({
          campaign_id: params.campaign_id,
          contributor: addressToString(params.contributor),
        }),
      "Stream sponsor rewards"
    );
  }

  /**
   * Check whether a reward stream has already been created for a given
   * sponsor on a specific campaign.
   *
   * @returns `true` if `streamSponsorRewards` was previously called and
   *   succeeded for this pair.
   */
  public async isRewardStreamed(params: {
    campaign_id: bigint;
    contributor: AddressParam;
  }): Promise<AssembledTransaction<boolean>> {
    return executeWithErrorHandling(
      () =>
        this.client.is_reward_streamed({
          campaign_id: params.campaign_id,
          contributor: addressToString(params.contributor),
        }),
      "Check reward streamed"
    );
  }

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  /**
   * Fetch the full campaign record for a given ID.
   *
   * @throws {FundableStellarError} If no campaign exists with that ID.
   */
  public async getCampaign(params: {
    campaign_id: bigint;
  }): Promise<AssembledTransaction<Campaign>> {
    return executeWithErrorHandling(
      () => this.client.get_campaign({ campaign_id: params.campaign_id }),
      "Get campaign"
    );
  }

  /**
   * Return the total amount contributed by a specific address to a campaign.
   *
   * Returns `0n` if the address has never contributed (or after a refund).
   */
  public async getContribution(params: {
    campaign_id: bigint;
    contributor: AddressParam;
  }): Promise<AssembledTransaction<bigint>> {
    return executeWithErrorHandling(
      () =>
        this.client.get_contribution({
          campaign_id: params.campaign_id,
          contributor: addressToString(params.contributor),
        }),
      "Get contribution"
    );
  }

  /**
   * Return the total number of campaigns ever created.
   */
  public async getCampaignCount(): Promise<AssembledTransaction<bigint>> {
    return executeWithErrorHandling(
      () => this.client.get_campaign_count(),
      "Get campaign count"
    );
  }

  /**
   * Return the current protocol fee rate in basis points.
   */
  public async getFeeRate(): Promise<AssembledTransaction<number>> {
    return executeWithErrorHandling(
      () => this.client.get_fee_rate(),
      "Get fee rate"
    );
  }

  /**
   * Return the current fee collector address.
   */
  public async getFeeCollector(): Promise<AssembledTransaction<string>> {
    return executeWithErrorHandling(
      () => this.client.get_fee_collector(),
      "Get fee collector"
    );
  }

  /**
   * Return the configured payment-stream contract address, if any.
   */
  public async getStreamContract(): Promise<
    AssembledTransaction<string | undefined>
  > {
    return executeWithErrorHandling(
      () =>
        this.client.get_stream_contract() as Promise<
          AssembledTransaction<string | undefined>
        >,
      "Get stream contract"
    );
  }

  // -------------------------------------------------------------------------
  // Admin setters
  // -------------------------------------------------------------------------

  /**
   * Update the protocol fee rate.
   *
   * @param params.new_fee_rate - New rate in basis points (0–500).
   * @throws {FundableStellarError} If caller is not admin or rate exceeds 500.
   */
  public async setFeeRate(params: {
    new_fee_rate: number;
  }): Promise<AssembledTransaction<null>> {
    return executeWithErrorHandling(
      () => this.client.set_fee_rate({ new_fee_rate: params.new_fee_rate }),
      "Set fee rate"
    );
  }

  /**
   * Update the protocol fee collector address.
   *
   * @throws {FundableStellarError} If caller is not admin.
   */
  public async setFeeCollector(params: {
    new_fee_collector: AddressParam;
  }): Promise<AssembledTransaction<null>> {
    return executeWithErrorHandling(
      () =>
        this.client.set_fee_collector({
          new_fee_collector: addressToString(params.new_fee_collector),
        }),
      "Set fee collector"
    );
  }

  /**
   * Configure the payment-stream contract address used for reward streaming.
   *
   * Must be called once by the admin before `streamSponsorRewards` can be
   * used.
   *
   * @param params.stream_contract - Address of the deployed payment-stream
   *   contract.
   * @throws {FundableStellarError} If caller is not admin.
   */
  public async setStreamContract(params: {
    stream_contract: AddressParam;
  }): Promise<AssembledTransaction<null>> {
    return executeWithErrorHandling(
      () =>
        this.client.set_stream_contract({
          stream_contract: addressToString(params.stream_contract),
        }),
      "Set stream contract"
    );
  }
}
