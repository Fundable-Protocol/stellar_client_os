/**
 * BalanceWatcher - Utility class for monitoring token balance changes
 *
 * Subscribes to balance changes for specific tokens/addresses involved in
 * payment streams using RPC polling. Supports:
 *
 *  - Per-address/token subscriptions via `watch()`
 *  - Stream-level subscriptions via `watchStream()` (watches sender + recipient)
 *  - Bulk balance fetching via `fetchBalances()`
 *  - Last-known balance cache via `getLastKnownBalance()`
 *  - Per-instance error callbacks via `onError` option
 *  - Clean lifecycle management: `start()`, `stop()`, `clear()`
 */

import {
  rpc as SorobanRpc,
  TransactionBuilder,
  Operation,
  Account,
  scValToNative,
  Address,
} from "@stellar/stellar-sdk";
import type { Stream } from "../generated/payment-stream/src/index.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface BalanceWatcherOptions {
  /** Soroban RPC endpoint URL. */
  rpcUrl: string;
  /**
   * Stellar network passphrase. When omitted, it is fetched from the RPC
   * server automatically on the first balance poll and then cached.
   */
  networkPassphrase?: string;
  /**
   * How often (in ms) to poll all watched address/token pairs.
   * @default 5000
   */
  pollInterval?: number;
  /**
   * Optional callback invoked whenever a polling error occurs for a watched
   * pair. Replaces the previous silent `console.error` behaviour, giving
   * callers full control over error handling.
   *
   * @param error   The error that was thrown.
   * @param address The address whose balance could not be fetched.
   * @param token   The token contract address.
   */
  onError?: (error: Error, address: string, token: string) => void;
}

/** A balance change notification delivered to watch callbacks. */
export interface BalanceUpdate {
  /** The Stellar address whose balance changed. */
  address: string;
  /** The token contract address. */
  token: string;
  /** The new balance (i128 as bigint). */
  balance: bigint;
  /** Unix timestamp (ms) when the change was detected. */
  timestamp: number;
}

/** Called whenever a watched balance changes. */
export type BalanceCallback = (update: BalanceUpdate) => void;

/** A single address/token pair for bulk fetching. */
export interface BalancePair {
  address: string;
  token: string;
}

/** Result of a single entry in a bulk `fetchBalances()` call. */
export interface BalanceFetchResult {
  address: string;
  token: string;
  balance: bigint | null;
  /** Set when the fetch failed; `balance` will be `null`. */
  error?: Error;
}

// ---------------------------------------------------------------------------
// Internal watcher record
// ---------------------------------------------------------------------------

interface WatcherRecord {
  address: string;
  token: string;
  lastBalance: bigint | null;
  callbacks: Set<BalanceCallback>;
}

// ---------------------------------------------------------------------------
// BalanceWatcher
// ---------------------------------------------------------------------------

/**
 * Monitors token balances for specified addresses and notifies subscribers
 * when balances change.
 *
 * @example
 * ```ts
 * const watcher = new BalanceWatcher({
 *   rpcUrl: 'https://soroban-testnet.stellar.org',
 *   networkPassphrase: Networks.TESTNET,
 *   pollInterval: 3000,
 *   onError: (err, address, token) =>
 *     console.warn(`Balance fetch failed for ${address}:`, err.message),
 * });
 *
 * // Watch a single address/token pair
 * const unsub = watcher.watch(senderAddress, tokenContractId, (update) => {
 *   console.log(`Balance changed to ${update.balance}`);
 * });
 *
 * // Watch all parties involved in a Payment Stream
 * const unsubStream = watcher.watchStream(stream, tokenContractId, (update) => {
 *   console.log(`${update.address} balance: ${update.balance}`);
 * });
 *
 * // Later: clean up
 * unsub();
 * unsubStream();
 * watcher.clear();
 * ```
 */
export class BalanceWatcher {
  private readonly rpcServer: SorobanRpc.Server;
  private networkPassphrase: string | undefined;
  private readonly pollInterval: number;
  private readonly errorHandler: BalanceWatcherOptions["onError"];

  private watchers: Map<string, WatcherRecord> = new Map();
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private isRunning: boolean = false;
  private pollPromise: Promise<void> | null = null;

  constructor(options: BalanceWatcherOptions) {
    this.rpcServer = new SorobanRpc.Server(options.rpcUrl);
    this.networkPassphrase = options.networkPassphrase;
    this.pollInterval = options.pollInterval ?? 5000;
    this.errorHandler = options.onError;
    this.watchers = new Map();
  }

