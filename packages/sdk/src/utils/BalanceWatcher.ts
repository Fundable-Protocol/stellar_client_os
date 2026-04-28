/**
 * BalanceWatcher - Utility class for monitoring token balance changes
 * 
 * Provides a helper class to subscribe to balance changes for specific tokens/addresses
 * involved in streams using RPC polling or event subscription.
 */

import {
  rpc as SorobanRpc,
  TransactionBuilder,
  Operation,
  Account,
  scValToNative,
  Address,
} from "@stellar/stellar-sdk";

export interface BalanceWatcherOptions {
  rpcUrl: string;
  networkPassphrase?: string;
  pollInterval?: number; // milliseconds, default 5000
}

export interface BalanceUpdate {
  address: string;
  token: string;
  balance: bigint;
  timestamp: number;
}

export type BalanceCallback = (update: BalanceUpdate) => void;

/**
 * BalanceWatcher monitors token balances for specified addresses
 * and notifies subscribers when balances change.
 */
export class BalanceWatcher {
  private rpcServer: SorobanRpc.Server;
  private networkPassphrase: string | undefined;
  private pollInterval: number;
  private watchers: Map<string, {
    address: string;
    token: string;
    lastBalance: bigint | null;
    callbacks: Set<BalanceCallback>;
  }>;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private isRunning: boolean = false;

  constructor(options: BalanceWatcherOptions) {
    this.rpcServer = new SorobanRpc.Server(options.rpcUrl);
    this.networkPassphrase = options.networkPassphrase;
    this.pollInterval = options.pollInterval ?? 5000;
    this.watchers = new Map();
  }

  /**
   * Watch a specific address/token pair for balance changes
   * @param address The Stellar address to watch
   * @param token The token contract address
   * @param callback Function to call when balance changes
   * @returns Unsubscribe function
   */
  public watch(
    address: string,
    token: string,
    callback: BalanceCallback
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

    const watcher = this.watchers.get(key)!;
    watcher.callbacks.add(callback);

    // Start polling if not already running
    if (!this.isRunning) {
      this.start();
    }

    // Return unsubscribe function
    return () => {
      watcher.callbacks.delete(callback);
      if (watcher.callbacks.size === 0) {
        this.watchers.delete(key);
        if (this.watchers.size === 0) {
          this.stop();
        }
      }
    };
  }

  /**
   * Start the balance polling loop
   */
  public start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.intervalId = setInterval(() => {
      this.pollBalances();
    }, this.pollInterval);

    // Initial poll
    this.pollBalances();
  }

  /**
   * Stop the balance polling loop
   */
  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
  }

  /**
   * Clear all watchers and stop polling
   */
  public clear(): void {
    this.watchers.clear();
    this.stop();
  }

  /**
   * Poll all watched addresses for balance updates
   */
  private async pollBalances(): Promise<void> {
    const promises = Array.from(this.watchers.entries()).map(
      async ([key, watcher]) => {
        try {
          const balance = await this.fetchBalance(watcher.address, watcher.token);
          
          // Check if balance changed
          if (watcher.lastBalance === null || balance !== watcher.lastBalance) {
            watcher.lastBalance = balance;
            
            const update: BalanceUpdate = {
              address: watcher.address,
              token: watcher.token,
              balance,
              timestamp: Date.now(),
            };

            // Notify all callbacks
            watcher.callbacks.forEach(callback => {
              try {
                callback(update);
              } catch (error) {
                console.error("Error in balance callback:", error);
              }
            });
          }
        } catch (error) {
          console.error(`Error fetching balance for ${key}:`, error);
        }
      }
    );

    await Promise.allSettled(promises);
  }

  /**
   * Fetch the current balance for an address/token pair by simulating a call
   * to the token contract's `balance(address)` function via Soroban RPC.
   *
   * The simulation is read-only (no transaction is submitted). The result is
   * parsed from the returned `ScVal` using `scValToNative` and returned as a
   * `bigint` (token amounts in Soroban are i128).
   *
   * @throws {Error} If the RPC simulation fails or returns an unexpected value type.
   */
  async fetchBalance(address: string, token: string): Promise<bigint> {
    const passphrase = await this.resolveNetworkPassphrase();

    // Build a minimal source account (sequence number doesn't matter for simulation)
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
        })
      )
      .setTimeout(0)
      .build();

    const simulation = await this.rpcServer.simulateTransaction(tx);

    if (SorobanRpc.Api.isSimulationError(simulation)) {
      throw new Error(`Balance simulation failed: ${simulation.error}`);
    }

    const retval = (simulation as SorobanRpc.Api.SimulateTransactionSuccessResponse)
      .result?.retval;

    if (retval === undefined) {
      throw new Error("Balance simulation returned no result");
    }

    const native = scValToNative(retval);

    if (typeof native !== "bigint") {
      throw new Error(
        `Unexpected balance type: expected bigint, got ${typeof native} (${native})`
      );
    }

    return native;
  }

  /**
   * Resolves the network passphrase, fetching it from the RPC server if not
   * provided in the constructor options.
   */
  private async resolveNetworkPassphrase(): Promise<string> {
    if (this.networkPassphrase) return this.networkPassphrase;
    const { passphrase } = await this.rpcServer.getNetwork();
    this.networkPassphrase = passphrase;
    return passphrase;
  }

  /**
   * Generate a unique key for a watcher
   */
  private getWatcherKey(address: string, token: string): string {
    return `${address}:${token}`;
  }

  /**
   * Get the number of active watchers
   */
  public getWatcherCount(): number {
    return this.watchers.size;
  }

  /**
   * Check if the watcher is currently running
   */
  public isActive(): boolean {
    return this.isRunning;
  }
}
