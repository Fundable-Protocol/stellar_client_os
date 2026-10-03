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
 *
 * Environment variables (optional — sensible defaults apply):
 *   SOROBAN_RPC_URL            – defaults to http://localhost:8000/soroban/rpc
 *   SOROBAN_NETWORK_PASSPHRASE – defaults to the standalone passphrase
 *   DISTRIBUTOR_WASM_PATH      – path to the compiled distributor .wasm
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  isLocalNodeReachable,
  generateFundedKeypair,
  deployContractViaCli,
  deployStellarAssetContract,
  mintTokens,
  keypairSigner,
  LOCAL_RPC_URL,
  LOCAL_NETWORK_PASSPHRASE,
  DISTRIBUTOR_WASM_PATH,
} from './setup.js';
import { DistributorClient } from '../DistributorClient.js';
import { Keypair } from '@stellar/stellar-sdk';

// ---------------------------------------------------------------------------
// Suite-level state — shared across all describe blocks
// ---------------------------------------------------------------------------

let adminKp:      Keypair;
let senderKp:     Keypair;
let recipientAKp: Keypair;
let recipientBKp: Keypair;
let recipientCKp: Keypair;
let nonAdminKp:   Keypair;

let contractId:      string;
let tokenContractId: string;

let client: DistributorClient;

/** True once beforeAll has confirmed the node is up and state is ready. */
let suiteReady = false;

// ---------------------------------------------------------------------------
// Suite setup
// ---------------------------------------------------------------------------

