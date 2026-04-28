/**
 * SorobanEventParser
 *
 * A class-based, type-safe utility for parsing raw Soroban contract events
 * emitted by Fundable smart contracts. Designed for dApp developers who need
 * to react to on-chain actions in a structured, predictable way.
 *
 * Supports both PaymentStream and Distributor contract event streams.
 *
 * @example
 * ```ts
 * const parser = new SorobanEventParser({ contractId: "C..." });
 * const events = parser.parseAll(rawEvents);
 * const paused = parser.filter(events, "StreamPaused");
 * ```
 */

import {
  parsePaymentStreamContractEvent,
  parsePaymentStreamContractEvents,
  type ContractEventRaw,
  type PaymentStreamContractEvent,
  type PaymentStreamContractEventType,
  PAYMENT_STREAM_EVENT_TYPES,
} from "./events";

export type { ContractEventRaw, PaymentStreamContractEvent, PaymentStreamContractEventType };
export { PAYMENT_STREAM_EVENT_TYPES };

export interface SorobanEventParserOptions {
  /** Optional contract ID to scope parsing to a specific contract. */
  contractId?: string;
}

export interface ParseResult<T> {
  parsed: T[];
  /** Raw events that could not be parsed (unknown topic or malformed payload). */
  skipped: ContractEventRaw[];
}

export class SorobanEventParser {
  private readonly contractId?: string;

  constructor(options: SorobanEventParserOptions = {}) {
    this.contractId = options.contractId;
  }

  /**
   * Parse a single raw event. Returns `null` if the event is unrecognized
   * or has a malformed payload.
   */
  parse(event: ContractEventRaw): PaymentStreamContractEvent | null {
    if (this.contractId && event.contract_id !== this.contractId) {
      return null;
    }
    return parsePaymentStreamContractEvent(event);
  }

  /**
   * Parse an array of raw events, returning successfully parsed events and
   * a list of skipped (unrecognized / malformed) events.
   */
  parseAll(events: readonly ContractEventRaw[]): ParseResult<PaymentStreamContractEvent> {
    const parsed: PaymentStreamContractEvent[] = [];
    const skipped: ContractEventRaw[] = [];

    for (const event of events) {
      const result = this.parse(event);
      if (result !== null) {
        parsed.push(result);
      } else {
        skipped.push(event);
      }
    }

    return { parsed, skipped };
  }

  /**
   * Filter already-parsed events by event type with full type narrowing.
   *
   * @example
   * const paused = parser.filter(events, "StreamPaused");
   * // paused[0].payload.paused_at is typed as bigint
   */
  filter<T extends PaymentStreamContractEventType>(
    events: PaymentStreamContractEvent[],
    type: T,
  ): Extract<PaymentStreamContractEvent, { type: T }>[] {
    return events.filter(
      (e): e is Extract<PaymentStreamContractEvent, { type: T }> => e.type === type,
    );
  }

  /**
   * Convenience: parse raw events and immediately filter by type.
   */
  parseAndFilter<T extends PaymentStreamContractEventType>(
    rawEvents: readonly ContractEventRaw[],
    type: T,
  ): Extract<PaymentStreamContractEvent, { type: T }>[] {
    const { parsed } = this.parseAll(rawEvents);
    return this.filter(parsed, type);
  }

  /**
   * Returns true if the given event type string is a known PaymentStream event.
   */
  static isKnownEventType(value: string): value is PaymentStreamContractEventType {
    return (PAYMENT_STREAM_EVENT_TYPES as readonly string[]).includes(value);
  }
}
