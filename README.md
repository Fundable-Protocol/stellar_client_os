# Fundable Stellar

## 🚀 Quickstart (5 Minutes)

Get the Fundable Stellar client running on the Stellar testnet in about five minutes.

### Prerequisites

- [Node.js](https://nodejs.org) v18+
- [pnpm](https://pnpm.io) v8+ (`npm install -g pnpm`)
- [Rust](https://rustup.rs) (for building the Soroban contracts)
- [Soroban CLI / stellar-cli](https://soroban.stellar.org/docs/getting-started/setup) v25.0.0+

  ```bash
  cargo install --locked stellar-cli@25.0.0
  ```

### 1. Clone the repository

```bash
git clone https://github.com/Fundable-Protocol/stellar_client_os.git
cd stellar_client_os
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Fund a Stellar testnet account

Create a testnet identity and fund it with test XLM using Friendbot:

```bash
stellar keys generate my-account --network testnet --fund
```

This creates a keypair and funds it instantly on the SDF testnet. Copy the generated secret key into your environment:

```bash
cp .env.example .env
# Set STELLAR_SECRET_KEY in .env to the secret printed above
```

### 4. Build the smart contracts

```bash
pnpm build:contracts
# or, using cargo directly:
# cd contracts && cargo build --release
```

### 5. Run the frontend

```bash
pnpm dev
```

The web app starts at http://localhost:3000. Connect a wallet (e.g. Freighter) to interact with the contracts on testnet.

> Need more detail? See [docs/getting-started.md](docs/getting-started.md) and [scripts/README.md](scripts/README.md).

Stellar client and smart contracts for the Fundable Protocol – a decentralized payment platform enabling seamless Web3 payments, streaming, and subscriptions on the Stellar blockchain.

## 🏗️ Project Structure

```
stellar_client/
├── apps/
│   └── web/                 # Next.js frontend application
│       ├── src/
│       ├── package.json
│       └── ...
│
├── contracts/               # Soroban smart contracts (Rust)
│   ├── payment-stream/      # Payment streaming contract
│   ├── distributor/         # Token distribution contract
│   ├── campaign/            # Campaign fundraising contract
│   └── Cargo.toml           # Rust workspace config
│
├── docs/                      # Project documentation
│   ├── architecture.md
│   ├── getting-started.md     # Project setup documentation
│   ├── webhooks.md            # Webhook system documentation
│   ├── contracts/             # Contracts documentation
│   │   ├── distributor.md
│   │   └── payment-stream.md
│   └── frontend/              # Frontend documentation
│       └── components.md
├── packages/                  # Monorepo packages
│   └── sdk/                   # TypeScript SDK for contract interaction
│
└── package.json             # Root workspace config


```

## 🌟 Features

- **Payment Streaming** - Create and manage continuous token streams
- **Token Distribution** - Efficiently distribute tokens to multiple recipients
- **Campaign Funding** - Launch and manage on-chain fundraising campaigns with milestones
- **Multi-Asset Support** - USDC, XLM, and other Stellar assets
- **Offramp Integration** - Convert crypto to fiat currencies

## 🛠️ Tech Stack

| Component | Technology |
|-----------|------------|
| **Frontend** | Next.js 16, React 19, TypeScript, Tailwind CSS v4 |
| **Contracts** | Soroban SDK, Rust |
| **SDK** | TypeScript, @stellar/stellar-sdk |

## 📐 Campaign Contract Architecture

The `contracts/campaign` Soroban contract powers on-chain fundraising campaigns.

### State Machine

Campaigns progress through `Draft -> Active -> Paused -> Successful/Failed -> PaidOut/Refunded`.

- `Draft` – creator configures campaign and milestone payout schedule.
- `Active` – contributions are accepted.
- `Paused` – emergency stop; contributions suspended but state preserved.
- `Successful` – all milestones verified and claimed by the creator.
- `Failed` – end time reached without meeting the funding goal or cancelled by admin.
- `PaidOut` – final milestone released and campaign fully settled.
- `Refunded` – backers can claim proportional refunds after failure.

Transitions are enforced by the contract and only the `admin` or `campaign_owner` may invoke restricted actions.

### Security Model

- **Admin guard**: privileged operations use an `admin` address set at deployment.
- **Capability checks**: every state transition validates caller and current state.
- **Reentrancy protection**: external calls to token contracts happen after internal state updates.
- **Overflow-safe math**: checked arithmetic from the Soroban SDK prevents balance errors.
- **Escrow accounting**: contributions are held in contract balance and only released by explicit `payout` or `refund` functions.
- **Milestone approvals**: fund release requires multi-sig/approval from designated reviewers before owner can claim.

### Scalability

- Campaigns are stored as persistent map entries keyed by `u32` campaign id, avoiding unbounded collections.
- Contributions are aggregated rather than stored as individual ledger entries.
- Payouts batch milestone claims to minimize transaction count.
- The contract is stateless with respect to off-chain indexers; event log entries enable efficient data replication.
- Deployment uses a single contract with per-campaign storage, allowing the same contract ID to serve many campaigns without migrations.

## 🚀 Getting Started

### Prerequisites

- Node.js v18+
- pnpm v8+
- Rust (for contracts)
- [Soroban CLI](https://soroban.stellar.org/docs/getting-started/setup)

### Installation

```bash
# Clone the repository
git clone git@github.com:Fundable-Protocol/stellar_client.git
cd stellar_client

# Install frontend dependencies
pnpm install

# Build contracts
cd contracts && cargo build --release
```

### Development

```bash
# Start the web app
pnpm dev

# Build contracts
pnpm build:contracts

# Run contract tests
pnpm test:contracts
```

## 💡 Usage Examples

### 🌌 Horizon Client (Classic Stellar)

The Horizon client is used for interacting with the classic Stellar network, such as fetching account details, balances, and transaction history.

```typescript
import { Horizon } from '@stellar/stellar-sdk';

const server = new Horizon.Server('https://horizon-testnet.stellar.org');

// Fetch account details and balances
async function checkAccount(address: string) {
  try {
    const account = await server.loadAccount(address);
    console.log(`Account ID: ${account.id}`);
    
    account.balances.forEach(balance => {
      console.log(`Type: ${balance.asset_type}, Balance: ${balance.balance}`);
    });
  } catch (error) {
    console.error('Error loading account:', error);
  }
}

checkAccount('GBBB...');
```

### ⚡ Soroban Client (Smart Contracts)

Use the `@fundable/sdk` to interact with Fundable smart contracts on the Soroban network. This example shows how to initialize the `PaymentStreamClient` and create a new payment stream.

```typescript
import { PaymentStreamClient, signAndWait } from '@fundable/sdk';

const client = new PaymentStreamClient({
  contractId: 'C...', // Deployed contract ID
  networkPassphrase: 'Test SDF Network ; September 2015',
  rpcUrl: 'https://soroban-testnet.stellar.org',
});

async function createNewStream() {
  // 1. Prepare the stream creation transaction
  const tx = await client.createStream({
    sender: 'GAAA...',
    recipient: 'GBBB...',
    token: 'CDDD...', // Token contract address
    total_amount: 1000000000n, // 100 tokens (assuming 7 decimals)
    initial_amount: 0n,
    start_time: BigInt(Math.floor(Date.now() / 1000)),
    end_time: BigInt(Math.floor(Date.now() / 1000) + 86400 * 30), // 30 days duration
  });

  // 2. Sign, send, and wait for confirmation
  const result = await signAndWait(
    tx,
    'https://soroban-testnet.stellar.org',
    async (xdr) => {
      // Logic to sign XDR with wallet (e.g., Freighter)
      // return wallet.signTransaction(xdr);
      return 'signed_xdr_here';
    }
  );

  console.log(`Stream created successfully! Hash: ${result.hash}`);
  console.log(`Stream ID: ${result.result}`);
}
```

### 🔐 S3 Presigned Uploads (Milestone Proof Photos)

`POST /api/presign-upload` generates a short-lived AWS S3 pre-signed PUT URL so clients can upload milestone proof photos directly to a **private** evidence bucket without exposing credentials. Signing uses AWS Signature V4 and is implemented dependency-free in `apps/web/src/lib/s3`.

Request:

```bash
curl -X POST http://localhost:3000/api/presign-upload \
  -H "Content-Type: application/json" \
  -d '{"campaignId":"42","milestoneId":"1","contentType":"image/jpeg"}'
```

Response (`200`):

```json
{
  "url": "https://fundable-evidence.s3.us-east-1.amazonaws.com/evidence/42/1/<uuid>.jpg?X-Amz-Algorithm=...&X-Amz-Signature=...",
  "key": "evidence/42/1/<uuid>.jpg",
  "contentType": "image/jpeg",
  "expiresAt": 1712000000,
  "requestId": "..."
}
```

Then `PUT` the file bytes to `url` with `Content-Type: image/jpeg`. URLs expire after `S3_PRESIGN_EXPIRES_SECONDS` (default `300`).

Allowed content types: `image/jpeg`, `image/png`, `image/webp`, `image/heic`, `application/pdf`.

Required environment variables (see `.env.example`): `AWS_REGION`, `AWS_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`; optional `AWS_SESSION_TOKEN` (temporary STS credentials) and `S3_PRESIGN_EXPIRES_SECONDS` (60–900). The IAM user needs only `s3:PutObject` on the evidence bucket.

## 📦 Packages

### `apps/web`
Next.js frontend application for interacting with Fundable on Stellar.

### `contracts/payment-stream`
Soroban contract for creating and managing payment streams with:
- Stream creation with linear vesting
- Withdraw, pause, resume, cancel functionality
- Multi-token support

### `contracts/distributor`
Soroban contract for token distributions:
- Equal distribution across recipients
- Weighted distribution with custom amounts

### `contracts/campaign`
Soroban contract for on-chain fundraising campaigns:
- Campaign creation with funding goals and expiration
- Milestone-based payout approvals
- Emergency pause and refund flows
- Multi-token contribution support

### `packages/sdk`
TypeScript SDK for interacting with the deployed contracts.

## 🔗 Related Repositories

- [fundable](https://github.com/Fundable-Protocol/fundable) - Starknet smart contracts
- [evm_client](https://github.com/Fundable-Protocol/evm_client) - EVM client
- [backend-main](https://github.com/Fundable-Protocol/backend-main) - Backend API

## Workflow badges
- ![Contracts CI](https://github.com/Fundable-Protocol/stellar_client/actions/workflows/contracts.yml/badge.svg)

- ![Frontend CI](https://github.com/Fundable-Protocol/stellar_client/actions/workflows/frontend.yml/badge.svg)

- ![Testnet Deploy](https://github.com/Fundable-Protocol/stellar_client/actions/workflows/deploy-testnet.yml/badge.svg)


## 📄 License

MIT License - see [LICENSE](LICENSE) for details.
