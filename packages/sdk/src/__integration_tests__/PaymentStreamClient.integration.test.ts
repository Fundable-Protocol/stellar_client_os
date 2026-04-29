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
  PAYMENT_STREAM_WASM_PATH,
} from './setup';
import { PaymentStreamClient } from '../PaymentStreamClient';
import { Keypair } from '@stellar/stellar-sdk';

// ---------------------------------------------------------------------------
// Suite-level state
// ---------------------------------------------------------------------------

let adminKp: Keypair;
let senderKp: Keypair;
let recipientKp: Keypair;
let contractId: string;
let tokenContractId: string;
let client: PaymentStreamClient;

// ---------------------------------------------------------------------------
// Suite setup
// ---------------------------------------------------------------------------

beforeAll(async () => {
  const reachable = await isLocalNodeReachable();
  if (!reachable) {
    console.warn(
      '\n⚠️  Local Soroban node not reachable at ' +
        LOCAL_RPC_URL +
        '. Skipping PaymentStreamClient integration tests.\n' +
        "   Start a local node with: stellar network start local\n",
    );
    return;
  }

  // Fund test accounts
  [adminKp, senderKp, recipientKp] = await Promise.all([
    generateFundedKeypair(),
    generateFundedKeypair(),
    generateFundedKeypair(),
  ]);

  // Deploy the payment-stream contract
  contractId = deployContractViaCli({
    wasmPath: PAYMENT_STREAM_WASM_PATH,
    sourceKeypair: adminKp,
  });

  // Deploy a SAC token for the tests
  tokenContractId = deployStellarAssetContract({
    issuerKeypair: adminKp,
    assetCode: 'USDC',
  });

  // Build the client
  client = new PaymentStreamClient({
    contractId,
    networkPassphrase: LOCAL_NETWORK_PASSPHRASE,
    rpcUrl: LOCAL_RPC_URL,
    publicKey: adminKp.publicKey(),
  });

  // Initialize the contract
  const initTx = await client.initialize({
    admin: adminKp.publicKey(),
    fee_collector: adminKp.publicKey(),
    general_fee_rate: 0,
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

describe('PaymentStreamClient (integration)', () => {
  describe('initialize', () => {
    it('contract is initialized and returns protocol metrics', async () => {
      if (skipIfUnavailable()) return;

      const tx = await client.getProtocolMetrics();
      const metrics = tx.result;

      expect(metrics).toBeDefined();
      expect(typeof metrics.total_streams).toBe('bigint');
      expect(metrics.total_streams).toBe(0n);
    });
  });

  describe('createStream', () => {
    it('creates a stream and returns a numeric stream ID', async () => {
      if (skipIfUnavailable()) return;

      const now = BigInt(Math.floor(Date.now() / 1000));
      const tx = await client.createStream({
        sender: senderKp.publicKey(),
        recipient: recipientKp.publicKey(),
        token: tokenContractId,
        total_amount: 1_000_000n,
        initial_amount: 0n,
        start_time: now,
        end_time: now + 3600n, // 1 hour
      });

      await tx.signAndSend({ signTransaction: keypairSigner(senderKp) });

      const streamId = tx.result;
      expect(typeof streamId).toBe('bigint');
      expect(streamId).toBeGreaterThanOrEqual(0n);
    });
  });

  describe('getStream', () => {
    let streamId: bigint;

    beforeAll(async () => {
      if (!client) return;

      const now = BigInt(Math.floor(Date.now() / 1000));
      const tx = await client.createStream({
        sender: senderKp.publicKey(),
        recipient: recipientKp.publicKey(),
        token: tokenContractId,
        total_amount: 500_000n,
        initial_amount: 0n,
        start_time: now,
        end_time: now + 7200n,
      });
      await tx.signAndSend({ signTransaction: keypairSigner(senderKp) });
      streamId = tx.result;
    });

    it('retrieves stream details by ID', async () => {
      if (skipIfUnavailable()) return;

      const tx = await client.getStream(streamId);
      const stream = tx.result;

      expect(stream).toBeDefined();
      expect(stream.id).toBe(streamId);
      expect(stream.sender).toBe(senderKp.publicKey());
      expect(stream.recipient).toBe(recipientKp.publicKey());
      expect(stream.token).toBe(tokenContractId);
      expect(stream.total_amount).toBe(500_000n);
      expect(stream.status.tag).toBe('Active');
    });
  });

  describe('getWithdrawableAmount', () => {
    let streamId: bigint;

    beforeAll(async () => {
      if (!client) return;

      const now = BigInt(Math.floor(Date.now() / 1000));
      const tx = await client.createStream({
        sender: senderKp.publicKey(),
        recipient: recipientKp.publicKey(),
        token: tokenContractId,
        total_amount: 1_000_000n,
        initial_amount: 0n,
        start_time: now - 1800n, // started 30 min ago
        end_time: now + 1800n,   // ends in 30 min
      });
      await tx.signAndSend({ signTransaction: keypairSigner(senderKp) });
      streamId = tx.result;
    });

    it('returns a non-negative withdrawable amount', async () => {
      if (skipIfUnavailable()) return;

      const tx = await client.getWithdrawableAmount(streamId);
      expect(typeof tx.result).toBe('bigint');
      expect(tx.result).toBeGreaterThanOrEqual(0n);
    });
  });

  describe('pauseStream / resumeStream', () => {
    let streamId: bigint;

    beforeAll(async () => {
      if (!client) return;

      const now = BigInt(Math.floor(Date.now() / 1000));
      const tx = await client.createStream({
        sender: senderKp.publicKey(),
        recipient: recipientKp.publicKey(),
        token: tokenContractId,
        total_amount: 1_000_000n,
        initial_amount: 0n,
        start_time: now,
        end_time: now + 3600n,
      });
      await tx.signAndSend({ signTransaction: keypairSigner(senderKp) });
      streamId = tx.result;
    });

    it('pauses an active stream', async () => {
      if (skipIfUnavailable()) return;

      const pauseTx = await client.pauseStream(streamId);
      await pauseTx.signAndSend({ signTransaction: keypairSigner(senderKp) });

      const streamTx = await client.getStream(streamId);
      expect(streamTx.result.status.tag).toBe('Paused');
    });

    it('resumes a paused stream', async () => {
      if (skipIfUnavailable()) return;

      const resumeTx = await client.resumeStream(streamId);
      await resumeTx.signAndSend({ signTransaction: keypairSigner(senderKp) });

      const streamTx = await client.getStream(streamId);
      expect(streamTx.result.status.tag).toBe('Active');
    });
  });

  describe('cancelStream', () => {
    it('cancels an active stream', async () => {
      if (skipIfUnavailable()) return;

      const now = BigInt(Math.floor(Date.now() / 1000));
      const createTx = await client.createStream({
        sender: senderKp.publicKey(),
        recipient: recipientKp.publicKey(),
        token: tokenContractId,
        total_amount: 200_000n,
        initial_amount: 0n,
        start_time: now,
        end_time: now + 3600n,
      });
      await createTx.signAndSend({ signTransaction: keypairSigner(senderKp) });
      const streamId = createTx.result;

      const cancelTx = await client.cancelStream(streamId);
      await cancelTx.signAndSend({ signTransaction: keypairSigner(senderKp) });

      const streamTx = await client.getStream(streamId);
      expect(streamTx.result.status.tag).toBe('Canceled');
    });
  });

  describe('setDelegate / revokeDelegate', () => {
    let streamId: bigint;
    let delegateKp: Keypair;

    beforeAll(async () => {
      if (!client) return;

      delegateKp = await generateFundedKeypair();

      const now = BigInt(Math.floor(Date.now() / 1000));
      const tx = await client.createStream({
        sender: senderKp.publicKey(),
        recipient: recipientKp.publicKey(),
        token: tokenContractId,
        total_amount: 1_000_000n,
        initial_amount: 0n,
        start_time: now,
        end_time: now + 3600n,
      });
      await tx.signAndSend({ signTransaction: keypairSigner(senderKp) });
      streamId = tx.result;
    });

    it('sets a delegate on a stream', async () => {
      if (skipIfUnavailable()) return;

      const setTx = await client.setDelegate(streamId, delegateKp.publicKey());
      await setTx.signAndSend({ signTransaction: keypairSigner(recipientKp) });

      const getTx = await client.getDelegate(streamId);
      expect(getTx.result).toBe(delegateKp.publicKey());
    });

    it('revokes the delegate', async () => {
      if (skipIfUnavailable()) return;

      const revokeTx = await client.revokeDelegate(streamId);
      await revokeTx.signAndSend({ signTransaction: keypairSigner(recipientKp) });

      const getTx = await client.getDelegate(streamId);
      expect(getTx.result).toBeUndefined();
    });
  });

  describe('getProtocolMetrics', () => {
    it('returns protocol-wide metrics', async () => {
      if (skipIfUnavailable()) return;

      const tx = await client.getProtocolMetrics();
      const metrics = tx.result;

      expect(metrics).toBeDefined();
      expect(typeof metrics.total_streams).toBe('bigint');
      expect(metrics.total_streams).toBeGreaterThan(0n);
    });
  });
});
