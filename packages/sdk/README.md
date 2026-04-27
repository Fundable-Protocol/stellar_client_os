# @fundable/sdk

TypeScript SDK for interacting with the Fundable Protocol's smart contracts on the Stellar network.

**Note:** This SDK is currently under development. The API is not yet stable and may change.

## Installation

Once published, you can install the SDK using your package manager of choice:

```bash
pnpm add @fundable/sdk
# or
npm install @fundable/sdk
# or
yarn add @fundable/sdk
```

## Peer Dependencies

This SDK has a peer dependency on `@stellar/stellar-sdk`. You will need to have it installed in your project:

```bash
pnpm add @stellar/stellar-sdk
```

---

## API Reference (Under Development)

The SDK provides client classes for interacting with the deployed smart contracts.

### `PaymentStreamClient`

The `PaymentStreamClient` provides methods for interacting with the `payment-stream` contract.

-   **`createStream(...)`**: Create a new payment stream.
-   **`getStream(...)`**: Retrieve stream details.
-   **`withdrawableAmount(...)`**: Calculate the withdrawable amount for a stream.
-   **`withdraw(...)`**: Withdraw from a stream.
-   **`pauseStream(...)`**: Pause a stream.
-   **`resumeStream(...)`**: Resume a stream.
-   **`cancelStream(...)`**: Cancel a stream.

### `DistributorClient`

The `DistributorClient` provides methods for interacting with the `distributor` contract.

-   **`distributeEqual(...)`**: Distribute tokens equally to a list of recipients.
-   **`distributeWeighted(...)`**: Distribute tokens with weighted amounts to a list of recipients.

### Transaction Utilities

#### `waitForTransaction<T>(tx, rpcUrl, options?)`

Waits for an `AssembledTransaction` to be confirmed on-chain. This simplifies the UX for developers by automatically handling polling and confirmation.

**Features:**
- Automatic polling with configurable intervals
- Timeout protection (default: 60 seconds)
- Progress tracking with optional callbacks
- Clear error messages for failures
- Full TypeScript support

**Example:**
```typescript
import { PaymentStreamClient, waitForTransaction } from "@fundable/sdk";

const client = new PaymentStreamClient(config);
const tx = await client.createStream(params);

await tx.signAndSend({
  signTransaction: (xdr) => wallet.signTransaction(xdr),
});

const result = await waitForTransaction(tx, "https://soroban-testnet.stellar.org");
console.log(`Stream created with ID: ${result.result}`);
console.log(`Confirmed on ledger: ${result.ledger}`);
```

#### `signAndWait<T>(tx, rpcUrl, signTransaction, options?)`

Convenience method that combines `signAndSend` with `waitForTransaction` in a single call.

**Example:**
```typescript
import { PaymentStreamClient, signAndWait } from "@fundable/sdk";

const client = new PaymentStreamClient(config);
const tx = await client.createStream(params);

const result = await signAndWait(
  tx,
  "https://soroban-testnet.stellar.org",
  (xdr) => wallet.signTransaction(xdr),
);

console.log(`Stream created with ID: ${result.result}`);
```

For detailed documentation, see [waitForTransaction Guide](../docs/sdk/waitForTransaction.md).

### Data Structures

#### `Stream`

The `Stream` interface represents the data structure for a payment stream.

```typescript
export interface Stream {
    id: bigint;
    sender: string;
    recipient: string;
    token: string;
    totalAmount: bigint;
    withdrawnAmount: bigint;
    startTime: bigint;
    endTime: bigint;
    status: "Active" | "Paused" | "Canceled" | "Completed";
}
```

## Usage Example

Here's how to use the SDK to create a payment stream and wait for confirmation:

```typescript
import {
  PaymentStreamClient,
  signAndWait,
} from "@fundable/sdk";

const client = new PaymentStreamClient({
  contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
  networkPassphrase: "Test SDF Network ; September 2015",
  rpcUrl: "https://soroban-testnet.stellar.org",
  publicKey: userPublicKey,
});

async function createAndConfirmStream() {
  const tx = await client.createStream({
    sender: "GAAA...",
    recipient: "GBBB...",
    token: "CAAA...",
    total_amount: 1000n,
    initial_amount: 0n,
    start_time: BigInt(Math.floor(Date.now() / 1000)),
    end_time: BigInt(Math.floor(Date.now() / 1000) + 86400 * 30),
  });

  // Sign, send, and wait for confirmation
  const result = await signAndWait(
    tx,
    "https://soroban-testnet.stellar.org",
    (xdr) => wallet.signTransaction(xdr),
  );

  console.log(`Stream created with ID: ${result.result}`);
  console.log(`Confirmed on ledger: ${result.ledger}`);
}

createAndConfirmStream();
```
