import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}




/**
 * Custom errors for the contract
 */
export const Errors = {
  1: {message:"AlreadyInitialized"},
  2: {message:"NotInitialized"},
  3: {message:"Unauthorized"},
  4: {message:"InvalidAmount"},
  5: {message:"InvalidTimeRange"},
  6: {message:"StreamNotFound"},
  7: {message:"StreamNotActive"},
  8: {message:"StreamNotPaused"},
  9: {message:"StreamCannotBeCanceled"},
  10: {message:"InsufficientWithdrawable"},
  11: {message:"TransferFailed"},
  12: {message:"FeeTooHigh"},
  13: {message:"InvalidRecipient"},
  14: {message:"DepositExceedsTotal"},
  15: {message:"ArithmeticOverflow"},
  16: {message:"InvalidDelegate"}
}


/**
 * Stream data structure
 */
export interface Stream {
  balance: i128;
  end_time: u64;
  id: u64;
  paused_at: Option<u64>;
  recipient: string;
  sender: string;
  start_time: u64;
  status: StreamStatus;
  token: string;
  total_amount: i128;
  total_paused_duration: u64;
  withdrawn_amount: i128;
}

/**
 * Stream status enum
 */
export type StreamStatus = {tag: "Active", values: void} | {tag: "Paused", values: void} | {tag: "Canceled", values: void} | {tag: "Completed", values: void};


/**
 * Per-stream metrics tracking
 */
export interface StreamMetrics {
  current_delegate: Option<string>;
  last_activity: u64;
  last_delegation_time: u64;
  pause_count: u32;
  total_delegations: u32;
  total_withdrawn: i128;
  withdrawal_count: u32;
}


/**
 * Protocol-wide metrics tracking
 */
export interface ProtocolMetrics {
  total_active_streams: u64;
  total_delegations: u64;
  total_streams_created: u64;
  total_tokens_streamed: i128;
}


/**
 * Fee collected event data
 */
export interface FeeCollectedEvent {
  amount: i128;
  stream_id: u64;
}


export interface StreamPausedEvent {
  paused_at: u64;
  stream_id: u64;
}


/**
 * Stream deposit event data
 */
export interface StreamDepositEvent {
  amount: i128;
  stream_id: u64;
}


export interface StreamResumedEvent {
  paused_duration: u64;
  resumed_at: u64;
  stream_id: u64;
}


/**
 * Delegation granted event data
 */
export interface DelegationGrantedEvent {
  delegate: string;
  recipient: string;
  stream_id: u64;
}


/**
 * Delegation revoked event data
 */
export interface DelegationRevokedEvent {
  recipient: string;
  stream_id: u64;
}

