import { describe, it, expect } from "vitest";
import {
  parsePaymentStreamContractEvent,
  parsePaymentStreamContractEvents,
  type PaymentStreamContractEvent,
} from "../utils/events";

describe("payment stream event parser", () => {
  it("parses FeeCollected events", () => {
    const rawEvent = {
      contract_id: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
      topic: ["FeeCollected"],
      value: {
        amount: "1000000000000000000",
        stream_id: "42",
      },
    };

    const parsed = parsePaymentStreamContractEvent(rawEvent);

    expect(parsed).toEqual<PaymentStreamContractEvent>({
      type: "FeeCollected",
      contractId: rawEvent.contract_id,
      topic: ["FeeCollected"],
      payload: {
        amount: 1000000000000000000n,
        stream_id: 42n,
      },
    });
  });

  it("parses StreamPaused events with numeric payload values", () => {
    const rawEvent = {
      contract_id: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
      topic: ["StreamPaused"],
      value: {
        paused_at: 1682500000,
        stream_id: 7,
      },
    };

    const parsed = parsePaymentStreamContractEvent(rawEvent);

    expect(parsed).toEqual<PaymentStreamContractEvent>({
      type: "StreamPaused",
      contractId: rawEvent.contract_id,
      topic: ["StreamPaused"],
      payload: {
        paused_at: 1682500000n,
        stream_id: 7n,
      },
    });
  });

  it("ignores unsupported event topics", () => {
    const rawEvent = {
      contract_id: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
      topic: ["UnknownEvent"],
      value: {
        foo: "bar",
      },
    };

    expect(parsePaymentStreamContractEvent(rawEvent)).toBeNull();
  });

  it("ignores invalid event payloads", () => {
    const rawEvent = {
      contract_id: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
      topic: ["StreamResumed"],
      value: {
        paused_duration: "not-a-number",
        resumed_at: 0,
        stream_id: 1,
      },
    };

    expect(parsePaymentStreamContractEvent(rawEvent)).toBeNull();
  });

  it("parses multiple events from an array", () => {
    const rawEvents = [
      {
        contract_id: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
        topic: ["DelegationGranted"],
        value: {
          delegate: "GCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
          recipient: "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
          stream_id: "99",
        },
      },
      {
        contract_id: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
        topic: ["DelegationRevoked"],
        value: {
          recipient: "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
          stream_id: 99,
        },
      },
    ];

    const parsed = parsePaymentStreamContractEvents(rawEvents);

    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({ type: "DelegationGranted" });
    expect(parsed[1]).toMatchObject({ type: "DelegationRevoked" });
  });
});
