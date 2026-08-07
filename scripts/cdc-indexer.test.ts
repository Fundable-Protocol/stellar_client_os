// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  loadConfig,
  log,
  parseEventType,
  parseStreamEvent,
  getCursor,
  setCursor,
  insertEvents,
  ensureSchema,
  runPollCycle,
  fetchEvents,
  getCurrentLedger,
  IndexerError,
  type IndexerConfig,
  type StreamEvent,
  type DbClient,
} from "./cdc-indexer";

// ── Mock Stellar SDK RPC ──────────────────────────────────────────────────────

const mockGetEvents = vi.fn();
const mockGetLatestLedger = vi.fn();

vi.mock("@stellar/stellar-sdk/rpc", () => ({
  Server: vi.fn().mockImplementation(() => ({
    getEvents: mockGetEvents,
    getLatestLedger: mockGetLatestLedger,
  })),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_CONTRACT_ID = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4";
const CURRENT_LEDGER = 2_000_000;

function makeConfig(overrides: Partial<IndexerConfig> = {}): IndexerConfig {
  return {
    databaseUrl: "postgresql://localhost:5432/test",
    contractIds: [VALID_CONTRACT_ID],
    rpcUrl: "https://soroban-testnet.stellar.org",
    networkPassphrase: "Test SDF Network ; September 2015",
    pollIntervalSeconds: 5,
    ledgerLookback: 1_000,
    maxEventsPerPoll: 200,
    indexerId: "test_indexer",
    dryRun: false,
    ...overrides,
  };
}

/** Simple in-memory DbClient for testing. */
function makeDb(rows: Record<string, unknown[][]> = {}): DbClient & {
  calls: { sql: string; params: unknown[] }[];
} {
  const calls: { sql: string; params: unknown[] }[] = [];
  const queryRows = { ...rows };

  return {
    calls,
    async query<T>(sql: string, params: unknown[] = []) {
      calls.push({ sql: sql.trim(), params });
      // Match SELECT queries to return configured rows
      for (const [key, value] of Object.entries(queryRows)) {
        if (sql.toLowerCase().includes(key.toLowerCase())) {
          return { rows: value as T[] };
        }
      }
      return { rows: [] as T[], rowCount: 0 };
    },
  };
}

function makeRawEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "123",
    contractId: VALID_CONTRACT_ID,
    txHash: "abcdef1234567890",
    ledger: CURRENT_LEDGER,
    ledgerClosedAt: "2025-01-15T10:30:00Z",
    topic: [],
    value: { xdr: "" },
    ...overrides,
  };
}

const originalEnv = { ...process.env };

function setEnv(vars: Record<string, string>) {
  Object.assign(process.env, vars);
}

function resetEnv() {
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
  it("throws CONFIG_ERROR when DATABASE_URL is missing", () => {
    setEnv({ CONTRACT_IDS: VALID_CONTRACT_ID });
    expect(() => loadConfig()).toThrowError(IndexerError);
    try { loadConfig(); } catch (e) {
      expect((e as IndexerError).code).toBe("CONFIG_ERROR");
    }
  });

  it("throws CONFIG_ERROR when CONTRACT_IDS is missing", () => {
    setEnv({ DATABASE_URL: "postgresql://localhost/test" });
    expect(() => loadConfig()).toThrowError(IndexerError);
  });

  it("throws CONFIG_ERROR for invalid contract ID format", () => {
    setEnv({
      DATABASE_URL: "postgresql://localhost/test",
      CONTRACT_IDS: "GNOTACONTRACT",
    });
    expect(() => loadConfig()).toThrowError(IndexerError);
  });

  it("throws CONFIG_ERROR for empty CONTRACT_IDS", () => {
    setEnv({ DATABASE_URL: "postgresql://localhost/test", CONTRACT_IDS: ",,," });
    expect(() => loadConfig()).toThrowError(IndexerError);
  });

  it("loads valid config with defaults", () => {
    setEnv({
      DATABASE_URL: "postgresql://localhost/test",
      CONTRACT_IDS: VALID_CONTRACT_ID,
    });
    const config = loadConfig();
    expect(config.contractIds).toEqual([VALID_CONTRACT_ID]);
    expect(config.pollIntervalSeconds).toBe(5);
    expect(config.ledgerLookback).toBe(1_000);
    expect(config.maxEventsPerPoll).toBe(200);
    expect(config.dryRun).toBe(false);
    expect(config.indexerId).toBe("fundable_stream_indexer");
  });

  it("respects env var overrides", () => {
    setEnv({
      DATABASE_URL: "postgresql://localhost/test",
      CONTRACT_IDS: VALID_CONTRACT_ID,
      POLL_INTERVAL_SECONDS: "10",
      LEDGER_LOOKBACK: "500",
      MAX_EVENTS_PER_POLL: "50",
      DRY_RUN: "true",
      INDEXER_ID: "my_indexer",
    });
    const config = loadConfig();
    expect(config.pollIntervalSeconds).toBe(10);
    expect(config.ledgerLookback).toBe(500);
    expect(config.maxEventsPerPoll).toBe(50);
    expect(config.dryRun).toBe(true);
    expect(config.indexerId).toBe("my_indexer");
  });

  it("supports multiple contract IDs with whitespace", () => {
    const c2 = "CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB4";
    setEnv({
      DATABASE_URL: "postgresql://localhost/test",
      CONTRACT_IDS: ` ${VALID_CONTRACT_ID} , ${c2} `,
    });
    const config = loadConfig();
    expect(config.contractIds).toHaveLength(2);
  });
});