export interface Client {
  /**
   * Construct and simulate a deposit transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Deposit tokens to an existing stream
   */
  deposit: ({stream_id, amount}: {stream_id: u64, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a withdraw transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Withdraw from a stream
   */
  withdraw: ({stream_id, amount}: {stream_id: u64, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_stream transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get stream details
   */
  get_stream: ({stream_id}: {stream_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Stream>>

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Initialize the contract
   */
  initialize: ({admin, fee_collector, general_fee_rate}: {admin: string, fee_collector: string, general_fee_rate: u32}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_delegate transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get the delegate for a stream
   */
  get_delegate: ({stream_id}: {stream_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Option<string>>>

  /**
   * Construct and simulate a pause_stream transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Pause a stream (sender only)
   */
  pause_stream: ({stream_id}: {stream_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a set_delegate transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Set a delegate for withdrawal rights on a stream
   */
  set_delegate: ({stream_id, delegate}: {stream_id: u64, delegate: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a withdraw_max transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Withdraw the maximum available amount from a stream
   */
  withdraw_max: ({stream_id}: {stream_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a cancel_stream transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Cancel a stream
   */
  cancel_stream: ({stream_id}: {stream_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a create_stream transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Create a new payment stream
   */
  create_stream: ({sender, recipient, token, total_amount, initial_amount, start_time, end_time}: {sender: string, recipient: string, token: string, total_amount: i128, initial_amount: i128, start_time: u64, end_time: u64}, options?: MethodOptions) => Promise<AssembledTransaction<u64>>

  /**
   * Construct and simulate a resume_stream transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Resume a paused stream (sender only)
   */
  resume_stream: ({stream_id}: {stream_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a revoke_delegate transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Revoke the delegate for a stream
   */
  revoke_delegate: ({stream_id}: {stream_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_fee_collector transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get the current fee collector
   */
  get_fee_collector: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a set_fee_collector transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Set the fee collector address
   */
  set_fee_collector: ({new_fee_collector}: {new_fee_collector: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_stream_metrics transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get stream-specific metrics
   */
  get_stream_metrics: ({stream_id}: {stream_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<StreamMetrics>>

  /**
   * Construct and simulate a withdrawable_amount transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Calculate withdrawable amount for a stream
   */
  withdrawable_amount: ({stream_id}: {stream_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a get_protocol_metrics transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get protocol-wide metrics
   */
  get_protocol_metrics: (options?: MethodOptions) => Promise<AssembledTransaction<ProtocolMetrics>>

  /**
   * Construct and simulate a get_protocol_fee_rate transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get the current protocol fee rate
   */
  get_protocol_fee_rate: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a set_protocol_fee_rate transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Set the protocol fee rate
   */
  set_protocol_fee_rate: ({new_fee_rate}: {new_fee_rate: u32}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAAAAACREZXBvc2l0IHRva2VucyB0byBhbiBleGlzdGluZyBzdHJlYW0AAAAHZGVwb3NpdAAAAAACAAAAAAAAAAlzdHJlYW1faWQAAAAAAAAGAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAA",
        "AAAABAAAAB5DdXN0b20gZXJyb3JzIGZvciB0aGUgY29udHJhY3QAAAAAAAAAAAAFRXJyb3IAAAAAAAAQAAAAAAAAABJBbHJlYWR5SW5pdGlhbGl6ZWQAAAAAAAEAAAAAAAAADk5vdEluaXRpYWxpemVkAAAAAAACAAAAAAAAAAxVbmF1dGhvcml6ZWQAAAADAAAAAAAAAA1JbnZhbGlkQW1vdW50AAAAAAAABAAAAAAAAAAQSW52YWxpZFRpbWVSYW5nZQAAAAUAAAAAAAAADlN0cmVhbU5vdEZvdW5kAAAAAAAGAAAAAAAAAA9TdHJlYW1Ob3RBY3RpdmUAAAAABwAAAAAAAAAPU3RyZWFtTm90UGF1c2VkAAAAAAgAAAAAAAAAFlN0cmVhbUNhbm5vdEJlQ2FuY2VsZWQAAAAAAAkAAAAAAAAAGEluc3VmZmljaWVudFdpdGhkcmF3YWJsZQAAAAoAAAAAAAAADlRyYW5zZmVyRmFpbGVkAAAAAAALAAAAAAAAAApGZWVUb29IaWdoAAAAAAAMAAAAAAAAABBJbnZhbGlkUmVjaXBpZW50AAAADQAAAAAAAAATRGVwb3NpdEV4Y2VlZHNUb3RhbAAAAAAOAAAAAAAAABJBcml0aG1ldGljT3ZlcmZsb3cAAAAAAA8AAAAAAAAAD0ludmFsaWREZWxlZ2F0ZQAAAAAQ",
        "AAAAAAAAABZXaXRoZHJhdyBmcm9tIGEgc3RyZWFtAAAAAAAId2l0aGRyYXcAAAACAAAAAAAAAAlzdHJlYW1faWQAAAAAAAAGAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAA",
        "AAAAAQAAABVTdHJlYW0gZGF0YSBzdHJ1Y3R1cmUAAAAAAAAAAAAABlN0cmVhbQAAAAAADAAAAAAAAAAHYmFsYW5jZQAAAAALAAAAAAAAAAhlbmRfdGltZQAAAAYAAAAAAAAAAmlkAAAAAAAGAAAAAAAAAAlwYXVzZWRfYXQAAAAAAAPoAAAABgAAAAAAAAAJcmVjaXBpZW50AAAAAAAAEwAAAAAAAAAGc2VuZGVyAAAAAAATAAAAAAAAAApzdGFydF90aW1lAAAAAAAGAAAAAAAAAAZzdGF0dXMAAAAAB9AAAAAMU3RyZWFtU3RhdHVzAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAAAAAADHRvdGFsX2Ftb3VudAAAAAsAAAAAAAAAFXRvdGFsX3BhdXNlZF9kdXJhdGlvbgAAAAAAAAYAAAAAAAAAEHdpdGhkcmF3bl9hbW91bnQAAAAL",
        "AAAAAAAAABJHZXQgc3RyZWFtIGRldGFpbHMAAAAAAApnZXRfc3RyZWFtAAAAAAABAAAAAAAAAAlzdHJlYW1faWQAAAAAAAAGAAAAAQAAB9AAAAAGU3RyZWFtAAA=",
        "AAAAAAAAABdJbml0aWFsaXplIHRoZSBjb250cmFjdAAAAAAKaW5pdGlhbGl6ZQAAAAAAAwAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAA1mZWVfY29sbGVjdG9yAAAAAAAAEwAAAAAAAAAQZ2VuZXJhbF9mZWVfcmF0ZQAAAAQAAAAA",
        "AAAAAAAAAB1HZXQgdGhlIGRlbGVnYXRlIGZvciBhIHN0cmVhbQAAAAAAAAxnZXRfZGVsZWdhdGUAAAABAAAAAAAAAAlzdHJlYW1faWQAAAAAAAAGAAAAAQAAA+gAAAAT",
        "AAAAAAAAABxQYXVzZSBhIHN0cmVhbSAoc2VuZGVyIG9ubHkpAAAADHBhdXNlX3N0cmVhbQAAAAEAAAAAAAAACXN0cmVhbV9pZAAAAAAAAAYAAAAA",
        "AAAAAAAAADBTZXQgYSBkZWxlZ2F0ZSBmb3Igd2l0aGRyYXdhbCByaWdodHMgb24gYSBzdHJlYW0AAAAMc2V0X2RlbGVnYXRlAAAAAgAAAAAAAAAJc3RyZWFtX2lkAAAAAAAABgAAAAAAAAAIZGVsZWdhdGUAAAATAAAAAA==",
        "AAAAAAAAADNXaXRoZHJhdyB0aGUgbWF4aW11bSBhdmFpbGFibGUgYW1vdW50IGZyb20gYSBzdHJlYW0AAAAADHdpdGhkcmF3X21heAAAAAEAAAAAAAAACXN0cmVhbV9pZAAAAAAAAAYAAAAA",
        "AAAAAAAAAA9DYW5jZWwgYSBzdHJlYW0AAAAADWNhbmNlbF9zdHJlYW0AAAAAAAABAAAAAAAAAAlzdHJlYW1faWQAAAAAAAAGAAAAAA==",
        "AAAAAAAAABtDcmVhdGUgYSBuZXcgcGF5bWVudCBzdHJlYW0AAAAADWNyZWF0ZV9zdHJlYW0AAAAAAAAHAAAAAAAAAAZzZW5kZXIAAAAAABMAAAAAAAAACXJlY2lwaWVudAAAAAAAABMAAAAAAAAABXRva2VuAAAAAAAAEwAAAAAAAAAMdG90YWxfYW1vdW50AAAACwAAAAAAAAAOaW5pdGlhbF9hbW91bnQAAAAAAAsAAAAAAAAACnN0YXJ0X3RpbWUAAAAAAAYAAAAAAAAACGVuZF90aW1lAAAABgAAAAEAAAAG",
        "AAAAAAAAACRSZXN1bWUgYSBwYXVzZWQgc3RyZWFtIChzZW5kZXIgb25seSkAAAANcmVzdW1lX3N0cmVhbQAAAAAAAAEAAAAAAAAACXN0cmVhbV9pZAAAAAAAAAYAAAAA",
        "AAAAAgAAABJTdHJlYW0gc3RhdHVzIGVudW0AAAAAAAAAAAAMU3RyZWFtU3RhdHVzAAAABAAAAAAAAAAAAAAABkFjdGl2ZQAAAAAAAAAAAAAAAAAGUGF1c2VkAAAAAAAAAAAAAAAAAAhDYW5jZWxlZAAAAAAAAAAAAAAACUNvbXBsZXRlZAAAAA==",
        "AAAAAAAAACBSZXZva2UgdGhlIGRlbGVnYXRlIGZvciBhIHN0cmVhbQAAAA9yZXZva2VfZGVsZWdhdGUAAAAAAQAAAAAAAAAJc3RyZWFtX2lkAAAAAAAABgAAAAA=",
        "AAAAAQAAABtQZXItc3RyZWFtIG1ldHJpY3MgdHJhY2tpbmcAAAAAAAAAAA1TdHJlYW1NZXRyaWNzAAAAAAAABwAAAAAAAAAQY3VycmVudF9kZWxlZ2F0ZQAAA+gAAAATAAAAAAAAAA1sYXN0X2FjdGl2aXR5AAAAAAAABgAAAAAAAAAUbGFzdF9kZWxlZ2F0aW9uX3RpbWUAAAAGAAAAAAAAAAtwYXVzZV9jb3VudAAAAAAEAAAAAAAAABF0b3RhbF9kZWxlZ2F0aW9ucwAAAAAAAAQAAAAAAAAAD3RvdGFsX3dpdGhkcmF3bgAAAAALAAAAAAAAABB3aXRoZHJhd2FsX2NvdW50AAAABA==",
        "AAAAAAAAAB1HZXQgdGhlIGN1cnJlbnQgZmVlIGNvbGxlY3RvcgAAAAAAABFnZXRfZmVlX2NvbGxlY3RvcgAAAAAAAAAAAAABAAAAEw==",
        "AAAAAAAAAB1TZXQgdGhlIGZlZSBjb2xsZWN0b3IgYWRkcmVzcwAAAAAAABFzZXRfZmVlX2NvbGxlY3RvcgAAAAAAAAEAAAAAAAAAEW5ld19mZWVfY29sbGVjdG9yAAAAAAAAEwAAAAA=",
        "AAAAAQAAAB5Qcm90b2NvbC13aWRlIG1ldHJpY3MgdHJhY2tpbmcAAAAAAAAAAAAPUHJvdG9jb2xNZXRyaWNzAAAAAAQAAAAAAAAAFHRvdGFsX2FjdGl2ZV9zdHJlYW1zAAAABgAAAAAAAAARdG90YWxfZGVsZWdhdGlvbnMAAAAAAAAGAAAAAAAAABV0b3RhbF9zdHJlYW1zX2NyZWF0ZWQAAAAAAAAGAAAAAAAAABV0b3RhbF90b2tlbnNfc3RyZWFtZWQAAAAAAAAL",
        "AAAAAAAAABtHZXQgc3RyZWFtLXNwZWNpZmljIG1ldHJpY3MAAAAAEmdldF9zdHJlYW1fbWV0cmljcwAAAAAAAQAAAAAAAAAJc3RyZWFtX2lkAAAAAAAABgAAAAEAAAfQAAAADVN0cmVhbU1ldHJpY3MAAAA=",
        "AAAAAAAAACpDYWxjdWxhdGUgd2l0aGRyYXdhYmxlIGFtb3VudCBmb3IgYSBzdHJlYW0AAAAAABN3aXRoZHJhd2FibGVfYW1vdW50AAAAAAEAAAAAAAAACXN0cmVhbV9pZAAAAAAAAAYAAAABAAAACw==",
        "AAAAAQAAABhGZWUgY29sbGVjdGVkIGV2ZW50IGRhdGEAAAAAAAAAEUZlZUNvbGxlY3RlZEV2ZW50AAAAAAAAAgAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAlzdHJlYW1faWQAAAAAAAAG",
        "AAAAAQAAAAAAAAAAAAAAEVN0cmVhbVBhdXNlZEV2ZW50AAAAAAAAAgAAAAAAAAAJcGF1c2VkX2F0AAAAAAAABgAAAAAAAAAJc3RyZWFtX2lkAAAAAAAABg==",
        "AAAAAAAAABlHZXQgcHJvdG9jb2wtd2lkZSBtZXRyaWNzAAAAAAAAFGdldF9wcm90b2NvbF9tZXRyaWNzAAAAAAAAAAEAAAfQAAAAD1Byb3RvY29sTWV0cmljcwA=",
        "AAAAAQAAABlTdHJlYW0gZGVwb3NpdCBldmVudCBkYXRhAAAAAAAAAAAAABJTdHJlYW1EZXBvc2l0RXZlbnQAAAAAAAIAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAJc3RyZWFtX2lkAAAAAAAABg==",
        "AAAAAQAAAAAAAAAAAAAAElN0cmVhbVJlc3VtZWRFdmVudAAAAAAAAwAAAAAAAAAPcGF1c2VkX2R1cmF0aW9uAAAAAAYAAAAAAAAACnJlc3VtZWRfYXQAAAAAAAYAAAAAAAAACXN0cmVhbV9pZAAAAAAAAAY=",
        "AAAAAAAAACFHZXQgdGhlIGN1cnJlbnQgcHJvdG9jb2wgZmVlIHJhdGUAAAAAAAAVZ2V0X3Byb3RvY29sX2ZlZV9yYXRlAAAAAAAAAAAAAAEAAAAE",
        "AAAAAAAAABlTZXQgdGhlIHByb3RvY29sIGZlZSByYXRlAAAAAAAAFXNldF9wcm90b2NvbF9mZWVfcmF0ZQAAAAAAAAEAAAAAAAAADG5ld19mZWVfcmF0ZQAAAAQAAAAA",
        "AAAAAQAAAB1EZWxlZ2F0aW9uIGdyYW50ZWQgZXZlbnQgZGF0YQAAAAAAAAAAAAAWRGVsZWdhdGlvbkdyYW50ZWRFdmVudAAAAAAAAwAAAAAAAAAIZGVsZWdhdGUAAAATAAAAAAAAAAlyZWNpcGllbnQAAAAAAAATAAAAAAAAAAlzdHJlYW1faWQAAAAAAAAG",
        "AAAAAQAAAB1EZWxlZ2F0aW9uIHJldm9rZWQgZXZlbnQgZGF0YQAAAAAAAAAAAAAWRGVsZWdhdGlvblJldm9rZWRFdmVudAAAAAAAAgAAAAAAAAAJcmVjaXBpZW50AAAAAAAAEwAAAAAAAAAJc3RyZWFtX2lkAAAAAAAABg==" ]),
      options
    )
  }
  public readonly fromJSON = {
    deposit: this.txFromJSON<null>,
        withdraw: this.txFromJSON<null>,
        get_stream: this.txFromJSON<Stream>,
        initialize: this.txFromJSON<null>,
        get_delegate: this.txFromJSON<Option<string>>,
        pause_stream: this.txFromJSON<null>,
        set_delegate: this.txFromJSON<null>,
        withdraw_max: this.txFromJSON<null>,
        cancel_stream: this.txFromJSON<null>,
        create_stream: this.txFromJSON<u64>,
        resume_stream: this.txFromJSON<null>,
        revoke_delegate: this.txFromJSON<null>,
        get_fee_collector: this.txFromJSON<string>,
        set_fee_collector: this.txFromJSON<null>,
        get_stream_metrics: this.txFromJSON<StreamMetrics>,
        withdrawable_amount: this.txFromJSON<i128>,
        get_protocol_metrics: this.txFromJSON<ProtocolMetrics>,
        get_protocol_fee_rate: this.txFromJSON<u32>,
        set_protocol_fee_rate: this.txFromJSON<null>
  }
}