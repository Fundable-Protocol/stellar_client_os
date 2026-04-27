/**
 * Transaction utilities for Fundable Stellar smart contracts.
 *
 * Provides convenience methods for waiting on AssembledTransaction confirmations
 * and handling transaction lifecycle events.
 */

import { AssembledTransaction } from "@stellar/stellar-sdk/contract";
import {
  SorobanRpc,
  AnalogSignaturePayload,
} from "@stellar/stellar-sdk";

/**
 * Configuration options for waiting on a transaction
 */
export interface WaitForTransactionOptions {
  /**
   * Maximum time to wait for confirmation in milliseconds.
   * Default: 60000 (60 seconds)
   */
  timeout?: number;

  /**
   * Polling interval in milliseconds.
   * Default: 1000 (1 second)
   */
  pollInterval?: number;

  /**
   * Callback function invoked on each poll attempt
   * @param attempt - Current attempt number (1-indexed)
   * @param elapsedMs - Elapsed time in milliseconds
   */
  onPoll?: (attempt: number, elapsedMs: number) => void;
}

/**
 * Result of a successful transaction wait
 */
export interface TransactionWaitResult<T = unknown> {
  /** Transaction hash */
  hash: string;
  /** Ledger sequence number where transaction was included */
  ledger: number;
  /** Contract invocation result (if applicable) */
  result?: T;
}

/**
 * Waits for an AssembledTransaction to be confirmed on-chain.
 *
 * This is a convenience method that simplifies the developer experience by
 * automatically polling for transaction confirmation after signing and sending.
 *
 * @typeParam T - The result type of the contract invocation
 * @param tx - The AssembledTransaction to wait for
 * @param rpcUrl - The Soroban RPC URL to use for polling
 * @param options - Configuration options
 * @returns Promise resolving to transaction confirmation details
 * @throws {Error} If timeout is exceeded or transaction fails
 *
 * @example
 * ```typescript
 * import { PaymentStreamClient, waitForTransaction } from '@fundable/sdk';
 *
 * const client = new PaymentStreamClient(options);
 * const tx = await client.createStream(params);
 * await tx.signAndSend({ signTransaction: signer });
 *
 * const result = await waitForTransaction(tx, rpcUrl);
 * console.log('Stream created:', result.result); // Stream ID
 * console.log('Ledger:', result.ledger);
 * ```
 */
export async function waitForTransaction<T = unknown>(
  tx: AssembledTransaction<T>,
  rpcUrl: string,
  options: WaitForTransactionOptions = {},
): Promise<TransactionWaitResult<T>> {
  const {
    timeout = 60000,
    pollInterval = 1000,
    onPoll,
  } = options;

  // Ensure the transaction has been sent
  if (!tx.hash) {
    throw new Error(
      "Transaction has not been signed and sent. " +
      "Call signAndSend() first before waiting for confirmation.",
    );
  }

  const rpc = new SorobanRpc.Server(rpcUrl);
  const startTime = Date.now();
  let attempt = 0;

  while (true) {
    attempt++;
    const elapsedMs = Date.now() - startTime;

    // Check timeout
    if (elapsedMs > timeout) {
      throw new Error(
        `Transaction confirmation timeout after ${timeout}ms. ` +
        `Transaction hash: ${tx.hash}. ` +
        `Please check the transaction status on Horizon.`,
      );
    }

    try {
      // Invoke callback if provided
      if (onPoll) {
        onPoll(attempt, elapsedMs);
      }

      // Poll for transaction status
      const response = await rpc.getTransaction(tx.hash);

      if (response.status === SorobanRpc.GetTransactionStatus.SUCCESS) {
        return {
          hash: tx.hash,
          ledger: response.ledger,
          result: tx.result,
        };
      }

      if (response.status === SorobanRpc.GetTransactionStatus.FAILED) {
        throw new Error(
          `Transaction failed on ledger ${response.ledger}. ` +
          `Hash: ${tx.hash}. ` +
          `Please check the transaction for detailed error information.`,
        );
      }

      // Status is PENDING, continue polling
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    } catch (error) {
      // Handle RPC errors
      if (error instanceof Error) {
        // If it's our custom error, re-throw
        if (
          error.message.includes("Transaction confirmation timeout") ||
          error.message.includes("Transaction failed on ledger")
        ) {
          throw error;
        }

        // If it's a "not found" error, the transaction may not be submitted yet
        if (error.message.includes("not found")) {
          // Continue polling
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          continue;
        }
      }

      // For other RPC errors, re-throw
      throw new Error(
        `Error polling transaction status: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

/**
 * Convenience method combining signAndSend with waitForTransaction.
 *
 * Sign, send, and automatically wait for confirmation in one call.
 *
 * @typeParam T - The result type of the contract invocation
 * @param tx - The AssembledTransaction to sign and send
 * @param rpcUrl - The Soroban RPC URL
 * @param signTransaction - Callback function to sign the transaction
 * @param options - Configuration options for waiting
 * @returns Promise resolving to transaction confirmation details
 * @throws {Error} If signing, sending, or confirmation fails
 *
 * @example
 * ```typescript
 * import { PaymentStreamClient, signAndWait } from '@fundable/sdk';
 *
 * const client = new PaymentStreamClient(options);
 * const tx = await client.createStream(params);
 *
 * const result = await signAndWait(
 *   tx,
 *   rpcUrl,
 *   (xdr) => wallet.signTransaction(xdr),
 *   { timeout: 90000 }
 * );
 *
 * console.log('Stream created with ID:', result.result);
 * ```
 */
export async function signAndWait<T = unknown>(
  tx: AssembledTransaction<T>,
  rpcUrl: string,
  signTransaction: (xdr: string) => Promise<string>,
  options: WaitForTransactionOptions = {},
): Promise<TransactionWaitResult<T>> {
  // Sign and send the transaction
  await tx.signAndSend({
    signTransaction: async (xdr: string) => ({
      signedTxXdr: await signTransaction(xdr),
    }),
  });

  // Wait for confirmation
  return waitForTransaction(tx, rpcUrl, options);
}
