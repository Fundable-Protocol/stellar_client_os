# Fundable Stellar

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
│   └── Cargo.toml           # Rust workspace config
│
├── docs/                      # Project documentation
│   ├── architecture.md
│   ├── getting-started.md     # Project setup documentation
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
- **Multi-Asset Support** - USDC, XLM, and other Stellar assets
- **Offramp Integration** - Convert crypto to fiat currencies

## 🛠️ Tech Stack

| Component | Technology |
|-----------|------------|
| **Frontend** | Next.js 16, React 19, TypeScript, Tailwind CSS v4 |
| **Contracts** | Soroban SDK, Rust |
| **SDK** | TypeScript, @stellar/stellar-sdk |

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
