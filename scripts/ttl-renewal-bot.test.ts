// @vitest-environment node
/**
 * Unit tests for the Soroban Contract Storage TTL Renewal Bot — issue #536
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Keypair, Networks, xdr, Address } from "@stellar/stellar-sdk";
import {
  loadConfig,
  log,
  getCurrentLedger,
  inspectContractTtl,
  bumpContractTtl,
  runScanCycle,
  contractInstanceLedgerKey,
  TtlBotError,
  type BotConfig,
  type ContractTtlStatus,
} from "./ttl-renewal-bot";

// ── Mock Stellar SDK ──────────────────────────────────────────────────────────

const mockGetLatestLedger = vi.fn();
const mockGetLedgerEntries = vi.fn();
const mockGetAccount = vi.fn();
const mockSimulateTransaction = vi.fn();
const mockSendTransaction = vi.fn();
const mockGetTransaction = vi.fn();

vi.mock("@stellar/stellar-sdk/rpc", () => ({
  Server: vi.fn().mockImplementation(() => ({
    getLatestLedger: mockGetLatestLedger,
    getLedgerEntries: mockGetLedgerEntries,
    getAccount: mockGetAccount,
    simulateTransaction: mockSimulateTransaction,
    sendTransaction: mockSendTransaction,
    getTransaction: mockGetTransaction,
  })),
  assembleTransaction: vi.fn().mockImplementation((tx) => ({
    build: vi.fn().mockReturnValue({
      sign: vi.fn(),
      toXDR: vi.fn().mockReturnValue("mocked_xdr"),
    }),
  })),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const VALID_CONTRACT_ID = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4";
const VALID_SECRET_KEY = Keypair.random().secret();
const CURRENT_LEDGER = 1_000_000;
const FAR_EXPIRY = CURRENT_LEDGER + 600_000;   // well above any threshold
const NEAR_EXPIRY = CURRENT_LEDGER + 30_000;   // below default threshold (50k)
const EXPIRED_LEDGER = CURRENT_LEDGER - 1;    // already expired

function makeBotConfig(overrides?: Partial<BotConfig>): BotConfig {
  return {
    rpcUrl: "https://soroban-testnet.stellar.org",
    networkPassphrase: Networks.TESTNET,
    botKeypair: Keypair.fromSecret(VALID_SECRET_KEY),
    contractIds: [VALID_CONTRACT_ID],
    warningThresholdLedgers: 50_000,
    extendToLedgers: 500_000,
    pollIntervalSeconds: 300,
    maxRetries: 3,
    dryRun: false,
    ...overrides,
  };
}

/** Minimal mock ledger entry with a given expiration ledger. */
function mockLedgerEntry(expirationLedger: number) {
  return {
    liveUntilLedgerSeq: expirationLedger,
    val: {
      contractData: () => ({
        val: () => ({
          switch: () => ({ name: "other" }), // non-instance branch
        }),
      }),
    },
  };
}

// ── Environment helpers ───────────────────────────────────────────────────────

const originalEnv = { ...process.env };

function setEnv(vars: Record<string, string>): void {
  Object.assign(process.env, vars);
}

function resetEnv(): void {
  // Remove test keys
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
}

beforeEach(() => {
  vi.clearAllMocks();
  resetEnv();
});

afterEach(() => {
  resetEnv();
});

// ── loadConfig ────────────────────────────────────────────────────────────────

