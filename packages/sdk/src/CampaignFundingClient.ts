import {
  AssembledTransaction,
  ClientOptions as ContractClientOptions,
} from "@stellar/stellar-sdk/contract";
import { Address } from "@stellar/stellar-sdk";
import { Client as ContractClient } from "./generated/campaign-funding/src/index.js";
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
 * Supported currencies for multi-currency pledges.
 *
 * - `USD`  — US Dollar (fiat, converted to on-chain token at pledge time)
 * - `EUR`  — Euro (fiat, converted to on-chain token at pledge time)
 * - `XLM`  — Stellar Lumens (native on-chain asset)
 * - `USDC` — USD Coin (on-chain stablecoin)
 */
export type Currency = "USD" | "EUR" | "XLM" | "USDC";

/**
 * A conversion quote describing how an original pledge amount in one
 * currency converts into the campaign's settlement currency.
 *
 * The quote is produced off-chain (e.g. by an oracle or price feed) and
 * passed to `contributeWithQuote` so the contract can record both the
 * original and converted amounts for receipts and auditing.
 */
export interface ConversionQuote {
  /** Currency the backer selected at checkout. */
  originalCurrency: Currency;
  /** Amount the backer pledged, denominated in `originalCurrency`. */
  originalAmount: bigint;
  /** Currency the campaign settles in (typically the campaign token). */
  convertedCurrency: Currency;
  /** Amount actually transferred on-chain, denominated in `convertedCurrency`. */
  convertedAmount: bigint;
  /**
   * Conversion rate applied (convertedAmount / originalAmount), scaled by
   * 1e7 to preserve precision as an integer.  Displayed to the backer
   * before confirmation.
   */
  rate: bigint;
  /** Unix timestamp (seconds) at which the quote was issued. */
  quotedAt: bigint;
}

/**
 * Dual-amount contribution record returned by `getContributionWithCurrency`.
 *
 * Receipts show both the original amount the backer pledged and the
 * converted amount that was actually settled on-chain.
 */
export interface ContributionRecord {
  /** Original currency selected by the backer. */
  originalCurrency: Currency;
  /** Original amount pledged, in `originalCurrency`. */
  originalAmount: bigint;
  /** Currency the contribution was settled in. */
  convertedCurrency: Currency;
  /** Converted amount settled on-chain, in `convertedCurrency`. */
  convertedAmount: bigint;
  /** Conversion rate applied, scaled by 1e7. */
  rate: bigint;
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
  20: { message: "UnsupportedCurrency" },
  21: { message: "InvalidConversionQuote" },
  22: { message: "QuoteExpired" },
  23: { message: "ConversionRateMismatch" },
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
   * Contribute to an active campaign using a multi-currency conversion quote.
   *
   * The backer selects their preferred currency at checkout; the quote
   * describes the conversion into the campaign's settlement currency.  The
   * contract records both the original and converted amounts so receipts can
   * display them side by side.
   *
   * @param params.contributor       - Backer address.
   * @param params.campaign_id       - Target campaign ID.
   * @param params.originalCurrency  - Currency selected by the backer.
   * @param params.originalAmount    - Amount pledged in `originalCurrency`.
   * @param params.convertedCurrency - Settlement currency of the campaign.
   * @param params.convertedAmount   - Amount settled on-chain in
   *                                   `convertedCurrency`.
   * @param params.quote             - Conversion quote (rate + timestamp) that
   *                                   was displayed to the backer before
   *                                   confirmation.
   * @throws {FundableStellarError} If the currency is unsupported, the quote
   *   is invalid or expired, the rate does not match the amounts, or the
   *   campaign is not active.
   */
  public async contributeWithQuote(params: {
    contributor: AddressParam;
    campaign_id: bigint;
    originalCurrency: Currency;
    originalAmount: bigint;
    convertedCurrency: Currency;
    convertedAmount: bigint;
    quote: ConversionQuote;
  }): Promise<AssembledTransaction<null>> {
    return executeWithErrorHandling(
      () =>
        this.client.contribute_with_quote({
          contributor: addressToString(params.contributor),
          campaign_id: params.campaign_id,
          original_currency: params.originalCurrency,
          original_amount: params.originalAmount,
          converted_currency: params.convertedCurrency,
          converted_amount: params.convertedAmount,
          quote: {
            original_currency: params.quote.originalCurrency,
            original_amount: params.quote.originalAmount,
            converted_currency: params.quote.convertedCurrency,
            converted_amount: params.quote.convertedAmount,
            rate: params.quote.rate,
            quoted_at: params.quote.quotedAt,
          },
        }),
      "Contribute to campaign with conversion quote"
    );
  }

  /**
   * Contribute without including the sponsor address in the contribution event.
   * The transaction signer and contract ledger storage remain publicly visible.
   */
  public async contributeAnonymously(params: {
    contributor: AddressParam;
    campaign_id: bigint;
    amount: bigint;
  }): Promise<AssembledTransaction<null>> {
    return executeWithErrorHandling(
      () =>
        this.client.contribute_anonymously({
          contributor: addressToString(params.contributor),
          campaign_id: params.campaign_id,
          amount: params.amount,
        }),
      "Contribute anonymously to campaign"
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
   * Read back the stored dual amounts (original + converted) for a
   * contribution made via `contributeWithQuote`.
   *
   * Useful for rendering receipts that show both the amount the backer
   * pledged and the amount actually settled on-chain.
   *
   * @returns A `ContributionRecord` with both currencies and amounts, or
   *   `undefined` if the contributor has no recorded contribution.
   * @throws {FundableStellarError} If the campaign does not exist.
   */
  public async getContributionWithCurrency(params: {
    campaign_id: bigint;
    contributor: AddressParam;
  }): Promise<AssembledTransaction<ContributionRecord | undefined>> {
    return executeWithErrorHandling(
      () =>
        this.client.get_contribution_with_currency({
          campaign_id: params.campaign_id,
          contributor: addressToString(params.contributor),
        }) as Promise<AssembledTransaction<ContributionRecord | undefined>>,
      "Get contribution with currency"
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