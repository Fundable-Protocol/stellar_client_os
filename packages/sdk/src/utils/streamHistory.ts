/**
 * Stream history utilities
 *
 * High-level wrapper to fetch and parse history events for a specific stream.
 * Pagination is cursor-based (pagingToken) to avoid the skip/duplicate risk
 * that arises from advancing startLedger = latestLedger + 1.
 */

import { SorobanRpc } from "@stellar/stellar-sdk";
import {
  parsePaymentStreamContractEvent,
  PaymentStreamContractEvent,
  ContractEventRaw,
} from "./events";

export interface StreamHistoryOptions {
  rpcUrl: string;
  contractId: string;
  streamId: bigint;
  /** Ledger to start from on the very first page. Ignored on subsequent pages. */
  startLedger?: number;
  /** Page size passed to getEvents (default: 100). */
  limit?: number;
}

export interface StreamHistoryResult {
  events: PaymentStreamContractEvent[];
  latestLedger: number;
  /** Opaque cursor for the next page. Undefined when no events were returned. */
  cursor?: string;
}

/**
 * Fetch one page of parsed events for a specific stream.
 * Pass `cursor` (from a previous result) instead of `startLedger` to continue
 * from where the last page left off.
 */
export async function getStreamHistory(
  options: StreamHistoryOptions,
  cursor?: string
): Promise<StreamHistoryResult> {
  const { rpcUrl, contractId, streamId, startLedger, limit = 100 } = options;

  const server = new SorobanRpc.Server(rpcUrl);

  const filter: SorobanRpc.EventFilter = {
    type: "contract",
    contractIds: [contractId],
  };

  // cursor takes precedence over startLedger for continuation pages
  const requestParams: SorobanRpc.GetEventsRequest = cursor
    ? { filters: [filter], cursor, limit }
    : { filters: [filter], startLedger, limit };

  try {
    const response = await server.getEvents(requestParams);

    const parsedEvents: PaymentStreamContractEvent[] = [];
    for (const event of response.events) {
      const raw: ContractEventRaw = {
        contract_id: contractId,
        topic: event.topic,
        value: event.value,
      };
      const parsed = parsePaymentStreamContractEvent(raw);
      if (parsed && isStreamEvent(parsed, streamId)) {
        parsedEvents.push(parsed);
      }
    }

    return {
      events: parsedEvents,
      latestLedger: response.latestLedger,
      cursor:
        response.events.length > 0
          ? response.events[response.events.length - 1].pagingToken
          : undefined,
    };
  } catch (error) {
    throw new Error(`Failed to fetch stream history: ${error}`);
  }
}

/**
 * Fetch ALL history for a stream across multiple pages using cursor-based
 * pagination. Each page uses the pagingToken from the previous response so
 * ordering is stable and no events are skipped or duplicated.
 *
 * @param options  Fetch configuration.
 * @param maxPages Safety cap on the number of RPC calls (default: 10).
 */
export async function getAllStreamHistory(
  options: StreamHistoryOptions,
  maxPages: number = 10
): Promise<PaymentStreamContractEvent[]> {
  const allEvents: PaymentStreamContractEvent[] = [];
  const pageLimit = options.limit ?? 100;
  let cursor: string | undefined;
  let pages = 0;

  while (pages < maxPages) {
    const result = await getStreamHistory(options, cursor);
    allEvents.push(...result.events);

    // No cursor returned → RPC has no more events
    if (!result.cursor) break;

    // Fewer raw events than the page limit → last page
    if (result.events.length < pageLimit) break;

    cursor = result.cursor;
    pages++;
  }

  return allEvents;
}

/**
 * Get stream history grouped by event type.
 */
export async function getStreamHistoryByType(
  options: StreamHistoryOptions
): Promise<Record<string, PaymentStreamContractEvent[]>> {
  const result = await getStreamHistory(options);
  const grouped: Record<string, PaymentStreamContractEvent[]> = {};
  for (const event of result.events) {
    (grouped[event.type] ??= []).push(event);
  }
  return grouped;
}

function isStreamEvent(
  event: PaymentStreamContractEvent,
  streamId: bigint
): boolean {
  const payload = event.payload as Record<string, unknown>;
  return "stream_id" in payload && payload.stream_id === streamId;
}