describe("loadConfig", () => {
  it("throws CONFIG_ERROR when BOT_SECRET_KEY is missing", () => {
    setEnv({ CONTRACT_IDS: VALID_CONTRACT_ID });
    expect(() => loadConfig()).toThrowError(TtlBotError);
    try { loadConfig(); } catch (e) {
      expect((e as TtlBotError).code).toBe("CONFIG_ERROR");
    }
  });

  it("throws CONFIG_ERROR when CONTRACT_IDS is missing", () => {
    setEnv({ BOT_SECRET_KEY: VALID_SECRET_KEY });
    expect(() => loadConfig()).toThrowError(TtlBotError);
  });

  it("throws CONFIG_ERROR for an invalid secret key", () => {
    setEnv({ BOT_SECRET_KEY: "not-a-valid-key", CONTRACT_IDS: VALID_CONTRACT_ID });
    expect(() => loadConfig()).toThrowError(TtlBotError);
  });

  it("throws CONFIG_ERROR for an invalid contract ID format", () => {
    setEnv({ BOT_SECRET_KEY: VALID_SECRET_KEY, CONTRACT_IDS: "GNOTACONTRACT" });
    expect(() => loadConfig()).toThrowError(TtlBotError);
  });

  it("throws CONFIG_ERROR for an empty CONTRACT_IDS string", () => {
    setEnv({ BOT_SECRET_KEY: VALID_SECRET_KEY, CONTRACT_IDS: ",,," });
    expect(() => loadConfig()).toThrowError(TtlBotError);
  });

  it("loads config with valid env vars and applies defaults", () => {
    setEnv({ BOT_SECRET_KEY: VALID_SECRET_KEY, CONTRACT_IDS: VALID_CONTRACT_ID });
    const config = loadConfig();
    expect(config.contractIds).toEqual([VALID_CONTRACT_ID]);
    expect(config.warningThresholdLedgers).toBe(50_000);
    expect(config.extendToLedgers).toBe(500_000);
    expect(config.pollIntervalSeconds).toBe(300);
    expect(config.dryRun).toBe(false);
    expect(config.rpcUrl).toBe("https://soroban-testnet.stellar.org");
  });

  it("respects env var overrides", () => {
    setEnv({
      BOT_SECRET_KEY: VALID_SECRET_KEY,
      CONTRACT_IDS: VALID_CONTRACT_ID,
      WARNING_THRESHOLD_LEDGERS: "20000",
      EXTEND_TO_LEDGERS: "300000",
      POLL_INTERVAL_SECONDS: "60",
      DRY_RUN: "true",
      MAX_RETRIES: "5",
    });
    const config = loadConfig();
    expect(config.warningThresholdLedgers).toBe(20_000);
    expect(config.extendToLedgers).toBe(300_000);
    expect(config.pollIntervalSeconds).toBe(60);
    expect(config.dryRun).toBe(true);
    expect(config.maxRetries).toBe(5);
  });

  it("handles multiple contract IDs with whitespace", () => {
    const c2 = "CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB4";
    setEnv({
      BOT_SECRET_KEY: VALID_SECRET_KEY,
      CONTRACT_IDS: ` ${VALID_CONTRACT_ID} , ${c2} `,
    });
    const config = loadConfig();
    expect(config.contractIds).toHaveLength(2);
    expect(config.contractIds[0]).toBe(VALID_CONTRACT_ID);
    expect(config.contractIds[1]).toBe(c2);
  });
});

// ── log ───────────────────────────────────────────────────────────────────────

describe("log", () => {
  it("emits JSON to stdout for info messages", () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    log("info", "test message", { key: "val" });
    expect(spy).toHaveBeenCalledOnce();
    const line = spy.mock.calls[0][0] as string;
    const parsed = JSON.parse(line);
    expect(parsed.level).toBe("info");
    expect(parsed.message).toBe("test message");
    expect(parsed.key).toBe("val");
    expect(parsed.service).toBe("ttl-renewal-bot");
    spy.mockRestore();
  });

  it("emits JSON to stderr for error messages", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    log("error", "boom");
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });

  it("emits JSON to stderr for warn messages", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    log("warn", "warning");
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });
});

// ── getCurrentLedger ──────────────────────────────────────────────────────────

describe("getCurrentLedger", () => {
  it("returns the current ledger sequence", async () => {
    const { Server } = await import("@stellar/stellar-sdk/rpc");
    const rpc = new Server("https://example.com");
    mockGetLatestLedger.mockResolvedValueOnce({ sequence: CURRENT_LEDGER });
    const result = await getCurrentLedger(rpc as any);
    expect(result).toBe(CURRENT_LEDGER);
  });

  it("throws RPC_ERROR on network failure", async () => {
    const { Server } = await import("@stellar/stellar-sdk/rpc");
    const rpc = new Server("https://example.com");
    mockGetLatestLedger.mockRejectedValueOnce(new Error("Connection refused"));
    await expect(getCurrentLedger(rpc as any)).rejects.toMatchObject({
      code: "RPC_ERROR",
    });
  });
});

// ── contractInstanceLedgerKey ─────────────────────────────────────────────────