// ── log ───────────────────────────────────────────────────────────────────────

describe("log", () => {
  it("writes JSON to stdout for info messages", () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    log("info", "test", { key: "val" });
    const line = JSON.parse(spy.mock.calls[0][0] as string);
    expect(line.level).toBe("info");
    expect(line.message).toBe("test");
    expect(line.service).toBe("cdc-indexer");
    spy.mockRestore();
  });

  it("writes JSON to stderr for error messages", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    log("error", "boom");
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });
});

// ── parseEventType ────────────────────────────────────────────────────────────

describe("parseEventType", () => {
  it.each([
    [["stream_created"], "stream_created"],
    [["create"], "stream_created"],
    [["stream_updated"], "stream_updated"],
    [["update"], "stream_updated"],
    [["stream_cancelled"], "stream_cancelled"],
    [["cancel"], "stream_cancelled"],
    [["stream_completed"], "stream_completed"],
    [["complete"], "stream_completed"],
    [["stream_withdrawn"], "stream_withdrawn"],
    [["withdraw"], "stream_withdrawn"],
    [["unknown_event"], "unknown"],
    [[], "unknown"],
  ] as [string[], string][])(
    "maps %s → %s",
    (topics, expected) => {
      expect(parseEventType(topics)).toBe(expected);
    }
  );
});

// ── parseStreamEvent ──────────────────────────────────────────────────────────

