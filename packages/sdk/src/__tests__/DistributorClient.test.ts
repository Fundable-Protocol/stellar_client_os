import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DistributorClient } from '../DistributorClient';

// ---------------------------------------------------------------------------
// Mock the generated distributor contract client
// ---------------------------------------------------------------------------
const mockTx = (result: unknown = undefined) => ({ result, signAndSend: vi.fn() });

const mockContractClient = {
  distribute_equal: vi.fn(),
  distribute_weighted: vi.fn(),
  get_admin: vi.fn(),
  get_user_stats: vi.fn(),
  get_token_stats: vi.fn(),
  get_total_distributions: vi.fn(),
  get_total_distributed_amount: vi.fn(),
  get_distribution_history: vi.fn(),
  initialize: vi.fn(),
  set_protocol_fee: vi.fn(),
};

vi.mock('../generated/distributor/src/index', () => ({
  Client: vi.fn().mockImplementation(() => mockContractClient),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const VALID_OPTIONS = {
  contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHK3M',
  networkPassphrase: 'Test SDF Network ; September 2015',
  rpcUrl: 'https://soroban-testnet.stellar.org',
};

const SENDER = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const TOKEN = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM';
const RECIPIENT_A = 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
const RECIPIENT_B = 'GCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('DistributorClient', () => {
  let client: DistributorClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new DistributorClient(VALID_OPTIONS);
  });

  // ── constructor ────────────────────────────────────────────────────────────
  describe('constructor', () => {
    it('instantiates without throwing', () => {
      expect(client).toBeInstanceOf(DistributorClient);
    });

    it('passes options through to the generated ContractClient', async () => {
      const { Client } = await import('../generated/distributor/src/index');
      expect(Client).toHaveBeenCalledWith(VALID_OPTIONS);
    });
  });

  // ── distributeEqual ────────────────────────────────────────────────────────
  describe('distributeEqual', () => {
    const params = {
      sender: SENDER,
      token: TOKEN,
      total_amount: 1000n,
      recipients: [RECIPIENT_A, RECIPIENT_B],
    };

    it('delegates to client.distribute_equal with correct params', async () => {
      mockContractClient.distribute_equal.mockResolvedValue(mockTx());
      await client.distributeEqual(params);
      expect(mockContractClient.distribute_equal).toHaveBeenCalledWith(params);
    });

    it('returns AssembledTransaction<null>', async () => {
      mockContractClient.distribute_equal.mockResolvedValue(mockTx(null));
      const tx = await client.distributeEqual(params);
      expect(tx.result).toBeNull();
    });

    it('handles single recipient', async () => {
      mockContractClient.distribute_equal.mockResolvedValue(mockTx());
      const singleRecipient = { ...params, recipients: [RECIPIENT_A] };
      await client.distributeEqual(singleRecipient);
      expect(mockContractClient.distribute_equal).toHaveBeenCalledWith(singleRecipient);
    });

    it('propagates contract revert', async () => {
      mockContractClient.distribute_equal.mockRejectedValue(new Error('InvalidAmount'));
      await expect(client.distributeEqual(params)).rejects.toThrow('InvalidAmount');
    });

    it('propagates network failure', async () => {
      mockContractClient.distribute_equal.mockRejectedValue(new Error('Network error'));
      await expect(client.distributeEqual(params)).rejects.toThrow('Network error');
    });
  });

  // ── distributeWeighted ─────────────────────────────────────────────────────
  describe('distributeWeighted', () => {
    const params = {
      sender: SENDER,
      token: TOKEN,
      recipients: [RECIPIENT_A, RECIPIENT_B],
      amounts: [700n, 300n],
    };

    it('delegates to client.distribute_weighted with correct params', async () => {
      mockContractClient.distribute_weighted.mockResolvedValue(mockTx());
      await client.distributeWeighted(params);
      expect(mockContractClient.distribute_weighted).toHaveBeenCalledWith(params);
    });

    it('returns AssembledTransaction<null>', async () => {
      mockContractClient.distribute_weighted.mockResolvedValue(mockTx(null));
      const tx = await client.distributeWeighted(params);
      expect(tx.result).toBeNull();
    });

    it('handles unequal weight distribution', async () => {
      const skewed = { ...params, amounts: [999n, 1n] };
      mockContractClient.distribute_weighted.mockResolvedValue(mockTx());
      await client.distributeWeighted(skewed);
      expect(mockContractClient.distribute_weighted).toHaveBeenCalledWith(skewed);
    });

    it('propagates mismatched recipients/amounts error', async () => {
      mockContractClient.distribute_weighted.mockRejectedValue(new Error('InvalidAmount'));
      const bad = { ...params, amounts: [100n] }; // length mismatch
      await expect(client.distributeWeighted(bad)).rejects.toThrow('InvalidAmount');
    });

    it('propagates Unauthorized error', async () => {
      mockContractClient.distribute_weighted.mockRejectedValue(new Error('Unauthorized'));
      await expect(client.distributeWeighted(params)).rejects.toThrow('Unauthorized');
    });
  });

  // ── getAdmin ───────────────────────────────────────────────────────────────
  describe('getAdmin', () => {
    it('returns admin address when set', async () => {
      mockContractClient.get_admin.mockResolvedValue(mockTx(SENDER));
      const tx = await client.getAdmin();
      expect(tx.result).toBe(SENDER);
    });

    it('returns undefined when no admin is set', async () => {
      mockContractClient.get_admin.mockResolvedValue(mockTxNone());
      const tx = await client.getAdmin();
      expect(tx.result).toBeUndefined();
    });
  });

  // ── getUserStats ───────────────────────────────────────────────────────────
  describe('getUserStats', () => {
    const mockStats = {
      distributions_initiated: 3,
      total_amount: 5000n,
    };

    it('delegates to client.get_user_stats with correct user param', async () => {
      mockContractClient.get_user_stats.mockResolvedValue(mockTx(mockStats));
      const tx = await client.getUserStats(SENDER);
      expect(mockContractClient.get_user_stats).toHaveBeenCalledWith({ user: SENDER });
      expect(tx.result).toEqual(mockStats);
    });

    it('returns correct UserStats shape', async () => {
      mockContractClient.get_user_stats.mockResolvedValue(mockTx(mockStats));
      const tx = await client.getUserStats(SENDER);
      expect(tx.result).toHaveProperty('distributions_initiated');
      expect(tx.result).toHaveProperty('total_amount');
    });

    it('returns undefined for unknown user', async () => {
      mockContractClient.get_user_stats.mockResolvedValue(mockTxNone());
      const tx = await client.getUserStats('GUNKNOWN');
      expect(tx.result).toBeUndefined();
    });
  });

  // ── getTokenStats ──────────────────────────────────────────────────────────
  describe('getTokenStats', () => {
    const mockStats = {
      distribution_count: 5,
      last_time: 1700000000n,
      total_amount: 25000n,
    };

    it('delegates to client.get_token_stats with correct token param', async () => {
      mockContractClient.get_token_stats.mockResolvedValue(mockTx(mockStats));
      const tx = await client.getTokenStats(TOKEN);
      expect(mockContractClient.get_token_stats).toHaveBeenCalledWith({ token: TOKEN });
      expect(tx.result).toEqual(mockStats);
    });

    it('returns correct TokenStats shape', async () => {
      mockContractClient.get_token_stats.mockResolvedValue(mockTx(mockStats));
      const tx = await client.getTokenStats(TOKEN);
      expect(tx.result).toHaveProperty('distribution_count');
      expect(tx.result).toHaveProperty('last_time');
      expect(tx.result).toHaveProperty('total_amount');
    });

    it('returns undefined for unknown token', async () => {
      mockContractClient.get_token_stats.mockResolvedValue(mockTxNone());
      const tx = await client.getTokenStats('CUNKNOWN');
      expect(tx.result).toBeUndefined();
    });
  });

  // ── getTotalDistributions ──────────────────────────────────────────────────
  describe('getTotalDistributions', () => {
    it('returns total distribution count as bigint', async () => {
      mockContractClient.get_total_distributions.mockResolvedValue(mockTx(42n));
      const tx = await client.getTotalDistributions();
      expect(mockContractClient.get_total_distributions).toHaveBeenCalled();
      expect(tx.result).toBe(42n);
    });

    it('returns 0n when no distributions have occurred', async () => {
      mockContractClient.get_total_distributions.mockResolvedValue(mockTx(0n));
      const tx = await client.getTotalDistributions();
      expect(tx.result).toBe(0n);
    });
  });

  // ── getTotalDistributedAmount ──────────────────────────────────────────────
  describe('getTotalDistributedAmount', () => {
    it('returns total distributed amount as bigint', async () => {
      mockContractClient.get_total_distributed_amount.mockResolvedValue(mockTx(100000n));
      const tx = await client.getTotalDistributedAmount();
      expect(mockContractClient.get_total_distributed_amount).toHaveBeenCalled();
      expect(tx.result).toBe(100000n);
    });
  });

  // ── getDistributionHistory ─────────────────────────────────────────────────
  describe('getDistributionHistory', () => {
    const mockHistory = [
      {
        amount: 1000n,
        recipients_count: 2,
        sender: SENDER,
        timestamp: 1700000000n,
        token: TOKEN,
      },
    ];

    it('delegates to client.get_distribution_history with correct params', async () => {
      mockContractClient.get_distribution_history.mockResolvedValue(mockTx(mockHistory));
      const tx = await client.getDistributionHistory(0n, 10n);
      expect(mockContractClient.get_distribution_history).toHaveBeenCalledWith({
        start_id: 0n,
        limit: 10n,
      });
      expect(tx.result).toEqual(mockHistory);
    });

    it('returns empty array when no history exists', async () => {
      mockContractClient.get_distribution_history.mockResolvedValue(mockTx([]));
      const tx = await client.getDistributionHistory(0n, 10n);
      expect(tx.result).toEqual([]);
    });

    it('returns correct DistributionHistory shape', async () => {
      mockContractClient.get_distribution_history.mockResolvedValue(mockTx(mockHistory));
      const tx = await client.getDistributionHistory(0n, 1n);
      const entry = (tx.result as typeof mockHistory)[0];
      expect(entry).toHaveProperty('amount');
      expect(entry).toHaveProperty('recipients_count');
      expect(entry).toHaveProperty('sender');
      expect(entry).toHaveProperty('timestamp');
      expect(entry).toHaveProperty('token');
    });

    it('respects pagination params', async () => {
      mockContractClient.get_distribution_history.mockResolvedValue(mockTx([]));
      await client.getDistributionHistory(5n, 20n);
      expect(mockContractClient.get_distribution_history).toHaveBeenCalledWith({
        start_id: 5n,
        limit: 20n,
      });
    });
  });

  // ── initialize ─────────────────────────────────────────────────────────────
  describe('initialize', () => {
    const params = {
      admin: SENDER,
      protocol_fee_percent: 5,
      fee_address: RECIPIENT_A,
    };

    it('delegates to client.initialize with correct params', async () => {
      mockContractClient.initialize.mockResolvedValue(mockTx());
      await client.initialize(params);
      expect(mockContractClient.initialize).toHaveBeenCalledWith(params);
    });

    it('propagates AlreadyInitialized error', async () => {
      mockContractClient.initialize.mockRejectedValue(new Error('AlreadyInitialized'));
      await expect(client.initialize(params)).rejects.toThrow('AlreadyInitialized');
    });
  });

  // ── setProtocolFee ─────────────────────────────────────────────────────────
  describe('setProtocolFee', () => {
    it('delegates to client.set_protocol_fee with correct params', async () => {
      mockContractClient.set_protocol_fee.mockResolvedValue(mockTx());
      await client.setProtocolFee(SENDER, 10);
      expect(mockContractClient.set_protocol_fee).toHaveBeenCalledWith({
        admin: SENDER,
        new_fee_percent: 10,
      });
    });

    it('propagates Unauthorized error when non-admin calls', async () => {
      mockContractClient.set_protocol_fee.mockRejectedValue(new Error('Unauthorized'));
      await expect(client.setProtocolFee('GNOTADMIN', 10)).rejects.toThrow('Unauthorized');
    });

    it('propagates FeeTooHigh error', async () => {
      mockContractClient.set_protocol_fee.mockRejectedValue(new Error('FeeTooHigh'));
      await expect(client.setProtocolFee(SENDER, 9999)).rejects.toThrow('FeeTooHigh');
    });
  });
});
