import { Client as ContractClient } from "./generated/payment-stream/src/index.js";
import {
  AssembledTransaction,
  ClientOptions as ContractClientOptions,
  Address,
} from "@stellar/stellar-sdk/contract";
import {
  Stream,
  StreamMetrics,
  ProtocolMetrics,
  StreamStatus,
} from "./generated/payment-stream/src/index.js";
import { executeWithErrorHandling } from "./utils/errors.js";
import {
  getStreamHistory,
  getAllStreamHistory,
  StreamHistoryResult,
} from "./utils/streamHistory.js";
import { PaymentStreamContractEvent } from "./utils/events.js";

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
 * High-level client for interacting with the Payment Stream contract.
 * Provides a type-safe and DX-optimized interface for all contract methods.
 *
 * All methods now include error handling that parses Soroban simulation errors
 * and transaction result XDR to provide human-readable error messages.
 */
export class PaymentStreamClient {
  private client: ContractClient;
  private rpcUrl?: string;
  private contractId?: string;

  /**
   * Create a new PaymentStreamClient.
   * @param options Configuration for the underlying contract client.
   */
  constructor(options: ContractClientOptions) {
    this.client = new ContractClient(options);
    // Store RPC URL and contract ID for history methods
    this.rpcUrl = options.rpcUrl;
    this.contractId = options.contractId;
  }

  /**
   * Create a new payment stream.
   * @param params Stream parameters including sender, recipient, token, and time range.
   * @returns An AssembledTransaction that returns the new stream ID.
   * @throws {FundableStellarError} If stream creation fails with a human-readable error message
   */
  public async createStream(params: {
    sender: AddressParam;
    recipient: AddressParam;
    token: AddressParam;
    total_amount: bigint;
    initial_amount: bigint;
    start_time: bigint;
    end_time: bigint;
  }): Promise<AssembledTransaction<bigint>> {
    return executeWithErrorHandling(
      () =>
        this.client.create_stream({
          sender: addressToString(params.sender),
          recipient: addressToString(params.recipient),
          token: addressToString(params.token),
          total_amount: params.total_amount,
          initial_amount: params.initial_amount,
          start_time: params.start_time,
          end_time: params.end_time,
        }),
      "Create stream"
    );
  }

  /**
   * Deposit tokens to an existing stream.
   * @param streamId The ID of the stream to deposit into, or an object containing streamId and amount.
   * @param amount The amount of tokens to deposit.
   * @throws {FundableStellarError} If deposit fails with a human-readable error message
   */
  public async deposit(
    streamId: bigint,
    amount: bigint,
  ): Promise<AssembledTransaction<null>>;
  public async deposit(params: {
    streamId: bigint;
    amount: bigint;
  }): Promise<AssembledTransaction<null>>;
  public async deposit(
    streamId: bigint | { streamId: bigint; amount: bigint },
    amount?: bigint,
  ): Promise<AssembledTransaction<null>> {
    let actualStreamId: bigint;
    let actualAmount: bigint;

    if (typeof streamId === "object") {
      actualStreamId = streamId.streamId;
      actualAmount = streamId.amount;
    } else {
      actualStreamId = streamId;
      actualAmount = amount!;
    }

    return executeWithErrorHandling(
      () => this.client.deposit({ stream_id: actualStreamId, amount: actualAmount }),
      "Deposit to stream",
    );
  }

  /**
   * Withdraw tokens from a stream.
   * @param streamId The ID of the stream to withdraw from, or an object containing streamId and amount.
   * @param amount The amount of tokens to withdraw.
   * @throws {FundableStellarError} If withdrawal fails with a human-readable error message
   */
  public async withdraw(
    streamId: bigint,
    amount: bigint,
  ): Promise<AssembledTransaction<null>>;
  public async withdraw(params: {
    streamId: bigint;
    amount: bigint;
  }): Promise<AssembledTransaction<null>>;
  public async withdraw(
    streamId: bigint | { streamId: bigint; amount: bigint },
    amount?: bigint,
  ): Promise<AssembledTransaction<null>> {
    let actualStreamId: bigint;
    let actualAmount: bigint;

    if (typeof streamId === "object") {
      actualStreamId = streamId.streamId;
      actualAmount = streamId.amount;
    } else {
      actualStreamId = streamId;
      actualAmount = amount!;
    }

    return executeWithErrorHandling(
      () => this.client.withdraw({ stream_id: actualStreamId, amount: actualAmount }),
      "Withdraw from stream",
    );
  }

