#!/usr/bin/env tsx
/**
 * Soroban Stream Event CDC Indexer — issue #531
 *
 * Background service that listens for Soroban contract events emitted by
 * the Fundable payment-stream contract and indexes stream history into
 * PostgreSQL for efficient off-chain querying.
 *
 * # Architecture
 *
 * This is a Change Data Capture (CDC) pattern:
 *   1. Poll the Stellar Soroban RPC `getEvents` endpoint on each tick.
 *   2. Parse raw XDR event data into typed `StreamEvent` records.
 *   3. Write new events to `stream_events` table via an UPSERT
 *      (idempotent on `event_id`).
 *   4. Persist the latest processed ledger sequence in `cdc_cursors`
 *      so restarts resume from the correct position without gaps or
 *      duplicate processing.
 *
 * # Table schemas
 *
 * ```sql
 * CREATE TABLE IF NOT EXISTS stream_events (
 *   id              BIGSERIAL PRIMARY KEY,
 *   event_id        TEXT        NOT NULL UNIQUE,   -- <ledger>-<tx_index>-<event_index>
 *   contract_id     TEXT        NOT NULL,
 *   event_type      TEXT        NOT NULL,          -- stream_created|updated|cancelled|completed
 *   ledger_sequence BIGINT      NOT NULL,
 *   ledger_timestamp TIMESTAMPTZ NOT NULL,
 *   tx_hash         TEXT        NOT NULL,
 *   sender          TEXT,
 *   recipient       TEXT,
 *   asset           TEXT,
 *   amount          NUMERIC,
 *   stream_id       TEXT,
 *   raw_xdr         TEXT        NOT NULL,
 *   indexed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
 * );
 *
 * CREATE TABLE IF NOT EXISTS cdc_cursors (
 *   indexer_id      TEXT        PRIMARY KEY,
 *   last_ledger     BIGINT      NOT NULL,
 *   updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
 * );
 * ```
 *
 * # Environment variables
 *
 * | Variable              | Required | Default                                  | Description |
 * |-----------------------|----------|------------------------------------------|-------------|
 * | DATABASE_URL          | ✓        | —                                        | PostgreSQL connection string |
 * | CONTRACT_IDS          | ✓        | —                                        | Comma-separated Soroban contract IDs |
 * | STELLAR_RPC_URL       | ✗        | https://soroban-testnet.stellar.org      | Soroban RPC endpoint |
 * | NETWORK_PASSPHRASE    | ✗        | Test SDF Network ; September 2015        | Stellar network passphrase |
 * | POLL_INTERVAL_SECONDS | ✗        | 5                                        | Seconds between event polls |
 * | LEDGER_LOOKBACK       | ✗        | 1000                                     | Ledgers to look back on first start |
 * | MAX_EVENTS_PER_POLL   | ✗        | 200                                      | Max events fetched per poll cycle |
 * | INDEXER_ID            | ✗        | fundable_stream_indexer                  | Unique ID for the cursor row |
 * | DRY_RUN               | ✗        | false                                    | Parse events but skip DB writes |
 *
 * # Running
 *
 *   pnpm tsx scripts/cdc-indexer.ts
 */

import { Pool, type PoolClient } from "pg";
import {
  Networks,
  xdr,
  scValToNative,
  type SorobanEvent,
} from "@stellar/stellar-sdk";
import { Server as RpcServer } from "@stellar/stellar-sdk/rpc";

// ── Types ─────────────────────────────────────────────────────────────────────

export type StreamEventType =
  | "stream_created"
  | "stream_updated"
  | "stream_cancelled"
  | "stream_completed"
  | "stream_withdrawn"
  | "unknown";

export interface StreamEvent {
  /** Unique event identifier: <ledger>-<txIndex>-<eventIndex> */
  eventId: string;
  contractId: string;
  eventType: StreamEventType;
  ledgerSequence: number;
  /** ISO 8601 timestamp */
  ledgerTimestamp: string;
  txHash: string;
  sender: string | null;
  recipient: string | null;
  /** Token contract address */
  asset: string | null;
  /** Amount in stroops as a string (avoids JS precision loss) */
  amount: string | null;
  /** On-chain stream identifier */
  streamId: string | null;
  /** Raw XDR of the event value */
  rawXdr: string;
}

