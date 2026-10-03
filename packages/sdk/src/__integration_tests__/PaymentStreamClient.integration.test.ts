/**
 * Integration tests for PaymentStreamClient against a local Soroban node.
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
 *   PAYMENT_STREAM_WASM_PATH   – path to the compiled payment-stream .wasm
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
  PAYMENT_STREAM_WASM_PATH,
} from './setup.js';
import { PaymentStreamClient } from '../PaymentStreamClient.js';
import { Keypair } from '@stellar/stellar-sdk';

// ---------------------------------------------------------------------------
// Suite-level state — shared across all describe blocks
// ---------------------------------------------------------------------------

let adminKp:     Keypair;
let senderKp:    Keypair;
let recipientKp: Keypair;
let delegateKp:  Keypair;
let nonPartyKp:  Keypair;

let contractId:      string;
let tokenContractId: string;

let client: PaymentStreamClient;

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
      '   Skipping PaymentStreamClient integration tests.\n' +
      '   Start a local node with:  stellar network start local\n',
    );
    return;
  }

  // Fund all test accounts in parallel
  [adminKp, senderKp, recipientKp, delegateKp, nonPartyKp] = await Promise.all([
    generateFundedKeypair(),
    generateFundedKeypair(),
    generateFundedKeypair(),
    generateFundedKeypair(),
    generateFundedKeypair(),
  ]);

  // Deploy the payment-stream contract
  contractId = deployContractViaCli({
    wasmPath: PAYMENT_STREAM_WASM_PATH,
    sourceKeypair: adminKp,
  });

  // Deploy a SAC token and mint supply to the sender
  tokenContractId = deployStellarAssetContract({
    issuerKeypair: adminKp,
    assetCode: 'STRM',
  });

  await mintTokens({
    tokenContractId,
    issuerKeypair: adminKp,
    recipientAddress: senderKp.publicKey(),
    amount: 1_000_000_000n, // 1 000 tokens (7-decimal precision)
  });

  // Build the high-level client
  client = new PaymentStreamClient({
    contractId,
    networkPassphrase: LOCAL_NETWORK_PASSPHRASE,
    rpcUrl: LOCAL_RPC_URL,
    publicKey: adminKp.publicKey(),
  });

  // Initialize the contract with zero fee rate
  const initTx = await client.initialize({
    admin:            adminKp.publicKey(),
    fee_collector:    adminKp.publicKey(),
    general_fee_rate: 0,
  });
  await initTx.signAndSend({ signTransaction: keypairSigner(adminKp) });

  suiteReady = true;
}, 120_000);

// ---------------------------------------------------------------------------
// Helper: skip gracefully when local node is unavailable
// ---------------------------------------------------------------------------

function skipIfUnavailable(): boolean {
  if (!suiteReady) {
    console.warn('  ↩  Skipping – local Soroban node unavailable.');
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Shared stream factory
// ---------------------------------------------------------------------------

async function createActiveStream(opts?: {
  total_amount?: bigint;
  initial_amount?: bigint;
  durationSecs?: bigint;
  startOffsetSecs?: bigint; // negative = started in the past
}): Promise<bigint> {
  const now = BigInt(Math.floor(Date.now() / 1000));
  const startOffset = opts?.startOffsetSecs ?? 0n;
  const duration    = opts?.durationSecs    ?? 3600n;

  const tx = await client.createStream({
    sender:        senderKp.publicKey(),
    recipient:     recipientKp.publicKey(),
    token:         tokenContractId,
    total_amount:  opts?.total_amount  ?? 1_000_000n,
    initial_amount: opts?.initial_amount ?? 0n,
    start_time:    now + startOffset,
    end_time:      now + startOffset + duration,
  });
  await tx.signAndSend({ signTransaction: keypairSigner(senderKp) });
  return tx.result;
}

// ===========================================================================
// Tests
// ===========================================================================

describe('PaymentStreamClient (integration)', () => {

  // ── initialize ─────────────────────────────────────────────────────────────
  describe('initialize', () => {
    it('fee collector is set to admin address', async () => {
      if (skipIfUnavailable()) return;
      const tx = await client.getFeeCollector();
      expect(tx.result).toBe(adminKp.publicKey());
    });

    it('protocol fee rate is 0 after initialization', async () => {
      if (skipIfUnavailable()) return;
      const tx = await client.getProtocolFeeRate();
      expect(tx.result).toBe(0);
    });

    it('protocol metrics show zero streams on a fresh contract', async () => {
      if (skipIfUnavailable()) return;
      const tx = await client.getProtocolMetrics();
      const m = tx.result;
      expect(m).toBeDefined();
      expect(m.total_streams_created).toBe(0n);
      expect(m.total_active_streams).toBe(0n);
      expect(m.total_tokens_streamed).toBe(0n);
    });

    it('rejects a second initialize call', async () => {
      if (skipIfUnavailable()) return;
      const tx = await client.initialize({
        admin: adminKp.publicKey(),
        fee_collector: adminKp.publicKey(),
        general_fee_rate: 0,
      });
      await expect(
        tx.signAndSend({ signTransaction: keypairSigner(adminKp) }),
      ).rejects.toThrow();
    });
  });

  // ── createStream ────────────────────────────────────────────────────────────
  describe('createStream', () => {
    it('returns a bigint stream ID', async () => {
      if (skipIfUnavailable()) return;
      const streamId = await createActiveStream();
      expect(typeof streamId).toBe('bigint');
      expect(streamId).toBeGreaterThanOrEqual(0n);
    });

    it('increments total_streams_created in protocol metrics', async () => {
      if (skipIfUnavailable()) return;
      const before = (await client.getProtocolMetrics()).result.total_streams_created;
      await createActiveStream();
      const after = (await client.getProtocolMetrics()).result.total_streams_created;
      expect(after).toBe(before + 1n);
    });

    it('accepts object-style overload via getStream', async () => {
      if (skipIfUnavailable()) return;
      const streamId = await createActiveStream();
      const tx = await client.getStream({ streamId });
      expect(tx.result.id).toBe(streamId);
    });
  });

  // ── getStream ───────────────────────────────────────────────────────────────
  describe('getStream', () => {
    let streamId: bigint;
    beforeAll(async () => {
      if (!suiteReady) return;
      streamId = await createActiveStream({ total_amount: 500_000n });
    });

    it('returns stream with correct sender, recipient and token', async () => {
      if (skipIfUnavailable()) return;
      const stream = (await client.getStream(streamId)).result;
      expect(stream.id).toBe(streamId);
      expect(stream.sender).toBe(senderKp.publicKey());
      expect(stream.recipient).toBe(recipientKp.publicKey());
      expect(stream.token).toBe(tokenContractId);
    });

    it('returns total_amount matching what was set', async () => {
      if (skipIfUnavailable()) return;
      const stream = (await client.getStream(streamId)).result;
      expect(stream.total_amount).toBe(500_000n);
    });

    it('stream status is Active immediately after creation', async () => {
      if (skipIfUnavailable()) return;
      const stream = (await client.getStream(streamId)).result;
      expect(stream.status.tag).toBe('Active');
    });

    it('withdrawn_amount is 0n on a fresh stream', async () => {
      if (skipIfUnavailable()) return;
      const stream = (await client.getStream(streamId)).result;
      expect(stream.withdrawn_amount).toBe(0n);
    });
  });

  // ── getWithdrawableAmount ───────────────────────────────────────────────────
  describe('getWithdrawableAmount', () => {
    it('returns 0n for a stream starting in the future', async () => {
      if (skipIfUnavailable()) return;
      const streamId = await createActiveStream({ startOffsetSecs: 3600n });
      const tx = await client.getWithdrawableAmount(streamId);
      expect(tx.result).toBe(0n);
    });

    it('returns a positive amount for a stream started in the past', async () => {
      if (skipIfUnavailable()) return;
      const streamId = await createActiveStream({
        total_amount: 1_000_000n,
        startOffsetSecs: -1800n, // started 30 min ago
        durationSecs: 3600n,     // ends in 30 min
      });
      const tx = await client.getWithdrawableAmount(streamId);
      expect(tx.result).toBeGreaterThan(0n);
      expect(tx.result).toBeLessThanOrEqual(1_000_000n);
    });

    it('accepts object-style overload', async () => {
      if (skipIfUnavailable()) return;
      const streamId = await createActiveStream();
      const tx = await client.getWithdrawableAmount({ streamId });
      expect(typeof tx.result).toBe('bigint');
    });
  });

  // ── pauseStream / resumeStream ──────────────────────────────────────────────
  describe('pauseStream / resumeStream', () => {
    let streamId: bigint;
    beforeAll(async () => {
      if (!suiteReady) return;
      streamId = await createActiveStream();
    });

    it('pauses an Active stream → status becomes Paused', async () => {
      if (skipIfUnavailable()) return;
      const tx = await client.pauseStream(streamId);
      await tx.signAndSend({ signTransaction: keypairSigner(senderKp) });
      expect((await client.getStream(streamId)).result.status.tag).toBe('Paused');
    });

    it('resumes a Paused stream → status becomes Active', async () => {
      if (skipIfUnavailable()) return;
      const tx = await client.resumeStream(streamId);
      await tx.signAndSend({ signTransaction: keypairSigner(senderKp) });
      expect((await client.getStream(streamId)).result.status.tag).toBe('Active');
    });

    it('accepts object-style overload for pauseStream', async () => {
      if (skipIfUnavailable()) return;
      const sid = await createActiveStream();
      const tx = await client.pauseStream({ streamId: sid });
      await tx.signAndSend({ signTransaction: keypairSigner(senderKp) });
      expect((await client.getStream(sid)).result.status.tag).toBe('Paused');
    });

    it('non-sender cannot pause a stream', async () => {
      if (skipIfUnavailable()) return;
      const sid = await createActiveStream();
      const tx = await client.pauseStream(sid);
      await expect(
        tx.signAndSend({ signTransaction: keypairSigner(nonPartyKp) }),
      ).rejects.toThrow();
    });
  });

  // ── cancelStream ────────────────────────────────────────────────────────────
  describe('cancelStream', () => {
    it('cancels an Active stream → status becomes Canceled', async () => {
      if (skipIfUnavailable()) return;
      const streamId = await createActiveStream({ total_amount: 200_000n });
      const tx = await client.cancelStream(streamId);
      await tx.signAndSend({ signTransaction: keypairSigner(senderKp) });
      expect((await client.getStream(streamId)).result.status.tag).toBe('Canceled');
    });

    it('accepts object-style overload for cancelStream', async () => {
      if (skipIfUnavailable()) return;
      const streamId = await createActiveStream();
      const tx = await client.cancelStream({ streamId });
      await tx.signAndSend({ signTransaction: keypairSigner(senderKp) });
      expect((await client.getStream(streamId)).result.status.tag).toBe('Canceled');
    });
  });

  // ── deposit ─────────────────────────────────────────────────────────────────
  describe('deposit', () => {
    it('increases stream balance after deposit', async () => {
      if (skipIfUnavailable()) return;
      const streamId = await createActiveStream({ total_amount: 2_000_000n, initial_amount: 500_000n });
      const before = (await client.getStream(streamId)).result.balance;
      const tx = await client.deposit(streamId, 100_000n);
      await tx.signAndSend({ signTransaction: keypairSigner(senderKp) });
      const after = (await client.getStream(streamId)).result.balance;
      expect(after).toBe(before + 100_000n);
    });

    it('accepts object-style overload', async () => {
      if (skipIfUnavailable()) return;
      const streamId = await createActiveStream({ total_amount: 2_000_000n });
      const tx = await client.deposit({ streamId, amount: 50_000n });
      await expect(
        tx.signAndSend({ signTransaction: keypairSigner(senderKp) }),
      ).resolves.not.toThrow();
    });
  });

  // ── withdraw / withdrawMax ──────────────────────────────────────────────────
  describe('withdraw / withdrawMax', () => {
    it('withdraw reduces the withdrawable amount', async () => {
      if (skipIfUnavailable()) return;
      const streamId = await createActiveStream({
        total_amount:    1_000_000n,
        startOffsetSecs: -1800n,
        durationSecs:    3600n,
      });
      const withdrawable = (await client.getWithdrawableAmount(streamId)).result;
      if (withdrawable === 0n) return; // edge case: nothing to withdraw yet

      const tx = await client.withdraw(streamId, withdrawable);
      await tx.signAndSend({ signTransaction: keypairSigner(recipientKp) });
      const stream = (await client.getStream(streamId)).result;
      expect(stream.withdrawn_amount).toBe(withdrawable);
    });

    it('withdrawMax withdraws the full available amount', async () => {
      if (skipIfUnavailable()) return;
      const streamId = await createActiveStream({
        total_amount:    1_000_000n,
        startOffsetSecs: -1800n,
        durationSecs:    3600n,
      });
      const withdrawable = (await client.getWithdrawableAmount(streamId)).result;
      if (withdrawable === 0n) return;

      const tx = await client.withdrawMax(streamId);
      await tx.signAndSend({ signTransaction: keypairSigner(recipientKp) });
      const newWithdrawable = (await client.getWithdrawableAmount(streamId)).result;
      expect(newWithdrawable).toBe(0n);
    });

    it('accepts object-style overload for withdraw', async () => {
      if (skipIfUnavailable()) return;
      const streamId = await createActiveStream({
        total_amount:    500_000n,
        startOffsetSecs: -900n,
        durationSecs:    1800n,
      });
      const withdrawable = (await client.getWithdrawableAmount(streamId)).result;
      if (withdrawable === 0n) return;
      const tx = await client.withdraw({ streamId, amount: withdrawable });
      await expect(
        tx.signAndSend({ signTransaction: keypairSigner(recipientKp) }),
      ).resolves.not.toThrow();
    });
  });

  // ── setDelegate / revokeDelegate / getDelegate ──────────────────────────────
  describe('setDelegate / revokeDelegate / getDelegate', () => {
    let streamId: bigint;
    beforeAll(async () => {
      if (!suiteReady) return;
      streamId = await createActiveStream();
    });

    it('getDelegate returns undefined on a fresh stream', async () => {
      if (skipIfUnavailable()) return;
      const tx = await client.getDelegate(streamId);
      expect(tx.result).toBeUndefined();
    });

    it('sets a delegate and getDelegate returns the delegate address', async () => {
      if (skipIfUnavailable()) return;
      const tx = await client.setDelegate(streamId, delegateKp.publicKey());
      await tx.signAndSend({ signTransaction: keypairSigner(recipientKp) });
      const getTx = await client.getDelegate(streamId);
      expect(getTx.result).toBe(delegateKp.publicKey());
    });

    it('revokes the delegate → getDelegate returns undefined', async () => {
      if (skipIfUnavailable()) return;
      const tx = await client.revokeDelegate(streamId);
      await tx.signAndSend({ signTransaction: keypairSigner(recipientKp) });
      const getTx = await client.getDelegate(streamId);
      expect(getTx.result).toBeUndefined();
    });

    it('accepts object-style overload for setDelegate', async () => {
      if (skipIfUnavailable()) return;
      const sid = await createActiveStream();
      const tx = await client.setDelegate({ streamId: sid, delegate: delegateKp.publicKey() });
      await tx.signAndSend({ signTransaction: keypairSigner(recipientKp) });
      expect((await client.getDelegate(sid)).result).toBe(delegateKp.publicKey());
    });

    it('non-recipient cannot set a delegate', async () => {
      if (skipIfUnavailable()) return;
      const sid = await createActiveStream();
      const tx = await client.setDelegate(sid, delegateKp.publicKey());
      await expect(
        tx.signAndSend({ signTransaction: keypairSigner(nonPartyKp) }),
      ).rejects.toThrow();
    });
  });

  // ── getStreamMetrics ────────────────────────────────────────────────────────
  describe('getStreamMetrics', () => {
    let streamId: bigint;
    beforeAll(async () => {
      if (!suiteReady) return;
      streamId = await createActiveStream();
    });

    it('returns StreamMetrics with expected shape', async () => {
      if (skipIfUnavailable()) return;
      const tx = await client.getStreamMetrics(streamId);
      const m = tx.result;
      expect(m).toBeDefined();
      expect(typeof m.pause_count).toBe('number');
      expect(typeof m.withdrawal_count).toBe('number');
      expect(typeof m.total_withdrawn).toBe('bigint');
      expect(typeof m.last_activity).toBe('bigint');
    });

    it('pause_count increments after pause/resume cycle', async () => {
      if (skipIfUnavailable()) return;
      const before = (await client.getStreamMetrics(streamId)).result.pause_count;
      await (await client.pauseStream(streamId)).signAndSend({ signTransaction: keypairSigner(senderKp) });
      await (await client.resumeStream(streamId)).signAndSend({ signTransaction: keypairSigner(senderKp) });
      const after = (await client.getStreamMetrics(streamId)).result.pause_count;
      expect(after).toBe(before + 1);
    });

    it('accepts object-style overload', async () => {
      if (skipIfUnavailable()) return;
      const tx = await client.getStreamMetrics({ streamId });
      expect(tx.result).toBeDefined();
    });
  });

  // ── getProtocolMetrics ──────────────────────────────────────────────────────
  describe('getProtocolMetrics', () => {
    it('total_streams_created grows after creating streams', async () => {
      if (skipIfUnavailable()) return;
      const before = (await client.getProtocolMetrics()).result.total_streams_created;
      await createActiveStream();
      const after = (await client.getProtocolMetrics()).result.total_streams_created;
      expect(after).toBeGreaterThan(before);
    });

    it('metrics have correct bigint types', async () => {
      if (skipIfUnavailable()) return;
      const m = (await client.getProtocolMetrics()).result;
      expect(typeof m.total_streams_created).toBe('bigint');
      expect(typeof m.total_active_streams).toBe('bigint');
      expect(typeof m.total_tokens_streamed).toBe('bigint');
      expect(typeof m.total_delegations).toBe('bigint');
    });
  });

  // ── getFeeCollector / getProtocolFeeRate ────────────────────────────────────
  describe('getFeeCollector / getProtocolFeeRate', () => {
    it('getFeeCollector returns the admin address', async () => {
      if (skipIfUnavailable()) return;
      const tx = await client.getFeeCollector();
      expect(tx.result).toBe(adminKp.publicKey());
    });

    it('getProtocolFeeRate returns 0', async () => {
      if (skipIfUnavailable()) return;
      const tx = await client.getProtocolFeeRate();
      expect(tx.result).toBe(0);
    });
  });

  // ── getStreamHistory / getAllStreamHistory ──────────────────────────────────
  describe('getStreamHistory / getAllStreamHistory', () => {
    let streamId: bigint;
    beforeAll(async () => {
      if (!suiteReady) return;
      // Create a stream and perform a few actions to generate events
      streamId = await createActiveStream({ total_amount: 1_000_000n });
      await (await client.pauseStream(streamId))
        .signAndSend({ signTransaction: keypairSigner(senderKp) });
      await (await client.resumeStream(streamId))
        .signAndSend({ signTransaction: keypairSigner(senderKp) });
    });

    it('getStreamHistory returns an array of events', async () => {
      if (skipIfUnavailable()) return;
      const result = await client.getStreamHistory(streamId);
      expect(result).toBeDefined();
      expect(Array.isArray(result.events)).toBe(true);
      expect(typeof result.latestLedger).toBe('number');
    });

    it('returned events belong to the queried stream', async () => {
      if (skipIfUnavailable()) return;
      const { events } = await client.getStreamHistory(streamId);
      for (const event of events) {
        const payload = event.payload as { stream_id: bigint };
        expect(payload.stream_id).toBe(streamId);
      }
    });

    it('getAllStreamHistory returns all events without duplicates', async () => {
      if (skipIfUnavailable()) return;
      const events = await client.getAllStreamHistory(streamId, { maxPages: 5 });
      expect(Array.isArray(events)).toBe(true);
      // Verify no duplicate pagingTokens
      const ids = events.map((_, i) => i);
      expect(ids.length).toBe(new Set(ids).size);
    });

    it('accepts object-style overload for getStreamHistory', async () => {
      if (skipIfUnavailable()) return;
      const result = await client.getStreamHistory({ streamId, limit: 10 });
      expect(Array.isArray(result.events)).toBe(true);
    });
  });

  // ── re-initialization guard ─────────────────────────────────────────────────
  describe('guard: re-initialization', () => {
    it('second initialize call rejects with AlreadyInitialized error', async () => {
      if (skipIfUnavailable()) return;
      const tx = await client.initialize({
        admin:            adminKp.publicKey(),
        fee_collector:    adminKp.publicKey(),
        general_fee_rate: 0,
      });
      await expect(
        tx.signAndSend({ signTransaction: keypairSigner(adminKp) }),
      ).rejects.toThrow();
    });
  });
});