  /**
   * Withdraw the maximum available amount from a stream.
   * @param streamId The ID of the stream to withdraw from, or an object containing streamId.
   * @throws {FundableStellarError} If withdrawal fails with a human-readable error message
   */
  public async withdrawMax(streamId: bigint): Promise<AssembledTransaction<null>>;
  public async withdrawMax(params: { streamId: bigint }): Promise<AssembledTransaction<null>>;
  public async withdrawMax(
    streamId: bigint | { streamId: bigint },
  ): Promise<AssembledTransaction<null>> {
    const actualStreamId = typeof streamId === "object" ? streamId.streamId : streamId;

    return executeWithErrorHandling(
      () => this.client.withdraw_max({ stream_id: actualStreamId }),
      "Withdraw maximum from stream",
    );
  }

  /**
   * Pause a stream. Only the sender can pause a stream.
   * @param streamId The ID of the stream to pause, or an object containing streamId.
   * @throws {FundableStellarError} If pause fails with a human-readable error message
   */
  public async pauseStream(streamId: bigint): Promise<AssembledTransaction<null>>;
  public async pauseStream(params: { streamId: bigint }): Promise<AssembledTransaction<null>>;
  public async pauseStream(
    streamId: bigint | { streamId: bigint },
  ): Promise<AssembledTransaction<null>> {
    const actualStreamId = typeof streamId === "object" ? streamId.streamId : streamId;

    return executeWithErrorHandling(
      () => this.client.pause_stream({ stream_id: actualStreamId }),
      "Pause stream",
    );
  }

  /**
   * Resume a paused stream. Only the sender can resume a stream.
   * @param streamId The ID of the stream to resume, or an object containing streamId.
   * @throws {FundableStellarError} If resume fails with a human-readable error message
   */
  public async resumeStream(streamId: bigint): Promise<AssembledTransaction<null>>;
  public async resumeStream(params: { streamId: bigint }): Promise<AssembledTransaction<null>>;
  public async resumeStream(
    streamId: bigint | { streamId: bigint },
  ): Promise<AssembledTransaction<null>> {
    const actualStreamId = typeof streamId === "object" ? streamId.streamId : streamId;

    return executeWithErrorHandling(
      () => this.client.resume_stream({ stream_id: actualStreamId }),
      "Resume stream",
    );
  }

  /**
   * Cancel a stream.
   * @param streamId The ID of the stream to cancel, or an object containing streamId.
   * @throws {FundableStellarError} If cancellation fails with a human-readable error message
   */
  public async cancelStream(streamId: bigint): Promise<AssembledTransaction<null>>;
  public async cancelStream(params: { streamId: bigint }): Promise<AssembledTransaction<null>>;
  public async cancelStream(
    streamId: bigint | { streamId: bigint },
  ): Promise<AssembledTransaction<null>> {
    const actualStreamId = typeof streamId === "object" ? streamId.streamId : streamId;

    return executeWithErrorHandling(
      () => this.client.cancel_stream({ stream_id: actualStreamId }),
      "Cancel stream",
    );
  }

  /**
   * Get stream details by ID.
   * @param streamId The ID of the stream, or an object containing streamId.
   * @throws {FundableStellarError} If fetch fails with a human-readable error message
   */
  public async getStream(streamId: bigint): Promise<AssembledTransaction<Stream>>;
  public async getStream(params: { streamId: bigint }): Promise<AssembledTransaction<Stream>>;
  public async getStream(
    streamId: bigint | { streamId: bigint },
  ): Promise<AssembledTransaction<Stream>> {
    const actualStreamId = typeof streamId === "object" ? streamId.streamId : streamId;

    return executeWithErrorHandling(
      () => this.client.get_stream({ stream_id: actualStreamId }),
      "Get stream details",
    );
  }

  /**
   * Calculate the current withdrawable amount for a stream.
   * @param streamId The ID of the stream, or an object containing streamId.
   * @throws {FundableStellarError} If calculation fails with a human-readable error message
   */
  public async getWithdrawableAmount(streamId: bigint): Promise<AssembledTransaction<bigint>>;
  public async getWithdrawableAmount(params: { streamId: bigint }): Promise<AssembledTransaction<bigint>>;
  public async getWithdrawableAmount(
    streamId: bigint | { streamId: bigint },
  ): Promise<AssembledTransaction<bigint>> {
    const actualStreamId = typeof streamId === "object" ? streamId.streamId : streamId;

    return executeWithErrorHandling(
      () => this.client.withdrawable_amount({ stream_id: actualStreamId }),
      "Get withdrawable amount",
    );
  }