  // ── Single address/token watch ───────────────────────────────────────────

  /**
   * Subscribe to balance changes for a specific address/token pair.
   *
   * Multiple callbacks can be registered for the same pair; each is called
   * independently when the balance changes. The pair is polled once
   * immediately when the first callback is registered.
   *
   * @param address  The Stellar address to watch.
   * @param token    The token contract address.
   * @param callback Invoked with a {@link BalanceUpdate} whenever the balance changes.
   * @returns An unsubscribe function. Call it to stop receiving updates.
   */
  public watch(
    address: string,
    token: string,
    callback: BalanceCallback,
  ): () => void {
    const unsubscribe = this.addWatcher(address, token, callback);

    if (!this.isRunning) {
      this.start();
    }

    return unsubscribe;
  }

  private addWatcher(
    address: string,
    token: string,
    callback: BalanceCallback,
  ): () => void {
    const key = this.getWatcherKey(address, token);

    if (!this.watchers.has(key)) {
      this.watchers.set(key, {
        address,
        token,
        lastBalance: null,
        callbacks: new Set(),
      });
    }

    const record = this.watchers.get(key)!;
    record.callbacks.add(callback);

    return () => this.unwatch(address, token, callback);
  }

  /**
   * Remove a single callback from a watched address/token pair.
   * When no callbacks remain for the pair, the pair is no longer polled.
   * When no pairs remain, the polling loop is stopped automatically.
   */
  public unwatch(
    address: string,
    token: string,
    callback: BalanceCallback,
  ): void {
    const key = this.getWatcherKey(address, token);
    const record = this.watchers.get(key);
    if (!record) return;

    record.callbacks.delete(callback);

    if (record.callbacks.size === 0) {
      this.watchers.delete(key);
      if (this.watchers.size === 0) {
        this.stop();
      }
    }
  }

  // ── Stream-level watch ───────────────────────────────────────────────────

  /**
   * Convenience method that watches the **sender** and **recipient** of a
   * Payment Stream simultaneously. A single `callback` receives updates for
   * both parties, differentiated by `update.address`.
   *
   * @param stream   A `Stream` object from the payment-stream contract.
   * @param token    The token contract address (matches `stream.token`).
   * @param callback Invoked whenever either party's balance changes.
   * @returns An unsubscribe function that removes both subscriptions at once.
   */
  public watchStream(
    stream: Pick<Stream, "sender" | "recipient" | "token">,
    callback: BalanceCallback,
  ): () => void {
    const token = stream.token;
    const unsubSender = this.addWatcher(stream.sender, token, callback);
    const unsubRecipient = this.addWatcher(stream.recipient, token, callback);

    if (!this.isRunning) {
      this.start();
    }

    return () => {
      unsubSender();
      unsubRecipient();
    };
  }

  // ── Bulk fetch ───────────────────────────────────────────────────────────

  /**
   * Fetch the current balance for multiple address/token pairs in parallel.
   * Failures for individual pairs are captured in the result's `error` field
   * rather than propagating, so a single failure does not abort the batch.
   *
   * @param pairs Array of `{ address, token }` pairs to fetch.
   * @returns An array of {@link BalanceFetchResult} in the same order as `pairs`.
   */
  public async fetchBalances(pairs: BalancePair[]): Promise<BalanceFetchResult[]> {
    const results = await Promise.allSettled(
      pairs.map((pair) => this.fetchBalance(pair.address, pair.token)),
    );

    return results.map((result, i) => {
      const { address, token } = pairs[i];
      if (result.status === "fulfilled") {
        return { address, token, balance: result.value };
      }
      return {
        address,
        token,
        balance: null,
        error: result.reason instanceof Error
          ? result.reason
          : new Error(String(result.reason)),
      };
    });
  }

  // ── Cache access ─────────────────────────────────────────────────────────

  /**
   * Returns the last balance value seen for an address/token pair from the
   * polling cache, without making any RPC call.
   *
   * Returns `null` if:
   * - The pair has never been polled.
   * - The pair is not currently being watched.
   * - The first poll has not yet completed.
   *
   * @param address The Stellar address.
   * @param token   The token contract address.
   */
  public getLastKnownBalance(address: string, token: string): bigint | null {
    const key = this.getWatcherKey(address, token);
    return this.watchers.get(key)?.lastBalance ?? null;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  /**
   * Start the polling loop. Called automatically by `watch()`, but can be
   * called manually if you stopped the loop with `stop()` and want to resume.
   */
  public start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.intervalId = setInterval(() => {
      void this.pollBalances();
    }, this.pollInterval);

    // Defer the initial poll so a batch of synchronous watch registrations is
    // included before the first RPC requests are created.
    queueMicrotask(() => {
      if (this.isRunning) {
        void this.pollBalances();
      }
    });
  }

