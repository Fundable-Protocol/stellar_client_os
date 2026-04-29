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





export interface UserStats {
  distributions_initiated: u32;
  total_amount: i128;
}


export interface TokenStats {
  distribution_count: u32;
  last_time: u64;
  total_amount: i128;
}


export interface DistributionHistory {
  amount: i128;
  recipients_count: u32;
  sender: string;
  timestamp: u64;
  token: string;
}

export interface Client {
  /**
   * Construct and simulate a get_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_admin: (options?: MethodOptions) => Promise<AssembledTransaction<Option<string>>>

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  initialize: ({admin, protocol_fee_percent, fee_address}: {admin: string, protocol_fee_percent: u32, fee_address: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_user_stats transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_user_stats: ({user}: {user: string}, options?: MethodOptions) => Promise<AssembledTransaction<Option<UserStats>>>

  /**
   * Construct and simulate a get_token_stats transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_token_stats: ({token}: {token: string}, options?: MethodOptions) => Promise<AssembledTransaction<Option<TokenStats>>>

  /**
   * Construct and simulate a distribute_equal transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  distribute_equal: ({sender, token, total_amount, recipients}: {sender: string, token: string, total_amount: i128, recipients: Array<string>}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a set_protocol_fee transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_protocol_fee: ({admin, new_fee_percent}: {admin: string, new_fee_percent: u32}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a distribute_weighted transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  distribute_weighted: ({sender, token, recipients, amounts}: {sender: string, token: string, recipients: Array<string>, amounts: Array<i128>}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_total_distributions transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_total_distributions: (options?: MethodOptions) => Promise<AssembledTransaction<u64>>

  /**
   * Construct and simulate a get_distribution_history transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_distribution_history: ({start_id, limit}: {start_id: u64, limit: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Array<DistributionHistory>>>

  /**
   * Construct and simulate a get_total_distributed_amount transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_total_distributed_amount: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>

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
      new ContractSpec([ "AAAAAAAAAAAAAAAJZ2V0X2FkbWluAAAAAAAAAAAAAAEAAAPoAAAAEw==",
        "AAAAAAAAAAAAAAAKaW5pdGlhbGl6ZQAAAAAAAwAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAABRwcm90b2NvbF9mZWVfcGVyY2VudAAAAAQAAAAAAAAAC2ZlZV9hZGRyZXNzAAAAABMAAAAA",
        "AAAAAQAAAAAAAAAAAAAACVVzZXJTdGF0cwAAAAAAAAIAAAAAAAAAF2Rpc3RyaWJ1dGlvbnNfaW5pdGlhdGVkAAAAAAQAAAAAAAAADHRvdGFsX2Ftb3VudAAAAAs=",
        "AAAAAQAAAAAAAAAAAAAAClRva2VuU3RhdHMAAAAAAAMAAAAAAAAAEmRpc3RyaWJ1dGlvbl9jb3VudAAAAAAABAAAAAAAAAAJbGFzdF90aW1lAAAAAAAABgAAAAAAAAAMdG90YWxfYW1vdW50AAAACw==",
        "AAAAAAAAAAAAAAAOZ2V0X3VzZXJfc3RhdHMAAAAAAAEAAAAAAAAABHVzZXIAAAATAAAAAQAAA+gAAAfQAAAACVVzZXJTdGF0cwAAAA==",
        "AAAAAAAAAAAAAAAPZ2V0X3Rva2VuX3N0YXRzAAAAAAEAAAAAAAAABXRva2VuAAAAAAAAEwAAAAEAAAPoAAAH0AAAAApUb2tlblN0YXRzAAA=",
        "AAAAAAAAAAAAAAAQZGlzdHJpYnV0ZV9lcXVhbAAAAAQAAAAAAAAABnNlbmRlcgAAAAAAEwAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAAAAAAx0b3RhbF9hbW91bnQAAAALAAAAAAAAAApyZWNpcGllbnRzAAAAAAPqAAAAEwAAAAA=",
        "AAAAAAAAAAAAAAAQc2V0X3Byb3RvY29sX2ZlZQAAAAIAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAPbmV3X2ZlZV9wZXJjZW50AAAAAAQAAAAA",
        "AAAAAAAAAAAAAAATZGlzdHJpYnV0ZV93ZWlnaHRlZAAAAAAEAAAAAAAAAAZzZW5kZXIAAAAAABMAAAAAAAAABXRva2VuAAAAAAAAEwAAAAAAAAAKcmVjaXBpZW50cwAAAAAD6gAAABMAAAAAAAAAB2Ftb3VudHMAAAAD6gAAAAsAAAAA",
        "AAAAAQAAAAAAAAAAAAAAE0Rpc3RyaWJ1dGlvbkhpc3RvcnkAAAAABQAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAABByZWNpcGllbnRzX2NvdW50AAAABAAAAAAAAAAGc2VuZGVyAAAAAAATAAAAAAAAAAl0aW1lc3RhbXAAAAAAAAAGAAAAAAAAAAV0b2tlbgAAAAAAABM=",
        "AAAAAAAAAAAAAAAXZ2V0X3RvdGFsX2Rpc3RyaWJ1dGlvbnMAAAAAAAAAAAEAAAAG",
        "AAAAAAAAAAAAAAAYZ2V0X2Rpc3RyaWJ1dGlvbl9oaXN0b3J5AAAAAgAAAAAAAAAIc3RhcnRfaWQAAAAGAAAAAAAAAAVsaW1pdAAAAAAAAAYAAAABAAAD6gAAB9AAAAATRGlzdHJpYnV0aW9uSGlzdG9yeQA=",
        "AAAAAAAAAAAAAAAcZ2V0X3RvdGFsX2Rpc3RyaWJ1dGVkX2Ftb3VudAAAAAAAAAABAAAACw==" ]),
      options
    )
  }
  public readonly fromJSON = {
    get_admin: this.txFromJSON<Option<string>>,
        initialize: this.txFromJSON<null>,
        get_user_stats: this.txFromJSON<Option<UserStats>>,
        get_token_stats: this.txFromJSON<Option<TokenStats>>,
        distribute_equal: this.txFromJSON<null>,
        set_protocol_fee: this.txFromJSON<null>,
        distribute_weighted: this.txFromJSON<null>,
        get_total_distributions: this.txFromJSON<u64>,
        get_distribution_history: this.txFromJSON<Array<DistributionHistory>>,
        get_total_distributed_amount: this.txFromJSON<i128>
  }
}