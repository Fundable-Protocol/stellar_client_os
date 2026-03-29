import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PaymentStreamClient } from '../PaymentStreamClient';

// ---------------------------------------------------------------------------
// Mock the generated contract client at the module level so no RPC calls
// are ever made. Each method returns a resolved promise with a fake
// AssembledTransaction-shaped object.
// ---------------------------------------------------------------------------
const mockTx = (result: unknown = null) => ({ result, signAndSend: vi.fn() });

const mockContractClient = {
  create_stream: vi.fn(),
  deposit: vi.fn(),
  withdraw: vi.fn(),
  withdraw_max: vi.fn(),
  pause_stream: vi.fn(),
  resume_stream: vi.fn(),
  cancel_stream: vi.fn(),
  get_stream: vi.fn(),
  withdrawable_amount: vi.fn(),
  set_delegate: vi.fn(),
  revoke_delegate: vi.fn(),
  get_delegate: vi.fn(),
  get_stream_metrics: vi.fn(),
  get_protocol_metrics: vi.fn(),
  get_fee_collector: vi.fn(),
  get_protocol_fee_rate: vi.fn(),
  initialize: vi.fn(),
};

vi.mock('../generated/payment-stream/src/index', () => ({
  Client: vi.fn().mockImplementation(() => mockContractClient),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const VALID_OPTIONS = {
  contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM',
  networkPassphrase: 'Test SDF Network ; September 2015',
  rpcUrl: 'https://soroban-testnet.stellar.org',
};

const SENDER = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const RECIPIENT = 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
const TOKEN = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM';
const DELEGATE = 'GCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';
const STREAM_ID = 1n;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('PaymentStreamClient', () => {
  let client: PaymentStreamClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new PaymentStreamClient(VALID_OPTIONS);
  });

  // ── constructor ────────────────────────────────────────────────────────────
  describe('constructor', () => {
    it('instantiates without throwing', () => {
      expect(client).toBeInstanceOf(PaymentStreamClient);
    });

    it('passes options through to the generated ContractClient', async () => {
      const { Client } = await import('../generated/payment-stream/src/index');
      expect(Client).toHaveBeenCalledWith(VALID_OPTIONS);
    });
  });

  // ── createStream ───────────────────────────────────────────────────────────
  describe('createStream', () => {
    const params = {
      sender: SENDER,
      recipient: RECIPIENT,
      token: TOKEN,
      total_amount: 1000n,
      initial_amount: 0n,
      start_time: 1000n,
      end_time: 2000n,
    };

    it('delegates to client.create_stream with correct params', async () => {
      mockContractClient.create_stream.mockResolvedValue(mockTx(1n));
      const tx = await client.createStream(params);
      expect(mockContractClient.create_stream).toHaveBeenCalledWith(params);
      expect(tx).toEqual(mockTx(1n));
    });

    it('returns an AssembledTransaction with bigint result', async () => {
      mockContractClient.create_stream.mockResolvedValue(mockTx(42n));
      const tx = await client.createStream(params);
      expect(tx.result).toBe(42n);
    });

    it('propagates contract errors', async () => {
      mockContractClient.create_stream.mockRejectedValue(new Error('InvalidTimeRange'));
      await expect(client.createStream(params)).rejects.toThrow('InvalidTimeRange');
    });

    it('propagates network failures', async () => {
      mockContractClient.create_stream.mockRejectedValue(new Error('Network error'));
      await expect(client.createStream(params)).rejects.toThrow('Network error');
    });
  });

  // ── deposit ────────────────────────────────────────────────────────────────
  describe('deposit', () => {
    it('delegates to client.deposit with correct params', async () => {
      mockContractClient.deposit.mockResolvedValue(mockTx());
      await client.deposit(STREAM_ID, 500n);
      expect(mockContractClient.deposit).toHaveBeenCalledWith({ stream_id: STREAM_ID, amount: 500n });
    });

    it('returns AssembledTransaction<null>', async () => {
      mockContractClient.deposit.mockResolvedValue(mockTx(null));
      const tx = await client.deposit(STREAM_ID, 500n);
      expect(tx.result).toBeNull();
    });

    it('propagates contract revert on DepositExceedsTotal', async () => {
      mockContractClient.deposit.mockRejectedValue(new Error('DepositExceedsTotal'));
      await expect(client.deposit(STREAM_ID, 999999n)).rejects.toThrow('DepositExceedsTotal');
    });
  });

  // ── withdraw ───────────────────────────────────────────────────────────────
  describe('withdraw', () => {
    it('delegates to client.withdraw with correct params', async () => {
      mockContractClient.withdraw.mockResolvedValue(mockTx());
      await client.withdraw(STREAM_ID, 100n);
      expect(mockContractClient.withdraw).toHaveBeenCalledWith({ stream_id: STREAM_ID, amount: 100n });
    });

    it('propagates InsufficientWithdrawable error', async () => {
      mockContractClient.withdraw.mockRejectedValue(new Error('InsufficientWithdrawable'));
      await expect(client.withdraw(STREAM_ID, 9999n)).rejects.toThrow('InsufficientWithdrawable');
    });
  });

  // ── withdrawMax ────────────────────────────────────────────────────────────
  describe('withdrawMax', () => {
    it('delegates to client.withdraw_max', async () => {
      mockContractClient.withdraw_max.mockResolvedValue(mockTx());
      await client.withdrawMax(STREAM_ID);
      expect(mockContractClient.withdraw_max).toHaveBeenCalledWith({ stream_id: STREAM_ID });
    });
  });

  // ── pauseStream ────────────────────────────────────────────────────────────
  describe('pauseStream', () => {
    it('delegates to client.pause_stream', async () => {
      mockContractClient.pause_stream.mockResolvedValue(mockTx());
      await client.pauseStream(STREAM_ID);
      expect(mockContractClient.pause_stream).toHaveBeenCalledWith({ stream_id: STREAM_ID });
    });

    it('propagates Unauthorized error', async () => {
      mockContractClient.pause_stream.mockRejectedValue(new Error('Unauthorized'));
      await expect(client.pauseStream(STREAM_ID)).rejects.toThrow('Unauthorized');
    });

    it('propagates StreamNotActive error', async () => {
      mockContractClient.pause_stream.mockRejectedValue(new Error('StreamNotActive'));
      await expect(client.pauseStream(STREAM_ID)).rejects.toThrow('StreamNotActive');
    });
  });

  // ── resumeStream ───────────────────────────────────────────────────────────
  describe('resumeStream', () => {
    it('delegates to client.resume_stream', async () => {
      mockContractClient.resume_stream.mockResolvedValue(mockTx());
      await client.resumeStream(STREAM_ID);
      expect(mockContractClient.resume_stream).toHaveBeenCalledWith({ stream_id: STREAM_ID });
    });

    it('propagates StreamNotPaused error', async () => {
      mockContractClient.resume_stream.mockRejectedValue(new Error('StreamNotPaused'));
      await expect(client.resumeStream(STREAM_ID)).rejects.toThrow('StreamNotPaused');
    });
  });

  // ── cancelStream ───────────────────────────────────────────────────────────
  describe('cancelStream', () => {
    it('delegates to client.cancel_stream', async () => {
      mockContractClient.cancel_stream.mockResolvedValue(mockTx());
      await client.cancelStream(STREAM_ID);
      expect(mockContractClient.cancel_stream).toHaveBeenCalledWith({ stream_id: STREAM_ID });
    });

    it('propagates StreamCannotBeCanceled error', async () => {
      mockContractClient.cancel_stream.mockRejectedValue(new Error('StreamCannotBeCanceled'));
      await expect(client.cancelStream(STREAM_ID)).rejects.toThrow('StreamCannotBeCanceled');
    });
  });

  // ── getStream ──────────────────────────────────────────────────────────────
  describe('getStream', () => {
    const mockStream = {
      id: STREAM_ID,
      sender: SENDER,
      recipient: RECIPIENT,
      token: TOKEN,
      total_amount: 1000n,
      balance: 1000n,
      withdrawn_amount: 0n,
      start_time: 1000n,
      end_time: 2000n,
      status: { tag: 'Active', values: undefined },
      paused_at: undefined,
      total_paused_duration: 0n,
    };

    it('delegates to client.get_stream', async () => {
      mockContractClient.get_stream.mockResolvedValue(mockTx(mockStream));
      const tx = await client.getStream(STREAM_ID);
      expect(mockContractClient.get_stream).toHaveBeenCalledWith({ stream_id: STREAM_ID });
      expect(tx.result).toEqual(mockStream);
    });

    it('returns correct Stream shape', async () => {
      mockContractClient.get_stream.mockResolvedValue(mockTx(mockStream));
      const tx = await client.getStream(STREAM_ID);
      const stream = tx.result;
      expect(stream).toHaveProperty('id');
      expect(stream).toHaveProperty('sender');
      expect(stream).toHaveProperty('recipient');
      expect(stream).toHaveProperty('token');
      expect(stream).toHaveProperty('status');
    });

    it('propagates StreamNotFound error', async () => {
      mockContractClient.get_stream.mockRejectedValue(new Error('StreamNotFound'));
      await expect(client.getStream(999n)).rejects.toThrow('StreamNotFound');
    });
  });

  // ── getWithdrawableAmount ──────────────────────────────────────────────────
  describe('getWithdrawableAmount', () => {
    it('delegates to client.withdrawable_amount', async () => {
      mockContractClient.withdrawable_amount.mockResolvedValue(mockTx(250n));
      const tx = await client.getWithdrawableAmount(STREAM_ID);
      expect(mockContractClient.withdrawable_amount).toHaveBeenCalledWith({ stream_id: STREAM_ID });
      expect(tx.result).toBe(250n);
    });
  });

  // ── setDelegate ────────────────────────────────────────────────────────────
  describe('setDelegate', () => {
    it('delegates to client.set_delegate with correct params', async () => {
      mockContractClient.set_delegate.mockResolvedValue(mockTx());
      await client.setDelegate(STREAM_ID, DELEGATE);
      expect(mockContractClient.set_delegate).toHaveBeenCalledWith({
        stream_id: STREAM_ID,
        delegate: DELEGATE,
      });
    });

    it('propagates InvalidDelegate error', async () => {
      mockContractClient.set_delegate.mockRejectedValue(new Error('InvalidDelegate'));
      await expect(client.setDelegate(STREAM_ID, 'bad')).rejects.toThrow('InvalidDelegate');
    });
  });

  // ── revokeDelegate ─────────────────────────────────────────────────────────
  describe('revokeDelegate', () => {
    it('delegates to client.revoke_delegate', async () => {
      mockContractClient.revoke_delegate.mockResolvedValue(mockTx());
      await client.revokeDelegate(STREAM_ID);
      expect(mockContractClient.revoke_delegate).toHaveBeenCalledWith({ stream_id: STREAM_ID });
    });

    it('propagates Unauthorized error', async () => {
      mockContractClient.revoke_delegate.mockRejectedValue(new Error('Unauthorized'));
      await expect(client.revokeDelegate(STREAM_ID)).rejects.toThrow('Unauthorized');
    });
  });

  // ── getDelegate ────────────────────────────────────────────────────────────
  describe('getDelegate', () => {
    it('returns delegate address when set', async () => {
      mockContractClient.get_delegate.mockResolvedValue(mockTx(DELEGATE));
      const tx = await client.getDelegate(STREAM_ID);
      expect(tx.result).toBe(DELEGATE);
    });

    it('returns undefined when no delegate is set', async () => {
      mockContractClient.get_delegate.mockResolvedValue(mockTx(undefined));
      const tx = await client.getDelegate(STREAM_ID);
      expect(tx.result).toBeUndefined();
    });
  });

  // ── getStreamMetrics ───────────────────────────────────────────────────────
  describe('getStreamMetrics', () => {
    const mockMetrics = {
      current_delegate: undefined,
      last_activity: 1000n,
      last_delegation_time: 0n,
      pause_count: 0,
      total_delegations: 0,
      total_withdrawn: 0n,
      withdrawal_count: 0,
    };

    it('delegates to client.get_stream_metrics', async () => {
      mockContractClient.get_stream_metrics.mockResolvedValue(mockTx(mockMetrics));
      const tx = await client.getStreamMetrics(STREAM_ID);
      expect(mockContractClient.get_stream_metrics).toHaveBeenCalledWith({ stream_id: STREAM_ID });
      expect(tx.result).toEqual(mockMetrics);
    });

    it('returns correct StreamMetrics shape', async () => {
      mockContractClient.get_stream_metrics.mockResolvedValue(mockTx(mockMetrics));
      const tx = await client.getStreamMetrics(STREAM_ID);
      expect(tx.result).toHaveProperty('pause_count');
      expect(tx.result).toHaveProperty('total_withdrawn');
      expect(tx.result).toHaveProperty('withdrawal_count');
    });
  });

  // ── getProtocolMetrics ─────────────────────────────────────────────────────
  describe('getProtocolMetrics', () => {
    it('delegates to client.get_protocol_metrics', async () => {
      const mockMetrics = {
        total_active_streams: 5n,
        total_delegations: 2n,
        total_streams_created: 10n,
        total_tokens_streamed: 50000n,
      };
      mockContractClient.get_protocol_metrics.mockResolvedValue(mockTx(mockMetrics));
      const tx = await client.getProtocolMetrics();
      expect(mockContractClient.get_protocol_metrics).toHaveBeenCalled();
      expect(tx.result).toEqual(mockMetrics);
    });
  });

  // ── getFeeCollector ────────────────────────────────────────────────────────
  describe('getFeeCollector', () => {
    it('returns fee collector address', async () => {
      mockContractClient.get_fee_collector.mockResolvedValue(mockTx(SENDER));
      const tx = await client.getFeeCollector();
      expect(tx.result).toBe(SENDER);
    });
  });

  // ── getProtocolFeeRate ─────────────────────────────────────────────────────
  describe('getProtocolFeeRate', () => {
    it('returns fee rate as number', async () => {
      mockContractClient.get_protocol_fee_rate.mockResolvedValue(mockTx(50));
      const tx = await client.getProtocolFeeRate();
      expect(tx.result).toBe(50);
    });
  });

  // ── initialize ─────────────────────────────────────────────────────────────
  describe('initialize', () => {
    it('delegates to client.initialize with correct params', async () => {
      mockContractClient.initialize.mockResolvedValue(mockTx());
      const params = { admin: SENDER, fee_collector: RECIPIENT, general_fee_rate: 10 };
      await client.initialize(params);
      expect(mockContractClient.initialize).toHaveBeenCalledWith(params);
    });

    it('propagates AlreadyInitialized error', async () => {
      mockContractClient.initialize.mockRejectedValue(new Error('AlreadyInitialized'));
      await expect(
        client.initialize({ admin: SENDER, fee_collector: RECIPIENT, general_fee_rate: 10 })
      ).rejects.toThrow('AlreadyInitialized');
    });
  });
});
