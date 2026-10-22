# Quadratic Funding Soroban Contract

Soroban smart contract for managing quadratic funding rounds on Stellar.

## Features

- Create and manage funding rounds with matching pools
- Quadratic formula implementation: `(sum(sqrt(c_i)))^2`
- Anti-Sybil protection hooks
- Real-time match estimation
- Automated payout distribution

## Build

```bash
cargo build --release --target wasm32-unknown-unknown
```

## Test

```bash
cargo test
```

## Deploy

```bash
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/quadratic_funding.wasm \
  --source <your-secret-key> \
  --rpc-url https://soroban-testnet.stellar.org:443 \
  --network-passphrase "Test SDF Network ; September 2015"
```

## Usage

### Initialize

```bash
soroban contract invoke \
  --id <contract-id> \
  --source <admin-key> \
  --rpc-url <rpc-url> \
  --network-passphrase <passphrase> \
  -- initialize \
  --admin <admin-address>
```

### Create Round

```bash
soroban contract invoke \
  --id <contract-id> \
  --source <admin-key> \
  -- create_round \
  --token <token-address> \
  --matching_pool 1000000000 \
  --start_time 1234567890 \
  --end_time 1234654290 \
  --min_contribution 1000000
```

## Contract Interface

See `src/lib.rs` for full contract interface and documentation.
