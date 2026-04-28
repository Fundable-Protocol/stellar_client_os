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

## Address Support

All SDK methods that accept address parameters now support both string addresses and `@stellar/stellar-sdk` `Address` objects. This provides better type safety and consistency with the underlying Stellar SDK.

**Example:**

```typescript
import { PaymentStreamClient, Address } from "@fundable/sdk";
import { Address as StellarAddress } from "@stellar/stellar-sdk";

const client = new PaymentStreamClient(config);

// Using string addresses (still supported)
const tx1 = await client.createStream({
  sender: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
  recipient: "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
  token: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
  // ... other params
});

// Using Address objects (new feature)
const senderAddress = new StellarAddress(
  "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"
);
const recipientAddress = new StellarAddress(
  "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"
);
const tokenAddress = new StellarAddress(
  "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM"
);

const tx2 = await client.createStream({
  sender: senderAddress,
  recipient: recipientAddress,
  token: tokenAddress,
  // ... other params
});
```

---

## API Reference (Under Development)

The SDK provides client classes for interacting with the deployed smart contracts.

### `PaymentStreamClient`

The `PaymentStreamClient` provides a high-level interface for creating and managing continuous payment streams.

**Initialize:**
```typescript
import { PaymentStreamClient } from "@fundable/sdk";

const client = new PaymentStreamClient({
  contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
  networkPassphrase: "Test SDF Network ; September 2015",
  rpcUrl: "https://soroban-testnet.stellar.org",
});
```

**Common Methods:**
-   **`createStream(params)`**: Initialize a new stream between a sender and recipient.
-   **`withdraw(streamId, amount)`**: Withdraw vested tokens from a stream.
-   **`pauseStream(streamId)`**: Temporarily stop vesting (sender only).
-   **`cancelStream(streamId)`**: Permanently end a stream and return unvested tokens to the sender.
-   **`getStream(streamId)`**: Fetch current status and metadata for a stream.

**Example: Creating and Monitoring a Stream**
```typescript
const tx = await client.createStream({
  sender: "GAAA...",
  recipient: "GBBB...",
  token: "CAAA...", // Contract ID of the token (e.g. USDC)
  total_amount: 1000000000n,
  initial_amount: 100000000n, // Optional upfront payment
  start_time: BigInt(Math.floor(Date.now() / 1000)),
  end_time: BigInt(Math.floor(Date.now() / 1000) + 86400 * 30), // 30 day vesting
});

// Sign and send using your preferred wallet
const result = await tx.signAndSend({ signTransaction: myWallet.sign });
```

### `DistributorClient`

The `DistributorClient` is used for one-to-many token distributions, such as airdrops or payroll.

**Initialize:**
```typescript
import { DistributorClient } from "@fundable/sdk";

const distributor = new DistributorClient({
  contractId: "CB...",
  networkPassphrase: "Test SDF Network ; September 2015",
  rpcUrl: "https://soroban-testnet.stellar.org",
});
```

**Common Methods:**
-   **`distributeEqual(params)`**: Sends an equal amount of tokens to every recipient in the list.
-   **`distributeWeighted(params)`**: Sends specific amounts to different recipients in a single transaction.

**Example: Bulk Payment**
```typescript
// Distribute 1000 tokens equally to 5 people
const tx = await distributor.distributeEqual({
  sender: "GAAA...",
  token: "CAAA...",
  total_amount: 1000000000n,
  recipients: ["GA...", "GB...", "GC...", "GD...", "GE..."],
});

// Or use weighted distribution for payroll
const weightedTx = await distributor.distributeWeighted({
  sender: "GAAA...",
  token: "CAAA...",
  recipients: ["G_DEV_1...", "G_DEV_2..."],
  amounts: [600000000n, 400000000n],
});
```

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

const result = await waitForTransaction(
  tx,
  "https://soroban-testnet.stellar.org"
);
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
  (xdr) => wallet.signTransaction(xdr)
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

Here's a complete example of creating a payment stream and waiting for confirmation:

```typescript
import { PaymentStreamClient, signAndWait } from "@fundable/sdk";

const client = new PaymentStreamClient({
  contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
  networkPassphrase: "Test SDF Network ; September 2015",
  rpcUrl: "https://soroban-testnet.stellar.org",
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
    (xdr) => wallet.signTransaction(xdr)
  );

  console.log(`Stream created with ID: ${result.result}`);
  console.log(`Confirmed on ledger: ${result.ledger}`);
}

createAndConfirmStream();
```