  /**
   * Stop the polling loop without removing any watchers.
   * Call `start()` to resume polling with the existing subscriptions.
   */
  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
  }

  /**
   * Remove all watchers and stop the polling loop.
   */
  public clear(): void {
    this.watchers.clear();
    this.stop();
  }

  // ── Introspection ─────────────────────────────────────────────────────────

  /**
   * Returns the number of active address/token pairs currently being watched.
   */
  public getWatcherCount(): number {
    return this.watchers.size;
  }

  /**
   * Returns `true` if the polling loop is running.
   */
  public isActive(): boolean {
    return this.isRunning;
  }

  // ── Core RPC methods ─────────────────────────────────────────────────────

  /**
   * Fetch the current on-chain balance for a single address/token pair by
   * simulating a call to the SEP-41 token contract's `balance(address)`
   * function via Soroban RPC.
   *
   * The simulation is read-only — no transaction is ever submitted.
   *
   * @throws {Error} If the RPC simulation fails or returns an unexpected type.
   */
  public async fetchBalance(address: string, token: string): Promise<bigint> {
    const passphrase = await this.resolveNetworkPassphrase();
    const sourceAccount = new Account(address, "0");

    const tx = new TransactionBuilder(sourceAccount, {
      fee: "100",
      networkPassphrase: passphrase,
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: token,
          function: "balance",
          args: [new Address(address).toScVal()],
        }),
      )
      .setTimeout(0)
      .build();

    const simulation = await this.rpcServer.simulateTransaction(tx);

    if (SorobanRpc.Api.isSimulationError(simulation)) {
      throw new Error(`Balance simulation failed: ${simulation.error}`);
    }

    const retval = (
      simulation as SorobanRpc.Api.SimulateTransactionSuccessResponse
    ).result?.retval;

    if (retval === undefined) {
      throw new Error("Balance simulation returned no result");
    }

    const native = scValToNative(retval);

    if (typeof native !== "bigint") {
      throw new Error(
        `Unexpected balance type: expected bigint, got ${typeof native} (${native})`,
      );
    }

    return native;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Poll all watched address/token pairs and notify callbacks on changes.
   */
  private pollBalances(): Promise<void> {
    if (this.pollPromise) {
      return this.pollPromise;
    }

    const pollPromise = this.pollAllBalances();
    const trackedPoll = pollPromise.finally(() => {
      if (this.pollPromise === trackedPoll) {
        this.pollPromise = null;
      }
    });
    this.pollPromise = trackedPoll;
    return trackedPoll;
  }

  private async pollAllBalances(): Promise<void> {
    const promises = Array.from(this.watchers.values()).map(
      async (record) => {
        try {
          const balance = await this.fetchBalance(record.address, record.token);

          if (record.lastBalance === null || balance !== record.lastBalance) {
            record.lastBalance = balance;

            const update: BalanceUpdate = {
              address: record.address,
              token: record.token,
              balance,
              timestamp: Date.now(),
            };

            record.callbacks.forEach((cb) => {
              try {
                cb(update);
              } catch (cbError) {
                // Callback errors must not stop other callbacks from running
                console.error("Error in BalanceWatcher callback:", cbError);
              }
            });
          }
        } catch (error) {
          const err =
            error instanceof Error ? error : new Error(String(error));

          if (this.errorHandler) {
            try {
              this.errorHandler(err, record.address, record.token);
            } catch {
              // Swallow errors thrown by the error handler itself
            }
          } else {
            console.error(
              `BalanceWatcher: error fetching balance for ${record.address}:${record.token}:`,
              err,
            );
          }
        }
      },
    );

    await Promise.allSettled(promises);
  }

  /**
   * Resolves the network passphrase, fetching it from the RPC server if it
   * was not provided in the constructor options. The result is cached.
   */
  private async resolveNetworkPassphrase(): Promise<string> {
    if (this.networkPassphrase) return this.networkPassphrase;
    const { passphrase } = await this.rpcServer.getNetwork();
    this.networkPassphrase = passphrase;
    return passphrase;
  }

  private getWatcherKey(address: string, token: string): string {
    return `${address}:${token}`;
  }
}
