#!/usr/bin/env bash
set -e

#load contracts
CONTRACTS=(
  payment_stream
  distributor
)

# Load env vars
source .env

DEPLOYMENTS_FILE="deployments/${NETWORK}.json"
NETWORK_PARAPHRASE=${TESTNET_NETWORK_PASSPHRASE}

echo "Deploying contract to $NETWORK..."

# Ensure deployments file exists
mkdir -p deployments
if [ ! -s "$DEPLOYMENTS_FILE" ]; then
  echo "{}" > "$DEPLOYMENTS_FILE"
fi

# Build contract
echo "🔧 Building contract..."
cd contracts
cargo build --release --target wasm32-unknown-unknown
cd ..

# Install Stellar CLI
cargo install --locked stellar-cli@25.0.0

# Deploy contract
for CONTRACT in "${CONTRACTS[@]}"; do
  WASM_PATH="contracts/target/wasm32-unknown-unknown/release/${CONTRACT}.wasm"

CONTRACT_ID=$(stellar contract deploy \
  --wasm "$WASM_PATH" \
  --source "$STELLAR_SECRET_KEY" \
  --network "$NETWORK" \
  --network-passphrase "$NETWORK_PARAPHRASE")
  

echo "Deployed contract ID: $CONTRACT_ID"

# Get deployer address
DEPLOYER_ADDRESS=$(stellar keys address "$STELLAR_SECRET_KEY" 2>/dev/null || echo "unknown")

echo "Deployer address is: $DEPLOYER_ADDRESS"

# Save deployment address
jq --arg name "$CONTRACT" --arg id "$CONTRACT_ID" \
  '. + {($name): $id}' \
  "$DEPLOYMENTS_FILE" > tmp.json && mv tmp.json "$DEPLOYMENTS_FILE"

done

echo "Saved deployment to $DEPLOYMENTS_FILE"


# make the script executable using
# chmod +x scripts/deploy.sh