import { vi } from 'vitest';

const mock = {
  getAccount: vi.fn(),
  simulateTransaction: vi.fn(),
  sendTransaction: vi.fn(),
  getTransaction: vi.fn(),
  getNetwork: vi.fn(),

  mockSuccess() {
    this.simulateTransaction.mockResolvedValue({ result: {} });
    this.sendTransaction.mockResolvedValue({ hash: 'tx123' });
    this.getTransaction.mockResolvedValue({ status: 'SUCCESS', ledger: 12345 });
  },

  mockPendingThenSuccess() {
    this.getTransaction
      .mockResolvedValueOnce({ status: 'PENDING' })
      .mockResolvedValueOnce({ status: 'SUCCESS', ledger: 123 });
  },

  mockFailure() {
    this.getTransaction.mockResolvedValue({ status: 'FAILED', ledger: 123 });
  },

  mockTimeout() {
    this.simulateTransaction.mockRejectedValue(new Error('timeout'));
  },

  mockMalformed() {
    this.simulateTransaction.mockResolvedValue({});
  },
};

vi.mock('@stellar/stellar-sdk/rpc', () => ({
  Server: vi.fn(() => mock),
  Api: {
    isSimulationError: (r: Record<string, unknown>) => r?.error !== undefined,
    isSimulationSuccess: (r: Record<string, unknown>) => r?.error === undefined,
    GetTransactionStatus: { NOT_FOUND: 'NOT_FOUND', SUCCESS: 'SUCCESS', FAILED: 'FAILED' },
  },
}));

export function createMockRpcServer() { return mock; }
export function resetMockRpcServer() { Object.values(mock).forEach((fn) => { if (typeof fn === 'function' && 'mockReset' in fn) fn.mockReset(); }); }