describe("parseStreamEvent", () => {
  it("returns an event with the correct eventId format", () => {
    const raw = makeRawEvent({ id: "5" });
    const result = parseStreamEvent(raw as any, CURRENT_LEDGER, 1700000000);
    expect(result.eventId).toBe(`${CURRENT_LEDGER}-5`);
  });

  it("populates contractId and txHash", () => {
    const raw = makeRawEvent();
    const result = parseStreamEvent(raw as any, CURRENT_LEDGER, 1700000000);
    expect(result.contractId).toBe(VALID_CONTRACT_ID);
    expect(result.txHash).toBe("abcdef1234567890");
  });

  it("sets ledgerTimestamp as ISO 8601 from unix timestamp", () => {
    const raw = makeRawEvent();
    const result = parseStreamEvent(raw as any, CURRENT_LEDGER, 1700000000);
    expect(result.ledgerTimestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("defaults null fields gracefully for empty event", () => {
    const raw = makeRawEvent({ topic: [], value: { xdr: "" } });
    const result = parseStreamEvent(raw as any, CURRENT_LEDGER, 1700000000);
    expect(result.sender).toBeNull();
    expect(result.recipient).toBeNull();
    expect(result.asset).toBeNull();
    expect(result.amount).toBeNull();
    expect(result.streamId).toBeNull();
    expect(result.eventType).toBe("unknown");
  });

  it("does not throw on malformed XDR — sets rawXdr gracefully", () => {
    const raw = makeRawEvent({ value: { xdr: "not-valid-xdr!!!" } });
    expect(() => parseStreamEvent(raw as any, CURRENT_LEDGER, 1700000000)).not.toThrow();
    const result = parseStreamEvent(raw as any, CURRENT_LEDGER, 1700000000);
    expect(result.rawXdr).toBe("not-valid-xdr!!!");
  });
});

// ── getCursor ─────────────────────────────────────────────────────────────────

describe("getCursor", () => {
  it("returns null when no cursor row exists", async () => {
    const db = makeDb();
    const result = await getCursor(db, "test_indexer");
    expect(result).toBeNull();
  });

  it("returns the last_ledger as a number", async () => {
    const db = makeDb({
      "cdc_cursors": [{ last_ledger: "1500000" }],
    });
    const result = await getCursor(db, "test_indexer");
    expect(result).toBe(1_500_000);
  });
});

// ── setCursor ─────────────────────────────────────────────────────────────────

describe("setCursor", () => {
  it("executes an UPSERT query with correct params", async () => {
    const db = makeDb();
    await setCursor(db, "test_indexer", 2_000_000);
    const upsertCall = db.calls.find((c) => c.sql.includes("INSERT INTO cdc_cursors"));
    expect(upsertCall).toBeDefined();
    expect(upsertCall!.params).toContain("test_indexer");
    expect(upsertCall!.params).toContain(2_000_000);
  });
});

// ── insertEvents ──────────────────────────────────────────────────────────────

describe("insertEvents", () => {
  it("returns 0 for empty array without querying DB", async () => {
    const db = makeDb();
    const result = await insertEvents(db, []);
    expect(result).toBe(0);
    expect(db.calls).toHaveLength(0);
  });

  it("issues one INSERT per event", async () => {
    const db = makeDb();
    const events: StreamEvent[] = [
      {
        eventId: "100-1", contractId: VALID_CONTRACT_ID,
        eventType: "stream_created", ledgerSequence: 100,
        ledgerTimestamp: new Date().toISOString(),
        txHash: "abc", sender: null, recipient: null,
        asset: null, amount: null, streamId: null, rawXdr: "",
      },
      {
        eventId: "100-2", contractId: VALID_CONTRACT_ID,
        eventType: "stream_updated", ledgerSequence: 100,
        ledgerTimestamp: new Date().toISOString(),
        txHash: "def", sender: null, recipient: null,
        asset: null, amount: null, streamId: null, rawXdr: "",
      },
    ];
    await insertEvents(db, events);
    const insertCalls = db.calls.filter((c) => c.sql.includes("INSERT INTO stream_events"));
    expect(insertCalls).toHaveLength(2);
  });

  it("passes correct event_id as first param", async () => {
    const db = makeDb();
    const events: StreamEvent[] = [
      {
        eventId: "my-unique-id", contractId: VALID_CONTRACT_ID,
        eventType: "stream_created", ledgerSequence: 100,
        ledgerTimestamp: new Date().toISOString(),
        txHash: "abc", sender: null, recipient: null,
        asset: null, amount: null, streamId: null, rawXdr: "",
      },
    ];
    await insertEvents(db, events);
    expect(db.calls[0].params[0]).toBe("my-unique-id");
  });
});

// ── ensureSchema ──────────────────────────────────────────────────────────────

describe("ensureSchema", () => {
  it("creates stream_events and cdc_cursors tables", async () => {
    const db = makeDb();
    await ensureSchema(db);
    const tableNames = db.calls.map((c) => c.sql).join(" ");
    expect(tableNames).toContain("stream_events");
    expect(tableNames).toContain("cdc_cursors");
  });

  it("creates indexes on stream_events", async () => {
    const db = makeDb();
    await ensureSchema(db);
    const indexCalls = db.calls.filter((c) => c.sql.includes("CREATE INDEX"));
    expect(indexCalls.length).toBeGreaterThan(0);
  });
});

// ── getCurrentLedger ──────────────────────────────────────────────────────────

describe("getCurrentLedger", () => {
  it("returns ledger sequence from RPC", async () => {
    const { Server } = await import("@stellar/stellar-sdk/rpc");
    const rpc = new Server("https://example.com");
    mockGetLatestLedger.mockResolvedValueOnce({ sequence: CURRENT_LEDGER });
    const result = await getCurrentLedger(rpc as any);
    expect(result).toBe(CURRENT_LEDGER);
  });

  it("throws RPC_ERROR on failure", async () => {
    const { Server } = await import("@stellar/stellar-sdk/rpc");
    const rpc = new Server("https://example.com");
    mockGetLatestLedger.mockRejectedValueOnce(new Error("timeout"));
    await expect(getCurrentLedger(rpc as any)).rejects.toMatchObject({ code: "RPC_ERROR" });
  });
});

// ── fetchEvents ───────────────────────────────────────────────────────────────

describe("fetchEvents", () => {
  it("returns events from RPC", async () => {
    const { Server } = await import("@stellar/stellar-sdk/rpc");
    const rpc = new Server("https://example.com");
    mockGetEvents.mockResolvedValueOnce({ events: [makeRawEvent()] });
    const events = await fetchEvents(rpc as any, [VALID_CONTRACT_ID], 1_000_000, 200);
    expect(events).toHaveLength(1);
  });

  it("returns empty array when RPC returns no events", async () => {
    const { Server } = await import("@stellar/stellar-sdk/rpc");
    const rpc = new Server("https://example.com");
    mockGetEvents.mockResolvedValueOnce({ events: [] });
    const events = await fetchEvents(rpc as any, [VALID_CONTRACT_ID], 1_000_000, 200);
    expect(events).toHaveLength(0);
  });

  it("throws RPC_ERROR on failure", async () => {
    const { Server } = await import("@stellar/stellar-sdk/rpc");
    const rpc = new Server("https://example.com");
    mockGetEvents.mockRejectedValueOnce(new Error("RPC error"));
    await expect(
      fetchEvents(rpc as any, [VALID_CONTRACT_ID], 1_000_000, 200)
    ).rejects.toMatchObject({ code: "RPC_ERROR" });
  });
});

// ── runPollCycle ──────────────────────────────────────────────────────────────

describe("runPollCycle", () => {
  it("returns 0 and skips when already at latest ledger", async () => {
    const db = makeDb({ "cdc_cursors": [{ last_ledger: String(CURRENT_LEDGER) }] });
    const { Server } = await import("@stellar/stellar-sdk/rpc");
    const rpc = new Server("https://example.com");
    mockGetLatestLedger.mockResolvedValueOnce({ sequence: CURRENT_LEDGER });

    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const result = await runPollCycle(db, rpc as any, makeConfig());
    spy.mockRestore();
    expect(result).toBe(0);
  });

  it("inserts events and advances cursor on fresh start (no cursor)", async () => {
    const db = makeDb();
    const { Server } = await import("@stellar/stellar-sdk/rpc");
    const rpc = new Server("https://example.com");
    mockGetLatestLedger.mockResolvedValueOnce({ sequence: CURRENT_LEDGER });
    mockGetEvents.mockResolvedValueOnce({ events: [makeRawEvent()] });

    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runPollCycle(db, rpc as any, makeConfig());
    spy.mockRestore();

    const cursorCall = db.calls.find((c) => c.sql.includes("INSERT INTO cdc_cursors"));
    expect(cursorCall).toBeDefined();
    expect(cursorCall!.params).toContain(CURRENT_LEDGER);
  });

  it("skips DB writes in dry-run mode", async () => {
    const db = makeDb();
    const { Server } = await import("@stellar/stellar-sdk/rpc");
    const rpc = new Server("https://example.com");
    mockGetLatestLedger.mockResolvedValueOnce({ sequence: CURRENT_LEDGER });
    mockGetEvents.mockResolvedValueOnce({ events: [makeRawEvent()] });

    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runPollCycle(db, rpc as any, makeConfig({ dryRun: true }));
    spy.mockRestore();

    const insertCalls = db.calls.filter((c) => c.sql.includes("INSERT INTO stream_events"));
    expect(insertCalls).toHaveLength(0);
  });

  it("returns 0 when getLatestLedger fails", async () => {
    const db = makeDb();
    const { Server } = await import("@stellar/stellar-sdk/rpc");
    const rpc = new Server("https://example.com");
    mockGetLatestLedger.mockRejectedValueOnce(new Error("RPC down"));

    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const result = await runPollCycle(db, rpc as any, makeConfig());
    spy.mockRestore();
    expect(result).toBe(0);
  });

  it("returns 0 when getEvents fails", async () => {
    const db = makeDb();
    const { Server } = await import("@stellar/stellar-sdk/rpc");
    const rpc = new Server("https://example.com");
    mockGetLatestLedger.mockResolvedValueOnce({ sequence: CURRENT_LEDGER });
    mockGetEvents.mockRejectedValueOnce(new Error("events RPC error"));

    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const result = await runPollCycle(db, rpc as any, makeConfig());
    spy.mockRestore();
    expect(result).toBe(0);
  });
});

// ── IndexerError ──────────────────────────────────────────────────────────────

describe("IndexerError", () => {
  it("is an instance of Error", () => {
    const e = new IndexerError("msg", "CONFIG_ERROR");
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(IndexerError);
  });

  it("has name IndexerError", () => {
    expect(new IndexerError("msg", "RPC_ERROR").name).toBe("IndexerError");
  });

  it.each(["CONFIG_ERROR", "DB_ERROR", "RPC_ERROR", "PARSE_ERROR"] as const)(
    "preserves code %s",
    (code) => {
      expect(new IndexerError("msg", code).code).toBe(code);
    }
  );
});
