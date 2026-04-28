/**
 * Event parsing utilities for Fundable Stellar smart contract events.
 *
 * These helpers make it easier for dApp developers to consume
 * contract event streams with type-safe event payloads.
 */

import type {
  DelegationGrantedEvent,
  DelegationRevokedEvent,
  FeeCollectedEvent,
  StreamDepositEvent,
  StreamPausedEvent,
  StreamResumedEvent,
} from "../generated/payment-stream/src/index";

export type ContractEventRaw = {
  contract_id: string;
  topic: unknown[];
  value: unknown;
};

export const PAYMENT_STREAM_EVENT_TYPES = [
  "FeeCollected",
  "StreamDeposit",
  "StreamPaused",
  "StreamResumed",
  "DelegationGranted",
  "DelegationRevoked",
] as const;

export type PaymentStreamContractEventType =
  (typeof PAYMENT_STREAM_EVENT_TYPES)[number];

export interface PaymentStreamContractEventBase<TPayload> {
  type: PaymentStreamContractEventType;
  contractId: string;
  topic: string[];
  payload: TPayload;
}

export type PaymentStreamContractEvent =
  | PaymentStreamContractEventBase<FeeCollectedEvent>
  | PaymentStreamContractEventBase<StreamDepositEvent>
  | PaymentStreamContractEventBase<StreamPausedEvent>
  | PaymentStreamContractEventBase<StreamResumedEvent>
  | PaymentStreamContractEventBase<DelegationGrantedEvent>
  | PaymentStreamContractEventBase<DelegationRevokedEvent>;

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isBigIntLike(value: unknown): value is bigint | number | string {
  return (
    typeof value === "bigint" ||
    (typeof value === "number" && Number.isSafeInteger(value)) ||
    (typeof value === "string" && /^[0-9]+$/.test(value))
  );
}

function normalizeInteger(value: unknown): bigint | null {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return BigInt(value);
  }
  if (typeof value === "string" && /^[0-9]+$/.test(value)) {
    return BigInt(value);
  }
  return null;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function isValidTopic(topic: unknown[]): topic is string[] {
  return (
    Array.isArray(topic) && topic.every((item) => typeof item === "string")
  );
}

function parseFeeCollectedEvent(value: unknown): FeeCollectedEvent | null {
  const item = asObject(value);
  if (!item) return null;

  const amount = normalizeInteger(item.amount);
  const stream_id = normalizeInteger(item.stream_id);
  if (amount === null || stream_id === null) return null;

  return { amount, stream_id };
}

function parseStreamDepositEvent(value: unknown): StreamDepositEvent | null {
  const item = asObject(value);
  if (!item) return null;

  const amount = normalizeInteger(item.amount);
  const stream_id = normalizeInteger(item.stream_id);
  if (amount === null || stream_id === null) return null;

  return { amount, stream_id };
}

function parseStreamPausedEvent(value: unknown): StreamPausedEvent | null {
  const item = asObject(value);
  if (!item) return null;

  const paused_at = normalizeInteger(item.paused_at);
  const stream_id = normalizeInteger(item.stream_id);
  if (paused_at === null || stream_id === null) return null;

  return { paused_at, stream_id };
}

function parseStreamResumedEvent(value: unknown): StreamResumedEvent | null {
  const item = asObject(value);
  if (!item) return null;

  const paused_duration = normalizeInteger(item.paused_duration);
  const resumed_at = normalizeInteger(item.resumed_at);
  const stream_id = normalizeInteger(item.stream_id);
  if (paused_duration === null || resumed_at === null || stream_id === null)
    return null;

  return { paused_duration, resumed_at, stream_id };
}

function parseDelegationGrantedEvent(
  value: unknown,
): DelegationGrantedEvent | null {
  const item = asObject(value);
  if (!item) return null;

  const delegate = isString(item.delegate) ? item.delegate : null;
  const recipient = isString(item.recipient) ? item.recipient : null;
  const stream_id = normalizeInteger(item.stream_id);
  if (!delegate || !recipient || stream_id === null) return null;

  return { delegate, recipient, stream_id };
}

function parseDelegationRevokedEvent(
  value: unknown,
): DelegationRevokedEvent | null {
  const item = asObject(value);
  if (!item) return null;

  const recipient = isString(item.recipient) ? item.recipient : null;
  const stream_id = normalizeInteger(item.stream_id);
  if (!recipient || stream_id === null) return null;

  return { recipient, stream_id };
}

function isPaymentStreamContractEventType(
  name: string,
): name is PaymentStreamContractEventType {
  return PAYMENT_STREAM_EVENT_TYPES.includes(
    name as PaymentStreamContractEventType,
  );
}

export function parsePaymentStreamContractEvent(
  event: ContractEventRaw,
): PaymentStreamContractEvent | null {
  if (typeof event !== "object" || event === null) {
    return null;
  }

  const { contract_id, topic, value } = event;
  if (
    typeof contract_id !== "string" ||
    !isValidTopic(topic) ||
    topic.length === 0
  ) {
    return null;
  }

  const eventName = topic[0];
  if (!isPaymentStreamContractEventType(eventName)) {
    return null;
  }

  const base = {
    type: eventName,
    contractId: contract_id,
    topic,
  } as const;

  switch (eventName) {
    case "FeeCollected": {
      const payload = parseFeeCollectedEvent(value);
      return payload ? { ...base, payload } : null;
    }
    case "StreamDeposit": {
      const payload = parseStreamDepositEvent(value);
      return payload ? { ...base, payload } : null;
    }
    case "StreamPaused": {
      const payload = parseStreamPausedEvent(value);
      return payload ? { ...base, payload } : null;
    }
    case "StreamResumed": {
      const payload = parseStreamResumedEvent(value);
      return payload ? { ...base, payload } : null;
    }
    case "DelegationGranted": {
      const payload = parseDelegationGrantedEvent(value);
      return payload ? { ...base, payload } : null;
    }
    case "DelegationRevoked": {
      const payload = parseDelegationRevokedEvent(value);
      return payload ? { ...base, payload } : null;
    }
    default:
      return null;
  }
}

export function parsePaymentStreamContractEvents(
  events: readonly ContractEventRaw[] | undefined,
): PaymentStreamContractEvent[] {
  if (!Array.isArray(events)) {
    return [];
  }

  return events.reduce<PaymentStreamContractEvent[]>((acc, event) => {
    const parsed = parsePaymentStreamContractEvent(event);
    if (parsed) acc.push(parsed);
    return acc;
  }, []);
}