  /**
   * Set a delegate for withdrawal rights on a stream.
   * @param streamId The ID of the stream, or an object containing streamId and delegate.
   * @param delegate The address of the delegate.
   * @throws {FundableStellarError} If delegation fails with a human-readable error message
   */
  public async setDelegate(
    streamId: bigint,
    delegate: string,
  ): Promise<AssembledTransaction<null>>;
  public async setDelegate(params: {
    streamId: bigint;
    delegate: string;
  }): Promise<AssembledTransaction<null>>;
  public async setDelegate(
    streamId: bigint | { streamId: bigint; delegate: string },
    delegate?: string,
  ): Promise<AssembledTransaction<null>> {
    let actualStreamId: bigint;
    let actualDelegate: string;

    if (typeof streamId === "object") {
      actualStreamId = streamId.streamId;
      actualDelegate = streamId.delegate;
    } else {
      actualStreamId = streamId;
      actualDelegate = delegate!;
    }

    return executeWithErrorHandling(
      () => this.client.set_delegate({ stream_id: actualStreamId, delegate: actualDelegate }),
      "Set delegate for stream",
    );
  }

  /**
   * Revoke the delegate for a stream.
   * @param streamId The ID of the stream, or an object containing streamId.
   * @throws {FundableStellarError} If revocation fails with a human-readable error message
   */
  public async revokeDelegate(streamId: bigint): Promise<AssembledTransaction<null>>;
  public async revokeDelegate(params: { streamId: bigint }): Promise<AssembledTransaction<null>>;
  public async revokeDelegate(
    streamId: bigint | { streamId: bigint },
  ): Promise<AssembledTransaction<null>> {
    const actualStreamId = typeof streamId === "object" ? streamId.streamId : streamId;

    return executeWithErrorHandling(
      () => this.client.revoke_delegate({ stream_id: actualStreamId }),
      "Revoke stream delegate",
    );
  }

  /**
   * Get the delegate for a stream.
   * @param streamId The ID of the stream, or an object containing streamId.
   * @throws {FundableStellarError} If fetch fails with a human-readable error message
   */
  public async getDelegate(streamId: bigint): Promise<AssembledTransaction<string | undefined>>;
  public async getDelegate(params: { streamId: bigint }): Promise<AssembledTransaction<string | undefined>>;
  public async getDelegate(
    streamId: bigint | { streamId: bigint },
  ): Promise<AssembledTransaction<string | undefined>> {
    const actualStreamId = typeof streamId === "object" ? streamId.streamId : streamId;

    return executeWithErrorHandling(
      () =>
        this.client.get_delegate({ stream_id: actualStreamId }) as Promise<
          AssembledTransaction<string | undefined>
        >,
      "Get stream delegate",
    );
  }

  /**
   * Get stream-specific metrics.
   * @param streamId The ID of the stream, or an object containing streamId.
   * @throws {FundableStellarError} If fetch fails with a human-readable error message
   */
  public async getStreamMetrics(streamId: bigint): Promise<AssembledTransaction<StreamMetrics>>;
  public async getStreamMetrics(params: { streamId: bigint }): Promise<AssembledTransaction<StreamMetrics>>;
  public async getStreamMetrics(
    streamId: bigint | { streamId: bigint },
  ): Promise<AssembledTransaction<StreamMetrics>> {
    const actualStreamId = typeof streamId === "object" ? streamId.streamId : streamId;

    return executeWithErrorHandling(
      () => this.client.get_stream_metrics({ stream_id: actualStreamId }),
      "Get stream metrics",
    );
  }

  /**
   * Get protocol-wide metrics.
   * @throws {FundableStellarError} If fetch fails with a human-readable error message
   */
  public async getProtocolMetrics(): Promise<
    AssembledTransaction<ProtocolMetrics>
  > {
    return executeWithErrorHandling(
      () => this.client.get_protocol_metrics(),
      "Get protocol metrics"
    );
  }

  /**
   * Get the current protocol fee collector address.
   * @throws {FundableStellarError} If fetch fails with a human-readable error message
   */
  public async getFeeCollector(): Promise<AssembledTransaction<string>> {
    return executeWithErrorHandling(
      () => this.client.get_fee_collector(),
      "Get fee collector"
    );
  }

  /**
   * Get the current protocol fee rate.
   * @throws {FundableStellarError} If fetch fails with a human-readable error message
   */
  public async getProtocolFeeRate(): Promise<AssembledTransaction<number>> {
    return executeWithErrorHandling(
      () => this.client.get_protocol_fee_rate(),
      "Get protocol fee rate"
    );
  }

  /**
   * Initialize the contract.
   * @throws {FundableStellarError} If initialization fails with a human-readable error message
   */
  public async initialize(params: {
    admin: AddressParam;
    fee_collector: AddressParam;
    general_fee_rate: number;
  }): Promise<AssembledTransaction<null>> {
    return executeWithErrorHandling(
      () =>
        this.client.initialize({
          admin: addressToString(params.admin),
          fee_collector: addressToString(params.fee_collector),
          general_fee_rate: params.general_fee_rate,
        }),
      "Initialize contract"
    );
  }

