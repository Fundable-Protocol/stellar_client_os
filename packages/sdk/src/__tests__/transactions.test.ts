import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SorobanRpc } from "@stellar/stellar-sdk";
import {
  waitForTransaction,
  signAndWait,
  type TransactionWaitResult,
  type WaitForTransactionOptions,
} from "../transactions";

/**
 * Mock AssembledTransaction for testing
 */
function createMockAssembledTx<T = unknown>(result?: T, hash?: string) {
  return {
    hash: hash || "abc123def456",
    result,
    signAndSend: vi.fn(),
  } as any;
}

/**
 * Mock SorobanRpc.Server methods
 */
const mockGetTransaction = vi.fn();

vi.mock("@stellar/stellar-sdk", async () => {
  const actual = await vi.importActual("@stellar/stellar-sdk");
  return {
    ...actual,
    SorobanRpc: {
      ...actual.SorobanRpc,
      Server: vi.fn().mockImplementation(() => ({
        getTransaction: mockGetTransaction,
      })),
      GetTransactionStatus: {
        SUCCESS: "SUCCESS",
        FAILED: "FAILED",
        PENDING: "PENDING",
        NOT_FOUND: "NOT_FOUND",
      },
    },
  };
});

describe("waitForTransaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("success cases", () => {
    it("resolves when transaction reaches SUCCESS status", async () => {
      const tx = createMockAssembledTx(42n, "txhash123");
      mockGetTransaction.mockResolvedValue({
        status: SorobanRpc.GetTransactionStatus.SUCCESS,
        ledger: 12345,
      });

      const result = await waitForTransaction(tx, "https://soroban-testnet.stellar.org");

      expect(result.hash).toBe("txhash123");
      expect(result.ledger).toBe(12345);
      expect(result.result).toBe(42n);
    });

    it("polls multiple times before reaching SUCCESS", async () => {
      const tx = createMockAssembledTx(100n, "txhash456");

      // First call returns PENDING, second returns PENDING, third returns SUCCESS
      mockGetTransaction
        .mockResolvedValueOnce({
          status: SorobanRpc.GetTransactionStatus.PENDING,
        })
        .mockResolvedValueOnce({
          status: SorobanRpc.GetTransactionStatus.PENDING,
        })
        .mockResolvedValueOnce({
          status: SorobanRpc.GetTransactionStatus.SUCCESS,
          ledger: 54321,
        });

      vi.useFakeTimers();
      const promise = waitForTransaction(tx, "https://test-rpc.stellardev.com", {
        pollInterval: 100,
      });

      // Advance timers to trigger polls
      await vi.runAllTimersAsync();
      vi.useRealTimers();

      const result = await promise;

      expect(result.hash).toBe("txhash456");
      expect(result.ledger).toBe(54321);
      expect(result.result).toBe(100n);
      expect(mockGetTransaction).toHaveBeenCalledTimes(3);
    });

    it("handles custom poll interval", async () => {
      const tx = createMockAssembledTx(null, "txdemo");
      mockGetTransaction.mockResolvedValueOnce({
        status: SorobanRpc.GetTransactionStatus.PENDING,
      });
      mockGetTransaction.mockResolvedValueOnce({
        status: SorobanRpc.GetTransactionStatus.SUCCESS,
        ledger: 9999,
      });

      vi.useFakeTimers();
      const promise = waitForTransaction(tx, "https://test.stellar.org", {
        pollInterval: 500,
      });

      // Verify first poll is immediate
      expect(mockGetTransaction).toHaveBeenCalledTimes(1);

      await vi.runAllTimersAsync();
      vi.useRealTimers();

      const result = await promise;
      expect(result.ledger).toBe(9999);
    });

    it("invokes onPoll callback on each attempt", async () => {
      const tx = createMockAssembledTx(null, "txcallback");
      const onPoll = vi.fn();

      mockGetTransaction
        .mockResolvedValueOnce({
          status: SorobanRpc.GetTransactionStatus.PENDING,
        })
        .mockResolvedValueOnce({
          status: SorobanRpc.GetTransactionStatus.SUCCESS,
          ledger: 7777,
        });

      vi.useFakeTimers();
      const promise = waitForTransaction(tx, "https://test.stellar.org", {
        pollInterval: 100,
        onPoll,
      });

      await vi.runAllTimersAsync();
      vi.useRealTimers();

      await promise;

      expect(onPoll).toHaveBeenCalledTimes(2);
      // First call should have attempt=1 and elapsedMs>=0
      expect(onPoll).toHaveBeenNthCalledWith(1, 1, expect.any(Number));
      // Second call should have attempt=2 and elapsedMs >= pollInterval
      expect(onPoll).toHaveBeenNthCalledWith(2, 2, expect.any(Number));
    });
  });

  describe("error cases", () => {
    it("throws when transaction has not been sent", async () => {
      const tx = { hash: undefined, result: null } as any;

      await expect(waitForTransaction(tx, "https://test.stellar.org")).rejects.toThrow(
        "Transaction has not been signed and sent",
      );
    });

    it("throws when transaction FAILED status is returned", async () => {
      const tx = createMockAssembledTx(null, "txfailed");
      mockGetTransaction.mockResolvedValue({
        status: SorobanRpc.GetTransactionStatus.FAILED,
        ledger: 11111,
      });

      await expect(
        waitForTransaction(tx, "https://test.stellar.org", { timeout: 5000 }),
      ).rejects.toThrow("Transaction failed on ledger 11111");
    });

    it("throws timeout error when exceeding timeout duration", async () => {
      const tx = createMockAssembledTx(null, "txtimeout");

      // Always return PENDING to simulate never confirming
      mockGetTransaction.mockResolvedValue({
        status: SorobanRpc.GetTransactionStatus.PENDING,
      });

      vi.useFakeTimers();
      const promise = waitForTransaction(tx, "https://test.stellar.org", {
        timeout: 2000,
        pollInterval: 500,
      });

      await vi.runAllTimersAsync();
      vi.useRealTimers();

      await expect(promise).rejects.toThrow(/Transaction confirmation timeout after 2000ms/);
    });

    it("includes transaction hash in timeout error message", async () => {
      const txHash = "specific-tx-hash-12345";
      const tx = createMockAssembledTx(null, txHash);

      mockGetTransaction.mockResolvedValue({
        status: SorobanRpc.GetTransactionStatus.PENDING,
      });

      vi.useFakeTimers();
      const promise = waitForTransaction(tx, "https://test.stellar.org", {
        timeout: 1000,
        pollInterval: 300,
      });

      await vi.runAllTimersAsync();
      vi.useRealTimers();

      await expect(promise).rejects.toThrow(txHash);
    });

    it("handles RPC not found errors gracefully", async () => {
      const tx = createMockAssembledTx(null, "txnotfound");

      // First call throws "not found", second succeeds
      mockGetTransaction
        .mockRejectedValueOnce(new Error("not found"))
        .mockResolvedValueOnce({
          status: SorobanRpc.GetTransactionStatus.SUCCESS,
          ledger: 6666,
        });

      vi.useFakeTimers();
      const promise = waitForTransaction(tx, "https://test.stellar.org", {
        pollInterval: 100,
      });

      await vi.runAllTimersAsync();
      vi.useRealTimers();

      const result = await promise;
      expect(result.ledger).toBe(6666);
    });

    it("throws on unexpected RPC errors", async () => {
      const tx = createMockAssembledTx(null, "txerror");

      mockGetTransaction.mockRejectedValue(
        new Error("Network connection failed"),
      );

      await expect(
        waitForTransaction(tx, "https://test.stellar.org", { timeout: 5000 }),
      ).rejects.toThrow("Error polling transaction status");
    });
  });

  describe("configuration", () => {
    it("uses default timeout of 60 seconds", async () => {
      const tx = createMockAssembledTx(null, "txdefault");

      mockGetTransaction.mockResolvedValue({
        status: SorobanRpc.GetTransactionStatus.PENDING,
      });

      vi.useFakeTimers();
      const promise = waitForTransaction(tx, "https://test.stellar.org", {
        pollInterval: 1000,
      });

      // Simulate advancing time just past 60 seconds
      vi.advanceTimersByTime(61000);
      vi.useRealTimers();

      await expect(promise).rejects.toThrow("timeout");
    });

    it("respects custom timeout value", async () => {
      const tx = createMockAssembledTx(null, "txcustom");

      mockGetTransaction.mockResolvedValue({
        status: SorobanRpc.GetTransactionStatus.PENDING,
      });

      vi.useFakeTimers();
      const promise = waitForTransaction(tx, "https://test.stellar.org", {
        timeout: 5000,
        pollInterval: 1000,
      });

      vi.advanceTimersByTime(5500);
      vi.useRealTimers();

      await expect(promise).rejects.toThrow("timeout");
    });

    it("uses default poll interval of 1 second", async () => {
      const tx = createMockAssembledTx(null, "txpoll");
      const onPoll = vi.fn();

      mockGetTransaction
        .mockResolvedValueOnce({
          status: SorobanRpc.GetTransactionStatus.PENDING,
        })
        .mockResolvedValueOnce({
          status: SorobanRpc.GetTransactionStatus.SUCCESS,
          ledger: 1234,
        });

      vi.useFakeTimers();
      const promise = waitForTransaction(tx, "https://test.stellar.org", {
        onPoll,
      });

      await vi.runAllTimersAsync();
      vi.useRealTimers();

      await promise;

      // Should have polled twice (once initially, once after 1s delay)
      expect(mockGetTransaction).toHaveBeenCalledTimes(2);
    });
  });

  describe("result preservation", () => {
    it("preserves bigint results", async () => {
      const streamId = 999999n;
      const tx = createMockAssembledTx(streamId, "txbigint");

      mockGetTransaction.mockResolvedValue({
        status: SorobanRpc.GetTransactionStatus.SUCCESS,
        ledger: 4444,
      });

      const result = await waitForTransaction(tx, "https://test.stellar.org");

      expect(result.result).toBe(streamId);
      expect(typeof result.result).toBe("bigint");
    });

    it("preserves null results", async () => {
      const tx = createMockAssembledTx(null, "txnull");

      mockGetTransaction.mockResolvedValue({
        status: SorobanRpc.GetTransactionStatus.SUCCESS,
        ledger: 5555,
      });

      const result = await waitForTransaction(tx, "https://test.stellar.org");

      expect(result.result).toBeNull();
    });

    it("preserves complex object results", async () => {
      const complexResult = {
        id: 123n,
        data: { nested: { value: "test" } },
      };
      const tx = createMockAssembledTx(complexResult, "txcomplex");

      mockGetTransaction.mockResolvedValue({
        status: SorobanRpc.GetTransactionStatus.SUCCESS,
        ledger: 6666,
      });

      const result = await waitForTransaction(tx, "https://test.stellar.org");

      expect(result.result).toEqual(complexResult);
    });
  });
});