export interface CdcCursor {
  indexerId: string;
  lastLedger: number;
  updatedAt: string;
}

export interface IndexerConfig {
  databaseUrl: string;
  contractIds: string[];
  rpcUrl: string;
  networkPassphrase: string;
  pollIntervalSeconds: number;
  ledgerLookback: number;
  maxEventsPerPoll: number;
  indexerId: string;
  dryRun: boolean;
}

export type LogLevel = "info" | "warn" | "error" | "debug";

/** Pluggable DB interface for testing. */
export interface DbClient {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

// ── Errors ────────────────────────────────────────────────────────────────────

export class IndexerError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "CONFIG_ERROR"
      | "DB_ERROR"
      | "RPC_ERROR"
      | "PARSE_ERROR"
  ) {
    super(message);
    this.name = "IndexerError";
    Object.setPrototypeOf(this, IndexerError.prototype);
  }
}

// ── Logging ───────────────────────────────────────────────────────────────────

export function log(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>
): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service: "cdc-indexer",
    message,
    ...context,
  };
  const out = level === "error" || level === "warn" ? process.stderr : process.stdout;
  out.write(JSON.stringify(entry) + "\n");
}

// ── Config ────────────────────────────────────────────────────────────────────

export function loadConfig(): IndexerConfig {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new IndexerError("DATABASE_URL environment variable is required", "CONFIG_ERROR");
  }

  const contractIdsRaw = process.env.CONTRACT_IDS;
  if (!contractIdsRaw) {
    throw new IndexerError(
      "CONTRACT_IDS environment variable is required (comma-separated Soroban contract IDs)",
      "CONFIG_ERROR"
    );
  }

  const contractIds = contractIdsRaw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (contractIds.length === 0) {
    throw new IndexerError("CONTRACT_IDS must contain at least one contract ID", "CONFIG_ERROR");
  }

  for (const id of contractIds) {
    if (!/^C[A-Z2-7]{55}$/.test(id)) {
      throw new IndexerError(
        `Invalid contract ID format: ${id} (must be a C… Stellar address)`,
        "CONFIG_ERROR"
      );
    }
  }

  return {
    databaseUrl,
    contractIds,
    rpcUrl: process.env.STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org",
    networkPassphrase: process.env.NETWORK_PASSPHRASE ?? Networks.TESTNET,
    pollIntervalSeconds: Number(process.env.POLL_INTERVAL_SECONDS ?? 5),
    ledgerLookback: Number(process.env.LEDGER_LOOKBACK ?? 1_000),
    maxEventsPerPoll: Number(process.env.MAX_EVENTS_PER_POLL ?? 200),
    indexerId: process.env.INDEXER_ID ?? "fundable_stream_indexer",
    dryRun: process.env.DRY_RUN === "true",
  };
}

// ── Database helpers ──────────────────────────────────────────────────────────

/**
 * Ensure the required tables exist. Idempotent — safe to call on every startup.
 */
