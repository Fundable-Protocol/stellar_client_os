import { describe, it, expect, beforeEach } from "vitest";
import { SorobanEventParser } from "../utils/SorobanEventParser";
import type { ContractEventRaw } from "../utils/events";

const CONTRACT_ID = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";
const OTHER_CONTRACT_ID = "CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

const makeEvent = (
  topic: string[],
  value: unknown,
  contract_id = CONTRACT_ID,
): ContractEventRaw => ({ contract_id, topic, value });

describe("SorobanEventParser", () => {
  let parser: SorobanEventParser;

  beforeEach(() => {
    parser = new SorobanEventParser({ contractId: CONTRACT_ID });
  });

  describe("parse()", () => {
    it("parses a valid StreamPaused event", () => {
      const event = makeEvent(["StreamPaused"], { stream_id: 1, paused_at: 1000 });
      const result = parser.parse(event);
      expect(result).not.toBeNull();
      expect(result?.type).toBe("StreamPaused");
      expect(result?.payload).toEqual({ stream_id: 1n, paused_at: 1000n });
    });

    it("returns null for an unknown event topic", () => {
      const event = makeEvent(["UnknownEvent"], { foo: "bar" });
      expect(parser.parse(event)).toBeNull();
    });

    it("returns null for a malformed payload", () => {
      const event = makeEvent(["StreamResumed"], { paused_duration: "not-a-number", resumed_at: 0, stream_id: 1 });
      expect(parser.parse(event)).toBeNull();
    });

    it("returns null when contractId does not match", () => {
      const event = makeEvent(["StreamPaused"], { stream_id: 1, paused_at: 1000 }, OTHER_CONTRACT_ID);
      expect(parser.parse(event)).toBeNull();
    });

    it("parses events from any contract when no contractId is set", () => {
      const openParser = new SorobanEventParser();
      const event = makeEvent(["StreamPaused"], { stream_id: 1, paused_at: 1000 }, OTHER_CONTRACT_ID);
      expect(openParser.parse(event)).not.toBeNull();
    });
  });

  describe("parseAll()", () => {
    it("separates parsed and skipped events", () => {
      const events: ContractEventRaw[] = [
        makeEvent(["FeeCollected"], { amount: "500", stream_id: "1" }),
        makeEvent(["UnknownEvent"], { foo: "bar" }),
        makeEvent(["StreamDeposit"], { amount: 1000, stream_id: 2 }),
        makeEvent(["StreamPaused"], { stream_id: 3 }), // missing paused_at → skipped
      ];

      const { parsed, skipped } = parser.parseAll(events);

      expect(parsed).toHaveLength(2);
      expect(parsed[0].type).toBe("FeeCollected");
      expect(parsed[1].type).toBe("StreamDeposit");

      expect(skipped).toHaveLength(2);
    });

    it("returns empty arrays for empty input", () => {
      const { parsed, skipped } = parser.parseAll([]);
      expect(parsed).toHaveLength(0);
      expect(skipped).toHaveLength(0);
    });

    it("skips events from a different contract when contractId is set", () => {
      const events: ContractEventRaw[] = [
        makeEvent(["StreamPaused"], { stream_id: 1, paused_at: 100 }, CONTRACT_ID),
        makeEvent(["StreamPaused"], { stream_id: 2, paused_at: 200 }, OTHER_CONTRACT_ID),
      ];

      const { parsed, skipped } = parser.parseAll(events);
      expect(parsed).toHaveLength(1);
      expect(skipped).toHaveLength(1);
    });
  });

  describe("filter()", () => {
    it("filters parsed events by type with type narrowing", () => {
      const events: ContractEventRaw[] = [
        makeEvent(["StreamPaused"], { stream_id: 1, paused_at: 100 }),
        makeEvent(["StreamResumed"], { stream_id: 1, resumed_at: 200, paused_duration: 100 }),
        makeEvent(["StreamPaused"], { stream_id: 2, paused_at: 300 }),
      ];

      const { parsed } = parser.parseAll(events);
      const paused = parser.filter(parsed, "StreamPaused");

      expect(paused).toHaveLength(2);
      // TypeScript should narrow payload to StreamPausedEvent
      expect(paused[0].payload.paused_at).toBe(100n);
      expect(paused[1].payload.paused_at).toBe(300n);
    });

    it("returns empty array when no events match the type", () => {
      const events: ContractEventRaw[] = [
        makeEvent(["StreamPaused"], { stream_id: 1, paused_at: 100 }),
      ];
      const { parsed } = parser.parseAll(events);
      expect(parser.filter(parsed, "FeeCollected")).toHaveLength(0);
    });
  });

  describe("parseAndFilter()", () => {
    it("parses and filters in one call", () => {
      const events: ContractEventRaw[] = [
        makeEvent(["DelegationGranted"], {
          stream_id: "5",
          delegate: "GCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
          recipient: "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
        }),
        makeEvent(["StreamPaused"], { stream_id: 1, paused_at: 100 }),
      ];

      const delegations = parser.parseAndFilter(events, "DelegationGranted");
      expect(delegations).toHaveLength(1);
      expect(delegations[0].payload.stream_id).toBe(5n);
    });
  });

  describe("SorobanEventParser.isKnownEventType()", () => {
    it("returns true for known event types", () => {
      expect(SorobanEventParser.isKnownEventType("FeeCollected")).toBe(true);
      expect(SorobanEventParser.isKnownEventType("StreamDeposit")).toBe(true);
      expect(SorobanEventParser.isKnownEventType("DelegationRevoked")).toBe(true);
    });

    it("returns false for unknown strings", () => {
      expect(SorobanEventParser.isKnownEventType("Transfer")).toBe(false);
      expect(SorobanEventParser.isKnownEventType("")).toBe(false);
    });
  });
});
