/**
 * Integration test helpers.
 *
 * Provides utilities for:
 *  - Resolving local-node connection config from environment variables
 *  - Funding test accounts via the local friendbot endpoint
 *  - Deploying contract WASM files to the local node
 *  - Building a minimal native-asset token contract for use in tests
 *
 * Prerequisites (must be running before the test suite starts):
 *   stellar network start local
 *   # or: docker run --rm -p 8000:8000 stellar/quickstart:latest --local
 *
 * The suite will skip gracefully if the local node is unreachable.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {
  Keypair,
  Networks,
  SorobanRpc,
  TransactionBuilder,
  Operation,
  Asset,
  BASE_FEE,
} from '@stellar/stellar-sdk';

// ---------------------------------------------------------------------------
// Config resolution
// ---------------------------------------------------------------------------

export const LOCAL_RPC_URL =
  process.env.SOROBAN_RPC_URL ?? 'http://localhost:8000/soroban/rpc';

export const LOCAL_NETWORK_PASSPHRASE =
  process.env.SOROBAN_NETWORK_PASSPHRASE ??
  'Standalone Network ; February 2017';

export const PAYMENT_STREAM_WASM_PATH =
  process.env.PAYMENT_STREAM_WASM_PATH ??
  path.resolve(
    __dirname,
    '../../../../contracts/target/wasm32-unknown-unknown/release/payment_stream.wasm',
  );

export const DISTRIBUTOR_WASM_PATH =
  process.env.DISTRIBUTOR_WASM_PATH ??
  path.resolve(
    __dirname,
    '../../../../contracts/target/wasm32-unknown-unknown/release/distributor.wasm',
  );

// ---------------------------------------------------------------------------
// Node reachability check
// ---------------------------------------------------------------------------

/**
 * Returns true when the local Soroban RPC node is reachable.
 * Used to skip tests gracefully when the node is not running.
 */
export async function isLocalNodeReachable(): Promise<boolean> {
  try {
    const server = new SorobanRpc.Server(LOCAL_RPC_URL, { allowHttp: true });
    await server.getNetwork();
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Account helpers
// ---------------------------------------------------------------------------

/**
 * Fund an account via the local friendbot endpoint.
 * The local quickstart image exposes friendbot at http://localhost:8000/friendbot.
 */
export async function fundAccount(publicKey: string): Promise<void> {
  const friendbotBase = LOCAL_RPC_URL.replace('/soroban/rpc', '');
  const url = `${friendbotBase}/friendbot?addr=${publicKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Friendbot failed for ${publicKey}: ${res.status} ${await res.text()}`,
    );
  }
}

/**
 * Generate a fresh funded Keypair on the local network.
 */
export async function generateFundedKeypair(): Promise<Keypair> {
  const kp = Keypair.random();
  await fundAccount(kp.publicKey());
  return kp;
}

// ---------------------------------------------------------------------------
// Contract deployment helpers
// ---------------------------------------------------------------------------

/**
 * Deploy a WASM contract using stellar-cli.
 * Returns the contract ID (C...) of the deployed instance.
 *
 * Requires `stellar` CLI to be installed and on PATH.
 */
export function deployContractViaCli(options: {
  wasmPath: string;
  sourceKeypair: Keypair;
  rpcUrl?: string;
  networkPassphrase?: string;
}): string {
  const {
    wasmPath,
    sourceKeypair,
    rpcUrl = LOCAL_RPC_URL,
    networkPassphrase = LOCAL_NETWORK_PASSPHRASE,
  } = options;

  if (!fs.existsSync(wasmPath)) {
    throw new Error(
      `WASM file not found at ${wasmPath}. ` +
        `Run 'cargo build --target wasm32-unknown-unknown --release' inside the contracts/ directory first.`,
    );
  }

  const secretKey = sourceKeypair.secret();

  const output = execSync(
    `stellar contract deploy` +
      ` --wasm "${wasmPath}"` +
      ` --source "${secretKey}"` +
      ` --rpc-url "${rpcUrl}"` +
      ` --network-passphrase "${networkPassphrase}"`,
    { encoding: 'utf8' },
  ).trim();

  // stellar-cli prints the contract ID on the last line
  const contractId = output.split('\n').pop()?.trim() ?? '';
  if (!contractId.startsWith('C')) {
    throw new Error(`Unexpected deploy output: ${output}`);
  }
  return contractId;
}

// ---------------------------------------------------------------------------
// SAC (Stellar Asset Contract) helper
// ---------------------------------------------------------------------------

/**
 * Deploy a Stellar Asset Contract for a custom asset so tests have a real
 * token to work with on the local network.
 *
 * Returns the contract ID of the deployed SAC.
 */
export function deployStellarAssetContract(options: {
  issuerKeypair: Keypair;
  assetCode: string;
  rpcUrl?: string;
  networkPassphrase?: string;
}): string {
  const {
    issuerKeypair,
    assetCode,
    rpcUrl = LOCAL_RPC_URL,
    networkPassphrase = LOCAL_NETWORK_PASSPHRASE,
  } = options;

  const output = execSync(
    `stellar contract asset deploy` +
      ` --asset "${assetCode}:${issuerKeypair.publicKey()}"` +
      ` --source "${issuerKeypair.secret()}"` +
      ` --rpc-url "${rpcUrl}"` +
      ` --network-passphrase "${networkPassphrase}"`,
    { encoding: 'utf8' },
  ).trim();

  const contractId = output.split('\n').pop()?.trim() ?? '';
  if (!contractId.startsWith('C')) {
    throw new Error(`Unexpected SAC deploy output: ${output}`);
  }
  return contractId;
}

// ---------------------------------------------------------------------------
// Transaction signing helper
// ---------------------------------------------------------------------------

/**
 * Returns a signTransaction callback compatible with AssembledTransaction
 * that signs with the provided Keypair.
 */
export function keypairSigner(kp: Keypair) {
  return async (xdr: string): Promise<string> => {
    const tx = TransactionBuilder.fromXDR(xdr, LOCAL_NETWORK_PASSPHRASE);
    tx.sign(kp);
    return tx.toXDR();
  };
}