describe("signAndWait", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("signs, sends, and waits for transaction in sequence", async () => {
    const tx = createMockAssembledTx(42n, "txsignwait");
    const signer = vi.fn().mockResolvedValue("signed-xdr-data");

    mockGetTransaction.mockResolvedValue({
      status: SorobanRpc.GetTransactionStatus.SUCCESS,
      ledger: 8888,
    });

    const result = await signAndWait(
      tx,
      "https://test.stellar.org",
      signer,
      { timeout: 5000 },
    );

    // Verify signing was called
    expect(tx.signAndSend).toHaveBeenCalledWith(
      expect.objectContaining({
        signTransaction: expect.any(Function),
      }),
    );

    // Verify waiting occurred
    expect(mockGetTransaction).toHaveBeenCalled();

    // Verify result
    expect(result.hash).toBe("txsignwait");
    expect(result.ledger).toBe(8888);
    expect(result.result).toBe(42n);
  });

  it("propagates signer errors", async () => {
    const tx = createMockAssembledTx(null, "txsignfail");
    const signerError = new Error("Wallet rejected transaction");
    const signer = vi.fn().mockRejectedValue(signerError);

    await expect(
      signAndWait(tx, "https://test.stellar.org", signer),
    ).rejects.toThrow("Wallet rejected transaction");

    // signAndSend should have been called
    expect(tx.signAndSend).toHaveBeenCalled();
  });

  it("respects wait configuration options", async () => {
    const tx = createMockAssembledTx(null, "txconfig");
    const signer = vi.fn().mockResolvedValue("signed");
    const onPoll = vi.fn();

    mockGetTransaction
      .mockResolvedValueOnce({
        status: SorobanRpc.GetTransactionStatus.PENDING,
      })
      .mockResolvedValueOnce({
        status: SorobanRpc.GetTransactionStatus.SUCCESS,
        ledger: 9999,
      });

    vi.useFakeTimers();
    const promise = signAndWait(
      tx,
      "https://test.stellar.org",
      signer,
      {
        timeout: 10000,
        pollInterval: 500,
        onPoll,
      },
    );

    await vi.runAllTimersAsync();
    vi.useRealTimers();

    const result = await promise;

    expect(result.ledger).toBe(9999);
    expect(onPoll).toHaveBeenCalled();
  });

  it("waits for transaction even if signing completes immediately", async () => {
    const tx = createMockAssembledTx(123n, "txwait");
    const signer = vi.fn().mockResolvedValue("signed");

    // Simulate a delay before transaction appears on-chain
    mockGetTransaction
      .mockRejectedValueOnce(new Error("not found"))
      .mockResolvedValueOnce({
        status: SorobanRpc.GetTransactionStatus.SUCCESS,
        ledger: 3333,
      });

    vi.useFakeTimers();
    const promise = signAndWait(
      tx,
      "https://test.stellar.org",
      signer,
      { pollInterval: 500 },
    );

    await vi.runAllTimersAsync();
    vi.useRealTimers();

    const result = await promise;

    expect(result.result).toBe(123n);
    expect(result.ledger).toBe(3333);
  });
});