beforeAll(async () => {
  const reachable = await isLocalNodeReachable();
  if (!reachable) {
    console.warn(
      '\n⚠️  Local Soroban node not reachable at ' + LOCAL_RPC_URL + '.\n' +
      '   Skipping DistributorClient integration tests.\n' +
      '   Start a local node with:  stellar network start local\n',
    );
    return;
  }

  // Fund all test accounts in parallel
  [adminKp, senderKp, recipientAKp, recipientBKp, recipientCKp, nonAdminKp] =
    await Promise.all([
      generateFundedKeypair(),
      generateFundedKeypair(),
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

  // Deploy a SAC token and mint supply to the sender account
  tokenContractId = deployStellarAssetContract({
    issuerKeypair: adminKp,
    assetCode: 'DIST',
  });

  await mintTokens({
    tokenContractId,
    issuerKeypair: adminKp,
    recipientAddress: senderKp.publicKey(),
    amount: 100_000_000n, // 100 tokens (7-decimal precision)
  });

  // Build the high-level client pointing at the deployed contract
  client = new DistributorClient({
    contractId,
    networkPassphrase: LOCAL_NETWORK_PASSPHRASE,
    rpcUrl: LOCAL_RPC_URL,
    publicKey: adminKp.publicKey(),
  });

  // Initialize the contract with zero protocol fee so distributions are clean
  const initTx = await client.initialize({
    admin:                adminKp.publicKey(),
    protocol_fee_percent: 0,
    fee_address:          adminKp.publicKey(),
  });
  await initTx.signAndSend({ signTransaction: keypairSigner(adminKp) });

  suiteReady = true;
}, 120_000);

// ---------------------------------------------------------------------------
// Helper — skip when local node is unavailable
// ---------------------------------------------------------------------------

function skipIfUnavailable(): boolean {
  if (!suiteReady) {
    console.warn('  ↩  Skipping – local Soroban node unavailable.');
    return true;
  }
  return false;
}

// ===========================================================================
// Tests
// ===========================================================================

describe('DistributorClient (integration)', () => {

  // ── initialize ─────────────────────────────────────────────────────────────
  describe('initialize', () => {
    it('sets the admin address correctly after initialization', async () => {
      if (skipIfUnavailable()) return;

      const tx = await client.getAdmin();
      expect(tx.result).toBe(adminKp.publicKey());
    });

    it('getTotalDistributions returns 0 on a fresh contract', async () => {
      if (skipIfUnavailable()) return;

      const tx = await client.getTotalDistributions();
      expect(tx.result).toBe(0n);
    });

    it('getTotalDistributedAmount returns 0 on a fresh contract', async () => {
      if (skipIfUnavailable()) return;

      const tx = await client.getTotalDistributedAmount();
      expect(tx.result).toBe(0n);
    });
  });

  // ── getUserStats / getTokenStats — before any distributions ────────────────
  describe('stats before any distributions', () => {
    it('getUserStats returns undefined for an address with no activity', async () => {
      if (skipIfUnavailable()) return;

      const tx = await client.getUserStats(nonAdminKp.publicKey());
      expect(tx.result).toBeUndefined();
    });

    it('getTokenStats returns undefined for a token not yet used', async () => {
      if (skipIfUnavailable()) return;

      const tx = await client.getTokenStats(tokenContractId);
      expect(tx.result).toBeUndefined();
    });
  });

  // ── distributeEqual ─────────────────────────────────────────────────────────
  describe('distributeEqual', () => {
    it('distributes tokens equally and increments total distributions', async () => {
      if (skipIfUnavailable()) return;

      const before = (await client.getTotalDistributions()).result;

      const tx = await client.distributeEqual({
        sender:       senderKp.publicKey(),
        token:        tokenContractId,
        total_amount: 2_000_000n,
        recipients:   [recipientAKp.publicKey(), recipientBKp.publicKey()],
      });
      await tx.signAndSend({ signTransaction: keypairSigner(senderKp) });

      const after = (await client.getTotalDistributions()).result;
      expect(after).toBe(before + 1n);
    });

    it('increments getTotalDistributedAmount by the distributed amount', async () => {
      if (skipIfUnavailable()) return;

      const before = (await client.getTotalDistributedAmount()).result;

      const tx = await client.distributeEqual({
        sender:       senderKp.publicKey(),
        token:        tokenContractId,
        total_amount: 1_000_000n,
        recipients:   [recipientAKp.publicKey()],
      });
      await tx.signAndSend({ signTransaction: keypairSigner(senderKp) });

      const after = (await client.getTotalDistributedAmount()).result;
      expect(after).toBe(before + 1_000_000n);
    });

    it('updates user stats for the sender after distribution', async () => {
      if (skipIfUnavailable()) return;

      // Perform a distribution to ensure stats exist
      const tx = await client.distributeEqual({
        sender:       senderKp.publicKey(),
        token:        tokenContractId,
        total_amount: 500_000n,
        recipients:   [recipientAKp.publicKey(), recipientBKp.publicKey()],
      });
      await tx.signAndSend({ signTransaction: keypairSigner(senderKp) });

      const statsTx = await client.getUserStats(senderKp.publicKey());
      const stats = statsTx.result;

      expect(stats).toBeDefined();
      expect(stats!.distributions_initiated).toBeGreaterThanOrEqual(1);
      expect(stats!.total_amount).toBeGreaterThan(0n);
    });

    it('updates token stats for the distributed token', async () => {
      if (skipIfUnavailable()) return;

      const tx = await client.distributeEqual({
        sender:       senderKp.publicKey(),
        token:        tokenContractId,
        total_amount: 500_000n,
        recipients:   [recipientAKp.publicKey(), recipientBKp.publicKey()],
      });
      await tx.signAndSend({ signTransaction: keypairSigner(senderKp) });

      const statsTx = await client.getTokenStats(tokenContractId);
      const stats = statsTx.result;

      expect(stats).toBeDefined();
      expect(stats!.distribution_count).toBeGreaterThanOrEqual(1);
      expect(stats!.total_amount).toBeGreaterThan(0n);
    });

    it('distributes to a single recipient', async () => {
      if (skipIfUnavailable()) return;

      const before = (await client.getTotalDistributions()).result;

      const tx = await client.distributeEqual({
        sender:       senderKp.publicKey(),
        token:        tokenContractId,
        total_amount: 100_000n,
        recipients:   [recipientAKp.publicKey()],
      });
      await tx.signAndSend({ signTransaction: keypairSigner(senderKp) });

      const after = (await client.getTotalDistributions()).result;
      expect(after).toBe(before + 1n);
    });

    it('distributes to three recipients', async () => {
      if (skipIfUnavailable()) return;

      const before = (await client.getTotalDistributions()).result;

      const tx = await client.distributeEqual({
        sender:       senderKp.publicKey(),
        token:        tokenContractId,
        total_amount: 3_000_000n,
        recipients: [
          recipientAKp.publicKey(),
          recipientBKp.publicKey(),
          recipientCKp.publicKey(),
        ],
      });
      await tx.signAndSend({ signTransaction: keypairSigner(senderKp) });

      const after = (await client.getTotalDistributions()).result;
      expect(after).toBe(before + 1n);
    });
  });

  // ── distributeWeighted ──────────────────────────────────────────────────────
  describe('distributeWeighted', () => {
    it('distributes with custom amounts and increments total distributions', async () => {
      if (skipIfUnavailable()) return;

      const before = (await client.getTotalDistributions()).result;

      const tx = await client.distributeWeighted({
        sender:     senderKp.publicKey(),
        token:      tokenContractId,
        recipients: [recipientAKp.publicKey(), recipientBKp.publicKey()],
        amounts:    [300_000n, 700_000n],
      });
      await tx.signAndSend({ signTransaction: keypairSigner(senderKp) });

      const after = (await client.getTotalDistributions()).result;
      expect(after).toBe(before + 1n);
    });

    it('increments getTotalDistributedAmount by the sum of weighted amounts', async () => {
      if (skipIfUnavailable()) return;

      const before = (await client.getTotalDistributedAmount()).result;
      const expectedIncrease = 400_000n + 600_000n;

      const tx = await client.distributeWeighted({
        sender:     senderKp.publicKey(),
        token:      tokenContractId,
        recipients: [recipientAKp.publicKey(), recipientBKp.publicKey()],
        amounts:    [400_000n, 600_000n],
      });
      await tx.signAndSend({ signTransaction: keypairSigner(senderKp) });

      const after = (await client.getTotalDistributedAmount()).result;
      expect(after).toBe(before + expectedIncrease);
    });

    it('supports highly skewed distributions (99/1 split)', async () => {
      if (skipIfUnavailable()) return;

      const before = (await client.getTotalDistributions()).result;

      const tx = await client.distributeWeighted({
        sender:     senderKp.publicKey(),
        token:      tokenContractId,
        recipients: [recipientAKp.publicKey(), recipientBKp.publicKey()],
        amounts:    [990_000n, 10_000n],
      });
      await tx.signAndSend({ signTransaction: keypairSigner(senderKp) });

      const after = (await client.getTotalDistributions()).result;
      expect(after).toBe(before + 1n);
    });
  });

  // ── getDistributionHistory ──────────────────────────────────────────────────
  describe('getDistributionHistory', () => {
    it('returns a non-empty array after distributions', async () => {
      if (skipIfUnavailable()) return;

      const tx = await client.getDistributionHistory(0n, 10n);
      const history = tx.result;

      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBeGreaterThan(0);
    });

    it('history entries have the expected shape', async () => {
      if (skipIfUnavailable()) return;

      const tx = await client.getDistributionHistory(0n, 1n);
      const entry = tx.result[0];

      expect(entry).toHaveProperty('sender');
      expect(entry).toHaveProperty('token');
      expect(entry).toHaveProperty('amount');
      expect(entry).toHaveProperty('recipients_count');
      expect(entry).toHaveProperty('timestamp');
      expect(typeof entry.amount).toBe('bigint');
      expect(typeof entry.timestamp).toBe('bigint');
    });

    it('limit=1 returns at most one entry', async () => {
      if (skipIfUnavailable()) return;

      const tx = await client.getDistributionHistory(0n, 1n);
      expect(tx.result.length).toBeLessThanOrEqual(1);
    });

    it('pagination advances correctly with startId', async () => {
      if (skipIfUnavailable()) return;

      const page1 = await client.getDistributionHistory(0n, 2n);
      const page2 = await client.getDistributionHistory(2n, 2n);

      // Pages must not overlap (IDs are monotonically increasing)
      if (page1.result.length > 0 && page2.result.length > 0) {
        const ids1 = page1.result.map((e) => e.timestamp);
        const ids2 = page2.result.map((e) => e.timestamp);
        const overlap = ids1.some((t) => ids2.includes(t));
        expect(overlap).toBe(false);
      }
    });

    it('accepts object-style overload { startId, limit }', async () => {
      if (skipIfUnavailable()) return;

      const tx = await client.getDistributionHistory({ startId: 0n, limit: 5n });
      expect(Array.isArray(tx.result)).toBe(true);
    });
  });

  // ── setProtocolFee ──────────────────────────────────────────────────────────
  describe('setProtocolFee', () => {
    it('allows admin to set a new protocol fee', async () => {
      if (skipIfUnavailable()) return;

      const tx = await client.setProtocolFee(adminKp.publicKey(), 2);
      await expect(
        tx.signAndSend({ signTransaction: keypairSigner(adminKp) }),
      ).resolves.not.toThrow();

      // Reset to 0 so subsequent tests are unaffected
      const resetTx = await client.setProtocolFee(adminKp.publicKey(), 0);
      await resetTx.signAndSend({ signTransaction: keypairSigner(adminKp) });
    });

    it('accepts object-style overload { admin, newFeePercent }', async () => {
      if (skipIfUnavailable()) return;

      const tx = await client.setProtocolFee({
        admin:         adminKp.publicKey(),
        newFeePercent: 1,
      });
      await tx.signAndSend({ signTransaction: keypairSigner(adminKp) });

      // Reset
      const reset = await client.setProtocolFee({ admin: adminKp.publicKey(), newFeePercent: 0 });
      await reset.signAndSend({ signTransaction: keypairSigner(adminKp) });
    });

    it('rejects when a non-admin attempts to set the fee', async () => {
      if (skipIfUnavailable()) return;

      // Build a non-admin client
      const nonAdminClient = new DistributorClient({
        contractId,
        networkPassphrase: LOCAL_NETWORK_PASSPHRASE,
        rpcUrl: LOCAL_RPC_URL,
        publicKey: nonAdminKp.publicKey(),
      });

      const tx = await nonAdminClient.setProtocolFee(nonAdminKp.publicKey(), 5);
      await expect(
        tx.signAndSend({ signTransaction: keypairSigner(nonAdminKp) }),
      ).rejects.toThrow();
    });
  });

  // ── getAdmin ────────────────────────────────────────────────────────────────
  describe('getAdmin', () => {
    it('returns the admin address', async () => {
      if (skipIfUnavailable()) return;

      const tx = await client.getAdmin();
      expect(tx.result).toBe(adminKp.publicKey());
    });
  });

  // ── getUserStats ────────────────────────────────────────────────────────────
  describe('getUserStats', () => {
    it('returns undefined for an address that has never sent', async () => {
      if (skipIfUnavailable()) return;

      // Generate a fresh account that has never distributed
      const freshKp = await generateFundedKeypair();
      const tx = await client.getUserStats(freshKp.publicKey());
      expect(tx.result).toBeUndefined();
    });

    it('distributions_initiated is a positive integer for an active sender', async () => {
      if (skipIfUnavailable()) return;

      const tx = await client.getUserStats(senderKp.publicKey());
      expect(tx.result).toBeDefined();
      expect(tx.result!.distributions_initiated).toBeGreaterThan(0);
    });

    it('total_amount reflects the cumulative sent amount', async () => {
      if (skipIfUnavailable()) return;

      const tx = await client.getUserStats(senderKp.publicKey());
      expect(tx.result).toBeDefined();
      expect(tx.result!.total_amount).toBeGreaterThan(0n);
    });
  });

  // ── getTokenStats ───────────────────────────────────────────────────────────
  describe('getTokenStats', () => {
    it('returns undefined for a token contract that has never been used', async () => {
      if (skipIfUnavailable()) return;

      // Deploy a fresh SAC that has never been distributed through
      const unusedToken = deployStellarAssetContract({
        issuerKeypair: adminKp,
        assetCode: 'UNUSED',
      });

      const tx = await client.getTokenStats(unusedToken);
      expect(tx.result).toBeUndefined();
    });

    it('distribution_count is a positive integer for a used token', async () => {
      if (skipIfUnavailable()) return;

      const tx = await client.getTokenStats(tokenContractId);
      expect(tx.result).toBeDefined();
      expect(tx.result!.distribution_count).toBeGreaterThan(0);
    });

    it('total_amount reflects the cumulative distributed amount', async () => {
      if (skipIfUnavailable()) return;

      const tx = await client.getTokenStats(tokenContractId);
      expect(tx.result).toBeDefined();
      expect(tx.result!.total_amount).toBeGreaterThan(0n);
    });
  });

  // ── re-initialization guard ─────────────────────────────────────────────────
  describe('re-initialization guard', () => {
    it('rejects a second initialize call on an already-initialized contract', async () => {
      if (skipIfUnavailable()) return;

      const tx = await client.initialize({
        admin:                adminKp.publicKey(),
        protocol_fee_percent: 0,
        fee_address:          adminKp.publicKey(),
      });

      await expect(
        tx.signAndSend({ signTransaction: keypairSigner(adminKp) }),
      ).rejects.toThrow();
    });
  });
});