describe("contractInstanceLedgerKey", () => {
  it("returns an xdr.LedgerKey", () => {
    const key = contractInstanceLedgerKey(VALID_CONTRACT_ID);
    expect(key).toBeInstanceOf(xdr.LedgerKey);
  });

  it("is deterministic for the same contract ID", () => {
    const k1 = contractInstanceLedgerKey(VALID_CONTRACT_ID);
    const k2 = contractInstanceLedgerKey(VALID_CONTRACT_ID);
    expect(k1.toXDR("base64")).toBe(k2.toXDR("base64"));
  });
});

// ── inspectContractTtl ────────────────────────────────────────────────────────

describe("inspectContractTtl", () => {
  it("returns correct status when instance entry exists with far expiry", async () => {
    const { Server } = await import("@stellar/stellar-sdk/rpc");
    const rpc = new Server("https://example.com");
    mockGetLedgerEntries.mockResolvedValue({
      entries: [mockLedgerEntry(FAR_EXPIRY)],
    });

    const status = await inspectContractTtl(rpc as any, VALID_CONTRACT_ID, CURRENT_LEDGER);
    expect(status.contractId).toBe(VALID_CONTRACT_ID);
    expect(status.currentLedger).toBe(CURRENT_LEDGER);
    expect(status.instanceExpirationLedger).toBe(FAR_EXPIRY);
    expect(status.remainingLedgers).toBe(FAR_EXPIRY - CURRENT_LEDGER);
    expect(status.needsBump).toBe(false);
  });

  it("returns null expiry values when no entries found", async () => {
    const { Server } = await import("@stellar/stellar-sdk/rpc");
    const rpc = new Server("https://example.com");
    mockGetLedgerEntries.mockResolvedValue({ entries: [] });

    const status = await inspectContractTtl(rpc as any, VALID_CONTRACT_ID, CURRENT_LEDGER);
    expect(status.instanceExpirationLedger).toBeNull();
    expect(status.remainingLedgers).toBeNull();
  });

  it("throws LEDGER_ENTRY_ERROR on RPC failure", async () => {
    const { Server } = await import("@stellar/stellar-sdk/rpc");
    const rpc = new Server("https://example.com");
    mockGetLedgerEntries.mockRejectedValue(new Error("RPC timeout"));

    await expect(
      inspectContractTtl(rpc as any, VALID_CONTRACT_ID, CURRENT_LEDGER)
    ).rejects.toMatchObject({ code: "LEDGER_ENTRY_ERROR" });
  });
});

// ── bumpContractTtl ───────────────────────────────────────────────────────────

describe("bumpContractTtl", () => {
  it("returns success:true with dryRun:true and no txHash in dry-run mode", async () => {
    const { Server } = await import("@stellar/stellar-sdk/rpc");
    const rpc = new Server("https://example.com");
    const config = makeBotConfig({ dryRun: true });
    const result = await bumpContractTtl(rpc as any, config, VALID_CONTRACT_ID);
    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.txHash).toBeNull();
    expect(mockSendTransaction).not.toHaveBeenCalled();
  });

  it("returns success:true when transaction confirms", async () => {
    const { Server } = await import("@stellar/stellar-sdk/rpc");
    const rpc = new Server("https://example.com");

    mockGetAccount.mockResolvedValue({ id: "GABC", sequence: "0" });
    mockSimulateTransaction.mockResolvedValue({
      minResourceFee: "100",
      transactionData: "mocked",
      results: [{ auth: [], xdr: "mocked" }],
    });
    mockSendTransaction.mockResolvedValue({ status: "PENDING", hash: "txhash123" });
    mockGetTransaction.mockResolvedValue({ status: "SUCCESS" });

    const config = makeBotConfig({ dryRun: false, maxRetries: 1 });
    const result = await bumpContractTtl(rpc as any, config, VALID_CONTRACT_ID);
    expect(result.success).toBe(true);
    expect(result.txHash).toBe("txhash123");
    expect(result.error).toBeNull();
  });

  it("returns success:false after all retries exhausted", async () => {
    const { Server } = await import("@stellar/stellar-sdk/rpc");
    const rpc = new Server("https://example.com");

    mockGetAccount.mockRejectedValue(new Error("Network error"));

    const config = makeBotConfig({ dryRun: false, maxRetries: 2 });
    const result = await bumpContractTtl(rpc as any, config, VALID_CONTRACT_ID);
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.txHash).toBeNull();
  });

  it("returns success:false when transaction submission returns ERROR", async () => {
    const { Server } = await import("@stellar/stellar-sdk/rpc");
    const rpc = new Server("https://example.com");

    mockGetAccount.mockResolvedValue({ id: "GABC", sequence: "0" });
    mockSimulateTransaction.mockResolvedValue({
      minResourceFee: "100",
      transactionData: "mocked",
      results: [],
    });
    mockSendTransaction.mockResolvedValue({ status: "ERROR", errorResult: { result: () => ({ switch: () => ({ name: "txFailed" }) }) } });

    const config = makeBotConfig({ dryRun: false, maxRetries: 1 });
    const result = await bumpContractTtl(rpc as any, config, VALID_CONTRACT_ID);
    expect(result.success).toBe(false);
  });
});

