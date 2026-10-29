#!/usr/bin/env bash
set -e

# load contracts
CONTRACTS=(
  payment_stream
  distributor
)

source .env

DEPLOYMENTS_FILE="deployments/${NETWORK}.json"
NETWORK_PARAPHRASE=${TESTNET_NETWORK_PASSPHRASE}

for CONTRACT in "${CONTRACTS[@]}"; do
  CONTRACT_ID=$(jq -r ".${CONTRACT}" "$DEPLOYMENTS_FILE")

if [ "$CONTRACT_ID" == "null" ]; then
  echo "Contract not deployed on $NETWORK"
  exit 1
fi

echo "Initializing contract $CONTRACT_ID..."

stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network "$NETWORK" \
  --source "$STELLAR_SECRET_KEY" \
  --network-passphrase "$NETWORK_PARAPHRASE"\
  -- \
  initialize \
  --admin "$STELLAR_SECRET_KEY"
  done

echo "All Contracts initialized"


# make it executable using
# chmod +x scripts/initialize.sh