export async function ensureSchema(db: DbClient): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS stream_events (
      id               BIGSERIAL    PRIMARY KEY,
      event_id         TEXT         NOT NULL UNIQUE,
      contract_id      TEXT         NOT NULL,
      event_type       TEXT         NOT NULL,
      ledger_sequence  BIGINT       NOT NULL,
      ledger_timestamp TIMESTAMPTZ  NOT NULL,
      tx_hash          TEXT         NOT NULL,
      sender           TEXT,
      recipient        TEXT,
      asset            TEXT,
      amount           NUMERIC,
      stream_id        TEXT,
      raw_xdr          TEXT         NOT NULL,
      indexed_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_stream_events_contract
      ON stream_events (contract_id)
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_stream_events_ledger
      ON stream_events (ledger_sequence)
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_stream_events_sender
      ON stream_events (sender) WHERE sender IS NOT NULL
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_stream_events_recipient
      ON stream_events (recipient) WHERE recipient IS NOT NULL
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS cdc_cursors (
      indexer_id  TEXT        PRIMARY KEY,
      last_ledger BIGINT      NOT NULL,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

/**
 * Read the last processed ledger for this indexer instance.
 * Returns `null` if no cursor exists (first run).
 */
export async function getCursor(
  db: DbClient,
  indexerId: string
): Promise<number | null> {
  const result = await db.query<{ last_ledger: string }>(
    "SELECT last_ledger FROM cdc_cursors WHERE indexer_id = $1",
    [indexerId]
  );
  if (result.rows.length === 0) return null;
  return Number(result.rows[0].last_ledger);
}

/**
 * Persist the latest processed ledger sequence.
 */
export async function setCursor(
  db: DbClient,
  indexerId: string,
  lastLedger: number
): Promise<void> {
  await db.query(
    `INSERT INTO cdc_cursors (indexer_id, last_ledger, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (indexer_id)
     DO UPDATE SET last_ledger = EXCLUDED.last_ledger, updated_at = NOW()`,
    [indexerId, lastLedger]
  );
}

/**
 * Upsert a batch of stream events. Idempotent on `event_id`.
 */
export async function insertEvents(
  db: DbClient,
  events: StreamEvent[]
): Promise<number> {
  if (events.length === 0) return 0;

  let inserted = 0;
  for (const ev of events) {
    const result = await db.query(
      `INSERT INTO stream_events (
         event_id, contract_id, event_type, ledger_sequence, ledger_timestamp,
         tx_hash, sender, recipient, asset, amount, stream_id, raw_xdr
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (event_id) DO NOTHING`,
      [
        ev.eventId,
        ev.contractId,
        ev.eventType,
        ev.ledgerSequence,
        ev.ledgerTimestamp,
        ev.txHash,
        ev.sender,
        ev.recipient,
        ev.asset,
        ev.amount,
        ev.streamId,
        ev.rawXdr,
      ]
    );
    // pg returns rowCount for INSERT
    if ((result as unknown as { rowCount: number }).rowCount > 0) inserted++;
  }
  return inserted;
}

// ── Event parsing ─────────────────────────────────────────────────────────────

/** Map raw event topic strings to typed StreamEventType. */
export function parseEventType(topics: string[]): StreamEventType {
  const topicStr = topics.join(",").toLowerCase();
  if (topicStr.includes("create") || topicStr.includes("stream_created")) return "stream_created";
  if (topicStr.includes("update") || topicStr.includes("stream_updated")) return "stream_updated";
  if (topicStr.includes("cancel") || topicStr.includes("stream_cancelled")) return "stream_cancelled";
  if (topicStr.includes("complete") || topicStr.includes("stream_completed")) return "stream_completed";
  if (topicStr.includes("withdraw") || topicStr.includes("stream_withdrawn")) return "stream_withdrawn";
  return "unknown";
}

/**
 * Parse a raw Soroban event into a typed `StreamEvent`.
 *
 * The Fundable stream contract emits events with the following structure:
 *   topics[0]: event name symbol ("stream_created", "stream_updated", etc.)
 *   topics[1]: sender address
 *   topics[2]: recipient address
 *   value:     map { stream_id, asset, amount }
 *
 * This parser is defensive — missing fields are set to null rather than
 * throwing, so a malformed event does not halt the indexer.
 */
export function parseStreamEvent(
  rawEvent: SorobanEvent,
  ledgerSequence: number,
  ledgerTimestamp: number
): StreamEvent {
  const eventId = `${ledgerSequence}-${rawEvent.id ?? "0"}`;
  const contractId = rawEvent.contractId ?? "";
  const txHash = rawEvent.txHash ?? "";
  const rawXdr = rawEvent.value?.xdr ?? "";

  // Parse topics
  const topicStrings: string[] = [];
  let sender: string | null = null;
  let recipient: string | null = null;

  try {
    const topics = rawEvent.topic ?? [];
    for (let i = 0; i < topics.length; i++) {
      try {
        const decoded = scValToNative(xdr.ScVal.fromXDR(topics[i] as unknown as string, "base64"));
        const str = String(decoded);
        topicStrings.push(str);
        if (i === 1 && str.startsWith("G")) sender = str;
        if (i === 2 && str.startsWith("G")) recipient = str;
      } catch {
        topicStrings.push("");
      }
    }
  } catch {
    // Topic parsing failed — continue with empty topics
  }

  // Parse value (map containing stream details)
  let asset: string | null = null;
  let amount: string | null = null;
  let streamId: string | null = null;

  try {
    if (rawXdr) {
      const val = scValToNative(xdr.ScVal.fromXDR(rawXdr, "base64"));
      if (val && typeof val === "object") {
        const map = val as Record<string, unknown>;
        if (map.asset) asset = String(map.asset);
        if (map.amount != null) amount = String(map.amount);
        if (map.stream_id) streamId = String(map.stream_id);
        if (map.id) streamId = String(map.id);
      }
    }
  } catch {
    // Value parsing failed — leave fields null
  }

  const eventType = parseEventType(topicStrings);

  return {
    eventId,
    contractId,
    eventType,
    ledgerSequence,
    ledgerTimestamp: new Date(ledgerTimestamp * 1_000).toISOString(),
    txHash,
    sender,
    recipient,
    asset,
    amount,
    streamId,
    rawXdr,
  };
}

// ── RPC polling ───────────────────────────────────────────────────────────────

/**
 * Fetch events from the Soroban RPC for all watched contracts since
 * `startLedger`.
 */
export async function fetchEvents(
  rpc: RpcServer,
  contractIds: string[],
  startLedger: number,
  limit: number
): Promise<SorobanEvent[]> {
  try {
    const response = await rpc.getEvents({
      startLedger,
      filters: contractIds.map((id) => ({
        type: "contract" as const,
        contractIds: [id],
      })),
      limit,
    });
    return response.events ?? [];
  } catch (err) {
    throw new IndexerError(
      `RPC getEvents failed: ${(err as Error).message}`,
      "RPC_ERROR"
    );
  }
}

/**
 * Fetch the current ledger sequence from the RPC.
 */
export async function getCurrentLedger(rpc: RpcServer): Promise<number> {
  try {
    const latest = await rpc.getLatestLedger();
    return latest.sequence;
  } catch (err) {
    throw new IndexerError(
      `Failed to fetch latest ledger: ${(err as Error).message}`,
      "RPC_ERROR"
    );
  }
}

// ── Main poll cycle ───────────────────────────────────────────────────────────

/**
 * Run one full poll cycle:
 *   1. Read cursor from DB.
 *   2. Fetch events since cursor (or lookback) from RPC.
 *   3. Parse and upsert into stream_events.
 *   4. Advance cursor to latest ledger.
 *
 * Returns the number of new events indexed.
 */
export async function runPollCycle(
  db: DbClient,
  rpc: RpcServer,
  config: IndexerConfig
): Promise<number> {
  // Step 1: determine start ledger
  const cursor = await getCursor(db, config.indexerId);
  let currentLedger: number;
  try {
    currentLedger = await getCurrentLedger(rpc);
  } catch (err) {
    log("error", "Failed to fetch current ledger — aborting cycle", {
      error: (err as Error).message,
    });
    return 0;
  }

  const startLedger =
    cursor !== null
      ? cursor + 1
      : Math.max(1, currentLedger - config.ledgerLookback);

  if (startLedger > currentLedger) {
    log("debug", "Already at latest ledger — nothing to index", {
      currentLedger,
      cursor,
    });
    return 0;
  }

  log("info", "Poll cycle started", {
    startLedger,
    currentLedger,
    contracts: config.contractIds.length,
    dryRun: config.dryRun,
  });

  // Step 2: fetch events
  let rawEvents: SorobanEvent[];
  try {
    rawEvents = await fetchEvents(
      rpc,
      config.contractIds,
      startLedger,
      config.maxEventsPerPoll
    );
  } catch (err) {
    log("error", "Failed to fetch events", { error: (err as Error).message });
    return 0;
  }

  log("info", `Fetched ${rawEvents.length} raw events`, {
    startLedger,
    currentLedger,
  });

  // Step 3: parse events
  const parsedEvents: StreamEvent[] = [];
  for (const raw of rawEvents) {
    try {
      const parsed = parseStreamEvent(
        raw,
        raw.ledger ?? startLedger,
        raw.ledgerClosedAt
          ? Math.floor(new Date(raw.ledgerClosedAt).getTime() / 1_000)
          : Math.floor(Date.now() / 1_000)
      );
      parsedEvents.push(parsed);
    } catch (err) {
      log("warn", "Failed to parse event — skipping", {
        eventId: raw.id,
        error: (err as Error).message,
      });
    }
  }

  // Step 4: write to DB (unless dry run)
  let indexed = 0;
  if (!config.dryRun) {
    try {
      indexed = await insertEvents(db, parsedEvents);
      await setCursor(db, config.indexerId, currentLedger);
    } catch (err) {
      log("error", "Failed to write events to database", {
        error: (err as Error).message,
      });
      return 0;
    }
  } else {
    indexed = parsedEvents.length;
    log("info", "DRY RUN — skipping database writes", {
      parsedCount: parsedEvents.length,
    });
  }

  log("info", "Poll cycle complete", {
    rawEvents: rawEvents.length,
    parsed: parsedEvents.length,
    indexed,
    currentLedger,
  });

  return indexed;
}

// ── Entry point ───────────────────────────────────────────────────────────────

/**
 * Start the CDC indexer loop. Runs indefinitely until SIGTERM/SIGINT.
 */
export async function startIndexer(config?: IndexerConfig): Promise<never> {
  const resolvedConfig = config ?? loadConfig();

  log("info", "CDC Indexer starting", {
    rpcUrl: resolvedConfig.rpcUrl,
    contracts: resolvedConfig.contractIds,
    pollIntervalSeconds: resolvedConfig.pollIntervalSeconds,
    ledgerLookback: resolvedConfig.ledgerLookback,
    dryRun: resolvedConfig.dryRun,
  });

  const pool = new Pool({ connectionString: resolvedConfig.databaseUrl });
  const rpc = new RpcServer(resolvedConfig.rpcUrl);

  // Ensure schema on startup
  const client: PoolClient = await pool.connect();
  try {
    await ensureSchema(client);
    log("info", "Database schema verified");
  } finally {
    client.release();
  }

  let shuttingDown = false;
  const shutdown = async () => {
    shuttingDown = true;
    log("info", "Shutdown signal received — waiting for current cycle to finish");
    await pool.end();
    log("info", "CDC Indexer stopped");
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  while (!shuttingDown) {
    const dbClient = await pool.connect();
    try {
      await runPollCycle(dbClient, rpc, resolvedConfig);
    } catch (err) {
      log("error", "Unhandled error in poll cycle", {
        error: (err as Error).message,
        stack: (err as Error).stack,
      });
    } finally {
      dbClient.release();
    }

    if (shuttingDown) break;

    log("debug", `Sleeping ${resolvedConfig.pollIntervalSeconds}s until next cycle`);
    await new Promise((r) => setTimeout(r, resolvedConfig.pollIntervalSeconds * 1_000));
  }

  process.exit(0);
}

// Run if invoked directly
if (require.main === module || import.meta.url === `file://${process.argv[1]}`) {
  startIndexer().catch((err) => {
    log("error", "Fatal error starting CDC indexer", {
      error: (err as Error).message,
    });
    process.exit(1);
  });
}