// ── runScanCycle ──────────────────────────────────────────────────────────────

describe("runScanCycle", () => {
  it("returns empty array when no contracts need bumping (far expiry)", async () => {
    const { Server } = await import("@stellar/stellar-sdk/rpc");
    const rpc = new Server("https://example.com");

    mockGetLatestLedger.mockResolvedValue({ sequence: CURRENT_LEDGER });
    mockGetLedgerEntries.mockResolvedValue({
      entries: [mockLedgerEntry(FAR_EXPIRY)],
    });

    const config = makeBotConfig({ dryRun: true });
    const results = await runScanCycle(rpc as any, config);
    expect(results).toHaveLength(0);
  });

  it("triggers a bump when remaining ledgers <= threshold", async () => {
    const { Server } = await import("@stellar/stellar-sdk/rpc");
    const rpc = new Server("https://example.com");

    mockGetLatestLedger.mockResolvedValue({ sequence: CURRENT_LEDGER });
    mockGetLedgerEntries.mockResolvedValue({
      entries: [mockLedgerEntry(NEAR_EXPIRY)],
    });

    const config = makeBotConfig({ dryRun: true, warningThresholdLedgers: 50_000 });
    const results = await runScanCycle(rpc as any, config);
    // dry run always returns success
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].dryRun).toBe(true);
  });

  it("continues scanning remaining contracts when one RPC call fails", async () => {
    const { Server } = await import("@stellar/stellar-sdk/rpc");
    const rpc = new Server("https://example.com");

    const c2 = "CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB4";
    mockGetLatestLedger.mockResolvedValue({ sequence: CURRENT_LEDGER });
    mockGetLedgerEntries
      .mockRejectedValueOnce(new Error("first contract RPC fail"))
      .mockResolvedValue({ entries: [mockLedgerEntry(NEAR_EXPIRY)] });

    const config = makeBotConfig({
      contractIds: [VALID_CONTRACT_ID, c2],
      dryRun: true,
      warningThresholdLedgers: 50_000,
    });

    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const results = await runScanCycle(rpc as any, config);
    spy.mockRestore();

    // Second contract (c2) should still be processed
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("returns empty array when getLedgerEntries returns no entries", async () => {
    const { Server } = await import("@stellar/stellar-sdk/rpc");
    const rpc = new Server("https://example.com");

    mockGetLatestLedger.mockResolvedValue({ sequence: CURRENT_LEDGER });
    mockGetLedgerEntries.mockResolvedValue({ entries: [] });

    const config = makeBotConfig({ dryRun: true });
    const results = await runScanCycle(rpc as any, config);
    // null remainingLedgers → no bump triggered
    expect(results).toHaveLength(0);
  });

  it("returns empty array when getLatestLedger fails", async () => {
    const { Server } = await import("@stellar/stellar-sdk/rpc");
    const rpc = new Server("https://example.com");

    mockGetLatestLedger.mockRejectedValue(new Error("RPC down"));

    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const config = makeBotConfig({ dryRun: true });
    const results = await runScanCycle(rpc as any, config);
    spy.mockRestore();

    expect(results).toHaveLength(0);
  });
});

// ── TtlBotError ───────────────────────────────────────────────────────────────

describe("TtlBotError", () => {
  it("is an instance of Error", () => {
    const e = new TtlBotError("msg", "CONFIG_ERROR");
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(TtlBotError);
  });

  it("has name TtlBotError", () => {
    expect(new TtlBotError("msg", "RPC_ERROR").name).toBe("TtlBotError");
  });

  it.each([
    "CONFIG_ERROR",
    "RPC_ERROR",
    "TX_ERROR",
    "LEDGER_ENTRY_ERROR",
  ] as const)("preserves code %s", (code) => {
    expect(new TtlBotError("msg", code).code).toBe(code);
  });
});
