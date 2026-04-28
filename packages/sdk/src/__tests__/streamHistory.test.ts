import { describe, it, expect, vi, beforeEach } from "vitest";
import { getStreamHistory, getAllStreamHistory } from "../utils/streamHistory";

// ---------------------------------------------------------------------------
// Mock SorobanRpc.Server
// ---------------------------------------------------------------------------
const mockGetEvents = vi.fn();

vi.mock("@stellar/stellar-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@stellar/stellar-sdk")>();
  return {
    ...actual,
    SorobanRpc: {
      ...actual.SorobanRpc,
      Server: vi.fn().mockImplementation(() => ({ getEvents: mockGetEvents })),
    },
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const CONTRACT_ID = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";
const STREAM_ID = 1n;

const BASE_OPTIONS = {
  rpcUrl: "https://soroban-testnet.stellar.org",
  contractId: CONTRACT_ID,
  streamId: STREAM_ID,
};

/** Build a minimal RPC event that parses as a StreamDeposit for STREAM_ID */
function makeDepositEvent(pagingToken: string, streamId = STREAM_ID) {
  return {
    pagingToken,
    topic: ["StreamDeposit"],
    value: { stream_id: streamId, amount: 100n },
  };
}

function makeRpcResponse(
  events: ReturnType<typeof makeDepositEvent>[],
  latestLedger = 1000
) {
  return { events, latestLedger };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// getStreamHistory
// ---------------------------------------------------------------------------
describe("getStreamHistory", () => {
  it("uses startLedger on the first call when no cursor is provided", async () => {
    mockGetEvents.mockResolvedValue(makeRpcResponse([]));

    await getStreamHistory({ ...BASE_OPTIONS, startLedger: 42 });

    expect(mockGetEvents).toHaveBeenCalledWith(
      expect.objectContaining({ startLedger: 42 })
    );
    expect(mockGetEvents).not.toHaveBeenCalledWith(
      expect.objectContaining({ cursor: expect.anything() })
    );
  });

  it("uses cursor instead of startLedger when cursor is provided", async () => {
    mockGetEvents.mockResolvedValue(makeRpcResponse([]));

    await getStreamHistory({ ...BASE_OPTIONS, startLedger: 42 }, "tok-1");

    expect(mockGetEvents).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: "tok-1" })
    );
    expect(mockGetEvents).not.toHaveBeenCalledWith(
      expect.objectContaining({ startLedger: expect.anything() })
    );
  });

  it("returns parsed events and the last pagingToken as cursor", async () => {
    mockGetEvents.mockResolvedValue(
      makeRpcResponse([makeDepositEvent("tok-1"), makeDepositEvent("tok-2")])
    );

    const result = await getStreamHistory(BASE_OPTIONS);

    expect(result.events).toHaveLength(2);
    expect(result.cursor).toBe("tok-2");
  });

  it("filters out events belonging to a different stream", async () => {
    mockGetEvents.mockResolvedValue(
      makeRpcResponse([
        makeDepositEvent("tok-1", 1n),  // matches
        makeDepositEvent("tok-2", 99n), // different stream
      ])
    );

    const result = await getStreamHistory(BASE_OPTIONS);

    expect(result.events).toHaveLength(1);
  });

  it("returns undefined cursor when no events are returned", async () => {
    mockGetEvents.mockResolvedValue(makeRpcResponse([]));

    const result = await getStreamHistory(BASE_OPTIONS);

    expect(result.cursor).toBeUndefined();
  });

  it("wraps RPC errors", async () => {
    mockGetEvents.mockRejectedValue(new Error("RPC down"));

    await expect(getStreamHistory(BASE_OPTIONS)).rejects.toThrow(
      "Failed to fetch stream history"
    );
  });
});

// ---------------------------------------------------------------------------
// getAllStreamHistory – cursor-based multi-page behaviour
// ---------------------------------------------------------------------------
describe("getAllStreamHistory", () => {
  it("returns all events across multiple pages using cursor", async () => {
    const page1Events = Array.from({ length: 3 }, (_, i) =>
      makeDepositEvent(`tok-${i + 1}`)
    );
    const page2Events = Array.from({ length: 2 }, (_, i) =>
      makeDepositEvent(`tok-${i + 4}`)
    );

    mockGetEvents
      .mockResolvedValueOnce(makeRpcResponse(page1Events)) // page 1 – full (limit=3)
      .mockResolvedValueOnce(makeRpcResponse(page2Events)); // page 2 – partial → last

    const events = await getAllStreamHistory({ ...BASE_OPTIONS, limit: 3 });

    expect(events).toHaveLength(5);
    // Second call must use the cursor from page 1, not startLedger
    expect(mockGetEvents).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ cursor: "tok-3" })
    );
  });

  it("stops after a single page when fewer events than limit are returned", async () => {
    mockGetEvents.mockResolvedValue(
      makeRpcResponse([makeDepositEvent("tok-1")]) // 1 < default limit 100
    );

    const events = await getAllStreamHistory(BASE_OPTIONS);

    expect(events).toHaveLength(1);
    expect(mockGetEvents).toHaveBeenCalledTimes(1);
  });

  it("stops when RPC returns no cursor (empty page)", async () => {
    mockGetEvents.mockResolvedValue(makeRpcResponse([]));

    const events = await getAllStreamHistory(BASE_OPTIONS);

    expect(events).toHaveLength(0);
    expect(mockGetEvents).toHaveBeenCalledTimes(1);
  });

  it("respects maxPages cap", async () => {
    // Every page returns exactly `limit` events so pagination would continue
    const fullPage = Array.from({ length: 2 }, (_, i) =>
      makeDepositEvent(`tok-${i}`)
    );
    mockGetEvents.mockResolvedValue(makeRpcResponse(fullPage));

    const events = await getAllStreamHistory(
      { ...BASE_OPTIONS, limit: 2 },
      /*maxPages=*/ 2
    );

    // 2 pages × 2 events = 4 (loop runs pages 0 and 1, exits at pages === maxPages)
    expect(events).toHaveLength(4);
    expect(mockGetEvents).toHaveBeenCalledTimes(2);
  });

  it("does not duplicate events across pages", async () => {
    const page1 = [makeDepositEvent("tok-1"), makeDepositEvent("tok-2")];
    const page2 = [makeDepositEvent("tok-3")]; // partial → last page

    mockGetEvents
      .mockResolvedValueOnce(makeRpcResponse(page1))
      .mockResolvedValueOnce(makeRpcResponse(page2));

    const events = await getAllStreamHistory({ ...BASE_OPTIONS, limit: 2 });

    const tokens = events.map((_, i) => i); // just verify count
    expect(events).toHaveLength(3);
    // Ensure second call used cursor, not startLedger (no ledger-based overlap)
    expect(mockGetEvents).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ cursor: "tok-2" })
    );
  });
});
