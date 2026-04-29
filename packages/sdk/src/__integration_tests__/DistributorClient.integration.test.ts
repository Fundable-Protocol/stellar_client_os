/**
 * Integration tests for DistributorClient against a local Soroban node.
 *
 * Prerequisites:
 *   1. A local Soroban node must be running:
 *        stellar network start local
 *      or via Docker:
 *        docker run --rm -p 8000:8000 stellar/quickstart:latest --local
 *
 *   2. Contracts must be compiled:
 *        cd contracts && cargo build --target wasm32-unknown-unknown --release
 *
 *   3. `stellar` CLI must be installed and on PATH.
 *
 * Run with:
 *   pnpm --filter @fundable/sdk test:integration
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  isLocalNodeReachable,
  generateFundedKeypair,
  deployContractViaCli,
  deployStellarAssetContract,
  keypairSigner,
  LOCAL_RPC_URL,
  LOCAL_NETWORK_PASSPHRASE,
  DISTRIBUTOR_WASM_PATH,
} from './setup';
import { DistributorClient } from '../DistributorClient';
import { Keypair } from '@stellar/stellar-sdk';

// ---------------------------------------------------------------------------
// Suite-level state
// ---------------------------------------------------------------------------

let adminKp: Keypair;
let senderKp: Keypair;
let recipientAKp: Keypair;
let recipientBKp: Keypair;
let contractId: string;
let tokenContractId: string;
let client: DistributorClient;

// ---------------------------------------------------------------------------
// Suite setup
// ---------------------------------------------------------------------------

beforeAll(async () => {
  const reachable = await isLocalNodeReachable();
  if (!reachable) {
    console.warn(
      '\n⚠️  Local Soroban node not reachable at ' +
        LOCAL_RPC_URL +
        '. Skipping DistributorClient integration tests.\n' +
        "   Start a local node with: stellar network start local\n",
    );
    return;
  }

  // Fund test accounts
  [adminKp, senderKp, recipientAKp, recipientBKp] = await Promise.all([
    generateFundedKeypair(),
    generateFundedKeypair(),
    generateFundedKeypair(),
    generateFundedKeypair(),
  ]);

  // Deploy the distributor contract
  contractId = deployContractViaCli({
    wasmPath: DISTRIBUTOR_WASM_PATH,
    sourceKeypair: adminKp,
  });

  // Deploy a SAC token for the tests
  tokenContractId = deployStellarAssetContract({
    issuerKeypair: adminKp,
    assetCode: 'TEST',
  });

  // Build the client
  client = new DistributorClient({
    contractId,
    networkPassphrase: LOCAL_NETWORK_PASSPHRASE,
    rpcUrl: LOCAL_RPC_URL,
    publicKey: adminKp.publicKey(),
  });

  // Initialize the contract
  const initTx = await client.initialize({
    admin: adminKp.publicKey(),
    protocol_fee_percent: 0,
    fee_address: adminKp.publicKey(),
  });
  await initTx.signAndSend({ signTransaction: keypairSigner(adminKp) });
});

// ---------------------------------------------------------------------------
// Helper: skip when node is unavailable
// ---------------------------------------------------------------------------

function skipIfUnavailable() {
  if (!client) {
    console.warn('Skipping – local node unavailable.');
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DistributorClient (integration)', () => {
  describe('initialize', () => {
    it('contract is initialized and admin is set', async () => {
      if (skipIfUnavailable()) return;

      const tx = await client.getAdmin();
      expect(tx.result).toBe(adminKp.publicKey());
    });
  });

  describe('getTotalDistributions', () => {
    it('returns 0 before any distributions', async () => {
      if (skipIfUnavailable()) return;

      const tx = await client.getTotalDistributions();
      expect(tx.result).toBe(0n);
    });
  });

  describe('distributeEqual', () => {
    it('distributes tokens equally among recipients', async () => {
      if (skipIfUnavailable()) return;

      const tx = await client.distributeEqual({
        sender: senderKp.publicKey(),
        token: tokenContractId,
        total_amount: 1_000_000n,
        recipients: [recipientAKp.publicKey(), recipientBKp.publicKey()],
      });

      await tx.signAndSend({ signTransaction: keypairSigner(senderKp) });

      // Verify total distributions incremented
      const statsTx = await client.getTotalDistributions();
      expect(statsTx.result).toBeGreaterThanOrEqual(1n);
    });

    it('updates user stats for the sender', async () => {
      if (skipIfUnavailable()) return;

      const tx = await client.getUserStats(senderKp.publicKey());
      const stats = tx.result;

      expect(stats).toBeDefined();
      expect(stats!.distributions_initiated).toBeGreaterThanOrEqual(1);
      expect(stats!.total_amount).toBeGreaterThan(0n);
    });

    it('updates token stats for the distributed token', async () => {
      if (skipIfUnavailable()) return;

      const tx = await client.getTokenStats(tokenContractId);
      const stats = tx.result;

      expect(stats).toBeDefined();
      expect(stats!.distribution_count).toBeGreaterThanOrEqual(1);
      expect(stats!.total_amount).toBeGreaterThan(0n);
    });
  });

  describe('distributeWeighted', () => {
    it('distributes tokens with custom amounts per recipient', async () => {
      if (skipIfUnavailable()) return;

      const beforeTx = await client.getTotalDistributions();
      const before = beforeTx.result;

      const tx = await client.distributeWeighted({
        sender: senderKp.publicKey(),
        token: tokenContractId,
        recipients: [recipientAKp.publicKey(), recipientBKp.publicKey()],
        amounts: [300_000n, 700_000n],
      });

      await tx.signAndSend({ signTransaction: keypairSigner(senderKp) });

      const afterTx = await client.getTotalDistributions();
      expect(afterTx.result).toBe(before + 1n);
    });
  });

  describe('getTotalDistributedAmount', () => {
    it('returns a positive total after distributions', async () => {
      if (skipIfUnavailable()) return;

      const tx = await client.getTotalDistributedAmount();
      expect(tx.result).toBeGreaterThan(0n);
    });
  });

  describe('getDistributionHistory', () => {
    it('returns paginated distribution history', async () => {
      if (skipIfUnavailable()) return;

      const tx = await client.getDistributionHistory(0n, 10n);
      const history = tx.result;

      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBeGreaterThan(0);

      const entry = history[0];
      expect(entry).toHaveProperty('sender');
      expect(entry).toHaveProperty('token');
      expect(entry).toHaveProperty('amount');
      expect(entry).toHaveProperty('recipients_count');
      expect(entry).toHaveProperty('timestamp');
    });
  });

  describe('setProtocolFee', () => {
    it('allows admin to update the protocol fee', async () => {
      if (skipIfUnavailable()) return;

      const tx = await client.setProtocolFee(adminKp.publicKey(), 1);
      await tx.signAndSend({ signTransaction: keypairSigner(adminKp) });

      // No error thrown means success; reset back to 0
      const resetTx = await client.setProtocolFee(adminKp.publicKey(), 0);
      await resetTx.signAndSend({ signTransaction: keypairSigner(adminKp) });
    });
  });
});