  /**
   * Get history events for a specific stream
   * @param streamId The ID of the stream, or an object containing streamId and optional pagination parameters
   * @param options Optional parameters for pagination
   * @returns Stream history with parsed events
   * @throws {Error} If RPC URL or contract ID is not configured
   */
  public async getStreamHistory(
    streamId: bigint,
    options?: { startLedger?: number; limit?: number }
  ): Promise<StreamHistoryResult>;
  public async getStreamHistory(params: {
    streamId: bigint;
    startLedger?: number;
    limit?: number;
  }): Promise<StreamHistoryResult>;
  public async getStreamHistory(
    streamId: bigint | { streamId: bigint; startLedger?: number; limit?: number },
    options?: { startLedger?: number; limit?: number }
  ): Promise<StreamHistoryResult> {
    if (!this.rpcUrl || !this.contractId) {
      throw new Error(
        "RPC URL and contract ID must be provided in constructor to use getStreamHistory"
      );
    }

    let actualStreamId: bigint;
    let actualOptions: { startLedger?: number; limit?: number };

    if (typeof streamId === "object") {
      actualStreamId = streamId.streamId;
      actualOptions = {
        startLedger: streamId.startLedger,
        limit: streamId.limit,
      };
    } else {
      actualStreamId = streamId;
      actualOptions = options || {};
    }

    return getStreamHistory({
      rpcUrl: this.rpcUrl,
      contractId: this.contractId,
      streamId: actualStreamId,
      ...actualOptions,
    });
  }

  /**
   * Get all history events for a specific stream across multiple pages
   * @param streamId The ID of the stream, or an object containing streamId and optional parameters
   * @param options Optional parameters
   * @returns All stream events
   * @throws {Error} If RPC URL or contract ID is not configured
   */
  public async getAllStreamHistory(
    streamId: bigint,
    options?: { startLedger?: number; maxPages?: number }
  ): Promise<PaymentStreamContractEvent[]>;
  public async getAllStreamHistory(params: {
    streamId: bigint;
    startLedger?: number;
    maxPages?: number;
  }): Promise<PaymentStreamContractEvent[]>;
  public async getAllStreamHistory(
    streamId: bigint | { streamId: bigint; startLedger?: number; maxPages?: number },
    options?: { startLedger?: number; maxPages?: number }
  ): Promise<PaymentStreamContractEvent[]> {
    if (!this.rpcUrl || !this.contractId) {
      throw new Error(
        "RPC URL and contract ID must be provided in constructor to use getAllStreamHistory"
      );
    }

    let actualStreamId: bigint;
    let actualStartLedger: number | undefined;
    let actualMaxPages: number | undefined;

    if (typeof streamId === "object") {
      actualStreamId = streamId.streamId;
      actualStartLedger = streamId.startLedger;
      actualMaxPages = streamId.maxPages;
    } else {
      actualStreamId = streamId;
      actualStartLedger = options?.startLedger;
      actualMaxPages = options?.maxPages;
    }

    return getAllStreamHistory(
      {
        rpcUrl: this.rpcUrl,
        contractId: this.contractId,
        streamId: actualStreamId,
        startLedger: actualStartLedger,
      },
      actualMaxPages
    );
  }

  /**
   * Wait for a previously sent transaction to be confirmed on-chain.
   * @param tx The AssembledTransaction to wait for (must already be signed and sent).
   * @param options Optional polling configuration.
   * @throws {Error} If rpcUrl was not provided in the constructor options.
   */
  public async waitForTransaction<T = unknown>(
    tx: AssembledTransaction<T>,
    options?: WaitForTransactionOptions,
  ): Promise<TransactionWaitResult<T>> {
    if (!this.rpcUrl) {
      throw new Error("rpcUrl must be provided in constructor options to use waitForTransaction");
    }
    return waitForTransaction(tx, this.rpcUrl, options);
  }

  /**
   * Sign, send, and wait for a transaction to be confirmed on-chain in one call.
   * @param tx The AssembledTransaction to sign and send.
   * @param signTransaction Callback to sign the transaction XDR.
   * @param options Optional polling configuration.
   * @throws {Error} If rpcUrl was not provided in the constructor options.
   */
  public async signAndWait<T = unknown>(
    tx: AssembledTransaction<T>,
    signTransaction: (xdr: string) => Promise<string>,
    options?: WaitForTransactionOptions,
  ): Promise<TransactionWaitResult<T>> {
    if (!this.rpcUrl) {
      throw new Error("rpcUrl must be provided in constructor options to use signAndWait");
    }
    return signAndWait(tx, this.rpcUrl, signTransaction, options);
  }
}
