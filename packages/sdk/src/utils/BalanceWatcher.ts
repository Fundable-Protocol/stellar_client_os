/**
 * BalanceWatcher - Utility class for monitoring token balance changes
 * 
 * Provides a helper class to subscribe to balance changes for specific tokens/addresses
 * involved in streams using RPC polling or event subscription.
 */

import { SorobanRpc, Contract } from "@stellar/stellar-sdk";

export interface BalanceWatcherOptions {
  rpcUrl: string;
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
  private pollInterval: number;
  private watchers: Map<string, {
    address: string;
    token: string;
    lastBalance: bigint | null;
    callbacks: Set<BalanceCallback>;
  }>;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  constructor(options: BalanceWatcherOptions) {
    this.rpcServer = new SorobanRpc.Server(options.rpcUrl);
    this.pollInterval = options.pollInterval || 5000;
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
   * Fetch the current balance for an address/token pair
   */
  private async fetchBalance(address: string, token: string): Promise<bigint> {
    const contract = new Contract(token);
    
    // Build the balance query using Stellar SDK
    const account = await this.rpcServer.getAccount(address);
    
    // Call the token contract's balance method
    // Note: This is a simplified implementation. In production, you'd use
    // the proper contract client or AssembledTransaction pattern
    const balanceCall = contract.call("balance", address);
    
    // Simulate the transaction to get the result
    const tx = balanceCall as any; // Type assertion for simplicity
    
    // For now, return a placeholder - in real implementation, 
    // you'd properly simulate and parse the result
    // This would use SorobanRpc.Server.simulateTransaction
    
    try {
      // Simplified: In production, build proper transaction and simulate
      // const result = await this.rpcServer.simulateTransaction(tx);
      // return parseBalanceFromResult(result);
      
      // Placeholder return - actual implementation would parse XDR result
      return BigInt(0);
    } catch (error) {
      throw new Error(`Failed to fetch balance: ${error}`);
    }
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
