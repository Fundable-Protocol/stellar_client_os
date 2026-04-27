import { describe, it, expect, vi, beforeEach } from "vitest";
import { PaymentStreamClient } from "../PaymentStreamClient";
import { DistributorClient } from "../DistributorClient";
import { Client as ContractClient } from "../generated/payment-stream/src/index";
import { Client as DistributorContractClient } from "../generated/distributor/src/index";

// Mock the contract clients
vi.mock("../generated/payment-stream/src/index", () => ({
  Client: vi.fn(),
}));

vi.mock("../generated/distributor/src/index", () => ({
  Client: vi.fn(),
}));

describe("Client Method Overloads", () => {
  let paymentStreamClient: PaymentStreamClient;
  let distributorClient: DistributorClient;
  let mockPaymentClient: any;
  let mockDistributorClient: any;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Create mock contract clients
    mockPaymentClient = {
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
    };

    mockDistributorClient = {
      get_user_stats: vi.fn(),
      get_token_stats: vi.fn(),
      get_distribution_history: vi.fn(),
      set_protocol_fee: vi.fn(),
    };

    // Mock the Client constructors
    (ContractClient as any).mockImplementation(() => mockPaymentClient);
    (DistributorContractClient as any).mockImplementation(() => mockDistributorClient);

    // Create clients
    paymentStreamClient = new PaymentStreamClient({
      rpcUrl: "https://soroban-testnet.stellar.org",
      contractId: "test-contract-id",
    });

    distributorClient = new DistributorClient({
      rpcUrl: "https://soroban-testnet.stellar.org",
      contractId: "test-distributor-id",
    });
  });

  describe("PaymentStreamClient - Single Parameter Methods", () => {
    const streamId = 123n;

    it("withdrawMax accepts individual parameters", async () => {
      const mockResult = { signAndSend: vi.fn() };
      mockPaymentClient.withdraw_max.mockResolvedValue(mockResult);

      const result = await paymentStreamClient.withdrawMax(streamId);

      expect(mockPaymentClient.withdraw_max).toHaveBeenCalledWith({ stream_id: streamId });
      expect(result).toBe(mockResult);
    });

    it("withdrawMax accepts object parameter", async () => {
      const mockResult = { signAndSend: vi.fn() };
      mockPaymentClient.withdraw_max.mockResolvedValue(mockResult);

      const result = await paymentStreamClient.withdrawMax({ streamId });

      expect(mockPaymentClient.withdraw_max).toHaveBeenCalledWith({ stream_id: streamId });
      expect(result).toBe(mockResult);
    });

    it("pauseStream accepts individual parameters", async () => {
      const mockResult = { signAndSend: vi.fn() };
      mockPaymentClient.pause_stream.mockResolvedValue(mockResult);

      const result = await paymentStreamClient.pauseStream(streamId);

      expect(mockPaymentClient.pause_stream).toHaveBeenCalledWith({ stream_id: streamId });
      expect(result).toBe(mockResult);
    });

    it("pauseStream accepts object parameter", async () => {
      const mockResult = { signAndSend: vi.fn() };
      mockPaymentClient.pause_stream.mockResolvedValue(mockResult);

      const result = await paymentStreamClient.pauseStream({ streamId });

      expect(mockPaymentClient.pause_stream).toHaveBeenCalledWith({ stream_id: streamId });
      expect(result).toBe(mockResult);
    });

    it("getStream accepts individual parameters", async () => {
      const mockResult = { signAndSend: vi.fn() };
      mockPaymentClient.get_stream.mockResolvedValue(mockResult);

      const result = await paymentStreamClient.getStream(streamId);

      expect(mockPaymentClient.get_stream).toHaveBeenCalledWith({ stream_id: streamId });
      expect(result).toBe(mockResult);
    });

    it("getStream accepts object parameter", async () => {
      const mockResult = { signAndSend: vi.fn() };
      mockPaymentClient.get_stream.mockResolvedValue(mockResult);

      const result = await paymentStreamClient.getStream({ streamId });

      expect(mockPaymentClient.get_stream).toHaveBeenCalledWith({ stream_id: streamId });
      expect(result).toBe(mockResult);
    });
  });

  describe("PaymentStreamClient - Two Parameter Methods", () => {
    const streamId = 123n;
    const amount = 1000n;
    const delegate = "delegate-address";

    it("deposit accepts individual parameters", async () => {
      const mockResult = { signAndSend: vi.fn() };
      mockPaymentClient.deposit.mockResolvedValue(mockResult);

      const result = await paymentStreamClient.deposit(streamId, amount);

      expect(mockPaymentClient.deposit).toHaveBeenCalledWith({ stream_id: streamId, amount });
      expect(result).toBe(mockResult);
    });

    it("deposit accepts object parameter", async () => {
      const mockResult = { signAndSend: vi.fn() };
      mockPaymentClient.deposit.mockResolvedValue(mockResult);

      const result = await paymentStreamClient.deposit({ streamId, amount });

      expect(mockPaymentClient.deposit).toHaveBeenCalledWith({ stream_id: streamId, amount });
      expect(result).toBe(mockResult);
    });

    it("withdraw accepts individual parameters", async () => {
      const mockResult = { signAndSend: vi.fn() };
      mockPaymentClient.withdraw.mockResolvedValue(mockResult);

      const result = await paymentStreamClient.withdraw(streamId, amount);

      expect(mockPaymentClient.withdraw).toHaveBeenCalledWith({ stream_id: streamId, amount });
      expect(result).toBe(mockResult);
    });

    it("withdraw accepts object parameter", async () => {
      const mockResult = { signAndSend: vi.fn() };
      mockPaymentClient.withdraw.mockResolvedValue(mockResult);

      const result = await paymentStreamClient.withdraw({ streamId, amount });

      expect(mockPaymentClient.withdraw).toHaveBeenCalledWith({ stream_id: streamId, amount });
      expect(result).toBe(mockResult);
    });

    it("setDelegate accepts individual parameters", async () => {
      const mockResult = { signAndSend: vi.fn() };
      mockPaymentClient.set_delegate.mockResolvedValue(mockResult);

      const result = await paymentStreamClient.setDelegate(streamId, delegate);

      expect(mockPaymentClient.set_delegate).toHaveBeenCalledWith({ stream_id: streamId, delegate });
      expect(result).toBe(mockResult);
    });

    it("setDelegate accepts object parameter", async () => {
      const mockResult = { signAndSend: vi.fn() };
      mockPaymentClient.set_delegate.mockResolvedValue(mockResult);

      const result = await paymentStreamClient.setDelegate({ streamId, delegate });

      expect(mockPaymentClient.set_delegate).toHaveBeenCalledWith({ stream_id: streamId, delegate });
      expect(result).toBe(mockResult);
    });
  });

  describe("DistributorClient - Single Parameter Methods", () => {
    const user = "user-address";
    const token = "token-address";

    it("getUserStats accepts individual parameters", async () => {
      const mockResult = { signAndSend: vi.fn() };
      mockDistributorClient.get_user_stats.mockResolvedValue(mockResult);

      const result = await distributorClient.getUserStats(user);

      expect(mockDistributorClient.get_user_stats).toHaveBeenCalledWith({ user });
      expect(result).toBe(mockResult);
    });

    it("getUserStats accepts object parameter", async () => {
      const mockResult = { signAndSend: vi.fn() };
      mockDistributorClient.get_user_stats.mockResolvedValue(mockResult);

      const result = await distributorClient.getUserStats({ user });

      expect(mockDistributorClient.get_user_stats).toHaveBeenCalledWith({ user });
      expect(result).toBe(mockResult);
    });

    it("getTokenStats accepts individual parameters", async () => {
      const mockResult = { signAndSend: vi.fn() };
      mockDistributorClient.get_token_stats.mockResolvedValue(mockResult);

      const result = await distributorClient.getTokenStats(token);

      expect(mockDistributorClient.get_token_stats).toHaveBeenCalledWith({ token });
      expect(result).toBe(mockResult);
    });

    it("getTokenStats accepts object parameter", async () => {
      const mockResult = { signAndSend: vi.fn() };
      mockDistributorClient.get_token_stats.mockResolvedValue(mockResult);

      const result = await distributorClient.getTokenStats({ token });

      expect(mockDistributorClient.get_token_stats).toHaveBeenCalledWith({ token });
      expect(result).toBe(mockResult);
    });
  });

  describe("DistributorClient - Two Parameter Methods", () => {
    const startId = 100n;
    const limit = 50n;
    const admin = "admin-address";
    const newFeePercent = 5;

    it("getDistributionHistory accepts individual parameters", async () => {
      const mockResult = { signAndSend: vi.fn() };
      mockDistributorClient.get_distribution_history.mockResolvedValue(mockResult);

      const result = await distributorClient.getDistributionHistory(startId, limit);

      expect(mockDistributorClient.get_distribution_history).toHaveBeenCalledWith({
        start_id: startId,
        limit,
      });
      expect(result).toBe(mockResult);
    });

    it("getDistributionHistory accepts object parameter", async () => {
      const mockResult = { signAndSend: vi.fn() };
      mockDistributorClient.get_distribution_history.mockResolvedValue(mockResult);

      const result = await distributorClient.getDistributionHistory({ startId, limit });

      expect(mockDistributorClient.get_distribution_history).toHaveBeenCalledWith({
        start_id: startId,
        limit,
      });
      expect(result).toBe(mockResult);
    });

    it("setProtocolFee accepts individual parameters", async () => {
      const mockResult = { signAndSend: vi.fn() };
      mockDistributorClient.set_protocol_fee.mockResolvedValue(mockResult);

      const result = await distributorClient.setProtocolFee(admin, newFeePercent);

      expect(mockDistributorClient.set_protocol_fee).toHaveBeenCalledWith({
        admin,
        new_fee_percent: newFeePercent,
      });
      expect(result).toBe(mockResult);
    });

    it("setProtocolFee accepts object parameter", async () => {
      const mockResult = { signAndSend: vi.fn() };
      mockDistributorClient.set_protocol_fee.mockResolvedValue(mockResult);

      const result = await distributorClient.setProtocolFee({ admin, newFeePercent });

      expect(mockDistributorClient.set_protocol_fee).toHaveBeenCalledWith({
        admin,
        new_fee_percent: newFeePercent,
      });
      expect(result).toBe(mockResult);
    });
  });
});