import { describe, it, expect, vi, beforeEach } from "vitest";
import { PaymentStreamClient } from "../PaymentStreamClient.js";
import { DistributorClient } from "../DistributorClient.js";

// Mock the generated contract clients
const mockTx = (result: unknown = undefined) => ({
  result,
  signAndSend: vi.fn(),
});

const mockPaymentContractClient = {
  get_delegate: vi.fn(),
};

const mockDistributorContractClient = {
  get_admin: vi.fn(),
  get_user_stats: vi.fn(),
  get_token_stats: vi.fn(),
};

vi.mock("../generated/payment-stream/src/index.js", () => ({
  Client: vi.fn().mockImplementation(() => mockPaymentContractClient),
}));

vi.mock("../generated/distributor/src/index.js", () => ({
  Client: vi.fn().mockImplementation(() => mockDistributorContractClient),
}));

const VALID_OPTIONS = {
  contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
  networkPassphrase: "Test SDF Network ; September 2015",
  rpcUrl: "https://soroban-testnet.stellar.org",
};

describe("SDK Type Safety", () => {
  describe("PaymentStreamClient", () => {
    let client: PaymentStreamClient;

    beforeEach(() => {
      vi.clearAllMocks();
      client = new PaymentStreamClient(VALID_OPTIONS);
    });

    it("getDelegate returns undefined when contract returns None (undefined)", async () => {
      mockPaymentContractClient.get_delegate.mockResolvedValue(mockTx(undefined));
      const tx = await client.getDelegate(1n);
      
      // Runtime check
      expect(tx.result).toBeUndefined();
      
      // Type check (checked at compile time, but we can verify shape here)
      const result: string | undefined = tx.result;
      expect(result).toBeUndefined();
    });

    it("getDelegate returns string when contract returns Some (string)", async () => {
      const DELEGATE = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
      mockPaymentContractClient.get_delegate.mockResolvedValue(mockTx(DELEGATE));
      const tx = await client.getDelegate(1n);
      
      expect(tx.result).toBe(DELEGATE);
      const result: string | undefined = tx.result;
      expect(result).toBe(DELEGATE);
    });
  });

  describe("DistributorClient", () => {
    let client: DistributorClient;

    beforeEach(() => {
      vi.clearAllMocks();
      client = new DistributorClient(VALID_OPTIONS);
    });

    it("getAdmin handles nullable return", async () => {
      const ADMIN = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
      mockDistributorContractClient.get_admin.mockResolvedValue(mockTx(ADMIN));
      const tx = await client.getAdmin();
      expect(tx.result).toBe(ADMIN);

      mockDistributorContractClient.get_admin.mockResolvedValue(mockTx(undefined));
      const txNull = await client.getAdmin();
      expect(txNull.result).toBeUndefined();
    });

    it("getUserStats handles nullable return", async () => {
      const stats = { distributions_initiated: 5, total_amount: 1000n };
      mockDistributorContractClient.get_user_stats.mockResolvedValue(mockTx(stats));
      const tx = await client.getUserStats("GAAA");
      expect(tx.result).toEqual(stats);

      mockDistributorContractClient.get_user_stats.mockResolvedValue(mockTx(undefined));
      const txNull = await client.getUserStats("GAAA");
      expect(txNull.result).toBeUndefined();
    });

    it("getTokenStats handles nullable return", async () => {
      const stats = { distribution_count: 10, last_time: 123456n, total_amount: 5000n };
      mockDistributorContractClient.get_token_stats.mockResolvedValue(mockTx(stats));
      const tx = await client.getTokenStats("CAAA");
      expect(tx.result).toEqual(stats);

      mockDistributorContractClient.get_token_stats.mockResolvedValue(mockTx(undefined));
      const txNull = await client.getTokenStats("CAAA");
      expect(txNull.result).toBeUndefined();
    });
  });
});
