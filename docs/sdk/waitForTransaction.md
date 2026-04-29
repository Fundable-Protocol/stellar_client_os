# waitForTransaction Guide

This guide explains how to use the transaction utilities provided by the Fundable SDK to handle the lifecycle of Stellar transactions, from submission to on-chain confirmation.

## Overview

Interacting with the Stellar network involves submitting transactions to Soroban RPC nodes. Since the network is asynchronous, a transaction is not immediate. The SDK provides two main utilities to simplify this process:

1.  **`waitForTransaction`**: Polls the network until a previously submitted transaction is confirmed or fails.
2.  **`signAndWait`**: A convenience method that signs, sends, and waits for confirmation in a single call.

---

## `waitForTransaction`

Use this method when you have already called `signAndSend()` on an `AssembledTransaction` and need to wait for it to be included in a ledger.

### Usage Example

```typescript
import { PaymentStreamClient, waitForTransaction } from "@fundable/sdk";

const client = new PaymentStreamClient(config);
const tx = await client.createStream(params);

// 1. Sign and send the transaction
await tx.signAndSend({
  signTransaction: async (xdr) => {
    const signed = await myWallet.signTransaction(xdr);
    return { signedTxXdr: signed };
  }
});

// 2. Wait for confirmation
try {
  const result = await waitForTransaction(
    tx,
    "https://soroban-testnet.stellar.org"
  );
  console.log(`Transaction confirmed in ledger: ${result.ledger}`);
  console.log(`Stream ID: ${result.result}`);
} catch (error) {
  console.error("Transaction failed or timed out:", error);
}
```

---

## `signAndWait`

This is the recommended way to handle most transactions. it combines signing, sending, and waiting into one promise.

### Usage Example

```typescript
import { PaymentStreamClient, signAndWait } from "@fundable/sdk";

const client = new PaymentStreamClient(config);
const tx = await client.createStream(params);

try {
  const result = await signAndWait(
    tx,
    "https://soroban-testnet.stellar.org",
    async (xdr) => await myWallet.signTransaction(xdr),
    {
      timeout: 90000, // Wait up to 90 seconds
      onPoll: (attempt, elapsed) => {
        console.log(`Polling attempt ${attempt}... (${elapsed}ms elapsed)`);
      }
    }
  );
  console.log("Success!", result.result);
} catch (error) {
  console.error("Operation failed:", error);
}
```

---

## Configuration Options

Both methods accept an optional `options` object:

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `timeout` | `number` | `60000` | Maximum time (ms) to wait before throwing a timeout error. |
| `pollInterval` | `number` | `1000` | Time (ms) between status checks. |
| `onPoll` | `function` | `undefined` | Callback invoked on every poll. Receives `(attempt, elapsedMs)`. |

---

## Common Failure Modes

### 1. Timeout
If the transaction isn't confirmed within the `timeout` period, an error is thrown. This doesn't necessarily mean the transaction failed; it might still be pending on-chain.
*   **Fix**: Increase the `timeout` or check the transaction hash on a block explorer.

### 2. Transaction Failed
If the smart contract execution fails (e.g., due to insufficient funds, invalid parameters, or logic errors), the RPC will return a `FAILED` status.
*   **Fix**: Check the `error` message for specific contract failure details.

### 3. "Not Found" during Polling
Immediately after submission, the RPC might return a "not found" error for the transaction hash while it propagates through the network.
*   **Behavior**: The SDK automatically handles this and continues polling until the transaction is found or the timeout is reached.

### 4. Signing Errors
If the `signTransaction` callback fails or is cancelled by the user, `signAndWait` will throw an error immediately.
*   **Fix**: Ensure the wallet is connected and the user approves the transaction.
