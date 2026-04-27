/**
 * Stream history utilities
 * 
 * High-level wrapper to fetch and parse history events for a specific stream.
 * Common requirement for dashboard applications.
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
  startLedger?: number;
  limit?: number;
}

export interface StreamHistoryResult {
  events: PaymentStreamContractEvent[];
  latestLedger: number;
  cursor?: string;
}

/**
 * Fetch and parse history events for a specific stream
 * @param options Configuration for fetching stream history
 * @returns Parsed stream events with pagination info
 */
export async function getStreamHistory(
  options: StreamHistoryOptions
): Promise<StreamHistoryResult> {
  const { rpcUrl, contractId, streamId, startLedger, limit = 100 } = options;
  
  const server = new SorobanRpc.Server(rpcUrl);
  
  try {
    // Build event filter for the specific stream
    const eventFilter: SorobanRpc.EventFilter = {
      type: "contract",
      contractIds: [contractId],
    };

    // Fetch events from RPC
    const response = await server.getEvents({
      filters: [eventFilter],
      startLedger,
      limit,
    });

    // Parse and filter events for this specific stream
    const parsedEvents: PaymentStreamContractEvent[] = [];
    
    for (const event of response.events) {
      // Convert RPC event to our ContractEventRaw format
      const rawEvent: ContractEventRaw = {
        contract_id: contractId,
        topic: event.topic,
        value: event.value,
      };

      const parsed = parsePaymentStreamContractEvent(rawEvent);
      
      // Filter events that belong to this stream
      if (parsed && isStreamEvent(parsed, streamId)) {
        parsedEvents.push(parsed);
      }
    }

    return {
      events: parsedEvents,
      latestLedger: response.latestLedger,
      cursor: response.events.length > 0 
        ? response.events[response.events.length - 1].pagingToken 
        : undefined,
    };
  } catch (error) {
    throw new Error(`Failed to fetch stream history: ${error}`);
  }
}

/**
 * Check if an event belongs to a specific stream
 */
function isStreamEvent(
  event: PaymentStreamContractEvent,
  streamId: bigint
): boolean {
  const payload = event.payload as any;
  
  // Check if the event payload has a stream_id field matching our target
  if (payload && "stream_id" in payload) {
    return payload.stream_id === streamId;
  }
  
  return false;
}

/**
 * Fetch all history for a stream across multiple pages
 * @param options Configuration for fetching stream history
 * @param maxPages Maximum number of pages to fetch (default: 10)
 * @returns All parsed stream events
 */
export async function getAllStreamHistory(
  options: StreamHistoryOptions,
  maxPages: number = 10
): Promise<PaymentStreamContractEvent[]> {
  const allEvents: PaymentStreamContractEvent[] = [];
  let currentStartLedger = options.startLedger;
  let pagesLoaded = 0;

  while (pagesLoaded < maxPages) {
    const result = await getStreamHistory({
      ...options,
      startLedger: currentStartLedger,
    });

    allEvents.push(...result.events);
    
    // If we got fewer events than the limit, we've reached the end
    if (result.events.length < (options.limit || 100)) {
      break;
    }

    // Update start ledger for next page
    currentStartLedger = result.latestLedger + 1;
    pagesLoaded++;
  }

  return allEvents;
}

/**
 * Get stream history grouped by event type
 * @param options Configuration for fetching stream history
 * @returns Events grouped by type
 */
export async function getStreamHistoryByType(
  options: StreamHistoryOptions
): Promise<Record<string, PaymentStreamContractEvent[]>> {
  const result = await getStreamHistory(options);
  
  const grouped: Record<string, PaymentStreamContractEvent[]> = {};
  
  for (const event of result.events) {
    if (!grouped[event.type]) {
      grouped[event.type] = [];
    }
    grouped[event.type].push(event);
  }
  
  return grouped;
}
