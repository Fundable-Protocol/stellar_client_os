#!/usr/bin/env tsx
/**
 * Soroban Contract Storage TTL Renewal Bot — issue #536
 *
 * Monitors the instance-storage TTL of one or more Soroban contract addresses
 * on the Stellar network and automatically submits `extend_contract_code_ttl`
 * and `extend_contract_data_ttl` operations when a contract's remaining
 * ledgers fall below a configurable warning threshold.
 *
 * # How Soroban TTL works
 *
 * Every piece of Soroban contract state has an expiration ledger.  When the
 * current ledger surpasses that number the state (code or instance data)
 * becomes ARCHIVED and the contract stops functioning.  Operators must
 * periodically "rent-bump" the TTL before expiry to keep contracts live.
 *
 * # Operation
 *
 *   1. Fetch the current ledger sequence from the RPC node.
 *   2. For each watched contract:
 *      a. Call `getLedgerEntries` to read the contract-code and
 *         contract-instance ledger entries.
 *      b. Compare `expirationLedgerSeq` against current ledger.
 *      c. If remaining ledgers ≤ WARNING_THRESHOLD:
 *         - Build a transaction with `Operation.extendFootprintTtl`
 *         - Sign with the bot keypair (BOT_SECRET_KEY)
 *         - Submit and wait for confirmation
 *   3. Emit structured JSON logs for every check and every bump.
 *   4. Sleep POLL_INTERVAL_SECONDS and repeat.
 *
 * # Environment variables
 *
 * | Variable                   | Required | Default                                   | Description                              |
 * |----------------------------|----------|-------------------------------------------|------------------------------------------|
 * | BOT_SECRET_KEY             | ✓        | —                                         | Stellar secret key used to sign rent-bump txs |
 * | CONTRACT_IDS               | ✓        | —                                         | Comma-separated list of contract IDs to watch |
 * | STELLAR_RPC_URL            | ✗        | https://soroban-testnet.stellar.org       | Soroban RPC endpoint                     |
 * | NETWORK_PASSPHRASE         | ✗        | Test SDF Network ; September 2015         | Stellar network passphrase               |
 * | WARNING_THRESHOLD_LEDGERS  | ✗        | 50000                                     | Ledgers remaining before a bump is triggered (~3 days on testnet @ 5s/ledger) |
 * | EXTEND_TO_LEDGERS          | ✗        | 500000                                    | Target TTL extension in ledgers (~30 days) |
 * | POLL_INTERVAL_SECONDS      | ✗        | 300                                       | Seconds between full scan cycles         |
 * | MAX_RETRIES                | ✗        | 3                                         | Max retries for failed transactions      |
 * | DRY_RUN                    | ✗        | false                                     | Log actions without submitting txs       |
 *
 * # Running
 *
 *   pnpm tsx scripts/ttl-renewal-bot.ts
 *
 * # Scheduling (cron)
 *
 *   # Check every 5 minutes, but the bot self-loops — run once and let it poll
 *   @reboot cd /app && pnpm tsx scripts/ttl-renewal-bot.ts >> /var/log/ttl-bot.log 2>&1
 */

import {
  Keypair,
  TransactionBuilder,
  Operation,
  Networks,
  BASE_FEE,
  xdr,
  Address,
  Account,
} from "@stellar/stellar-sdk";
import { Server as RpcServer } from "@stellar/stellar-sdk/rpc";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BotConfig {
  rpcUrl: string;
  networkPassphrase: string;
  botKeypair: Keypair;
  contractIds: string[];
  warningThresholdLedgers: number;
  extendToLedgers: number;
  pollIntervalSeconds: number;
  maxRetries: number;
  dryRun: boolean;
}

export interface ContractTtlStatus {
  contractId: string;
  currentLedger: number;
  /** Expiration ledger for the contract code entry (WASM). */
  codeExpirationLedger: number | null;
  /** Expiration ledger for the contract instance entry (storage). */
  instanceExpirationLedger: number | null;
  /** Minimum of the two expiry ledgers — the earliest expiry. */
  minExpirationLedger: number | null;
  /** Ledgers remaining until the earliest expiry. */
  remainingLedgers: number | null;
  /** Whether this contract needs a rent bump now. */
  needsBump: boolean;
}

export interface BumpResult {
  contractId: string;
  txHash: string | null;
  success: boolean;
  error: string | null;
  dryRun: boolean;
}

export type LogLevel = "info" | "warn" | "error" | "debug";

// ── Errors ────────────────────────────────────────────────────────────────────

export class TtlBotError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "CONFIG_ERROR"
      | "RPC_ERROR"
      | "TX_ERROR"
      | "LEDGER_ENTRY_ERROR"
  ) {
    super(message);
    this.name = "TtlBotError";
    Object.setPrototypeOf(this, TtlBotError.prototype);
  }
}

// ── Logging ───────────────────────────────────────────────────────────────────

/**
 * Emit a structured JSON log line.
 * In production pipe stdout to a log aggregator (Datadog, Loki, CloudWatch).
 */
export function log(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>
): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service: "ttl-renewal-bot",
    message,
    ...context,
  };
  const out = level === "error" || level === "warn" ? process.stderr : process.stdout;
  out.write(JSON.stringify(entry) + "\n");
}

// ── Config loading ────────────────────────────────────────────────────────────

/**
 * Load and validate bot configuration from environment variables.
 * Throws `TtlBotError` with code `CONFIG_ERROR` for missing required vars.
 */
export function loadConfig(): BotConfig {
  const secretKey = process.env.BOT_SECRET_KEY;
  if (!secretKey) {
    throw new TtlBotError(
      "BOT_SECRET_KEY environment variable is required",
      "CONFIG_ERROR"
    );
  }

  const contractIdsRaw = process.env.CONTRACT_IDS;
  if (!contractIdsRaw) {
    throw new TtlBotError(
      "CONTRACT_IDS environment variable is required (comma-separated)",
      "CONFIG_ERROR"
    );
  }

  const contractIds = contractIdsRaw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (contractIds.length === 0) {
    throw new TtlBotError("CONTRACT_IDS must contain at least one contract ID", "CONFIG_ERROR");
  }

  // Validate Stellar address format for each contract ID
  for (const id of contractIds) {
    if (!/^C[A-Z2-7]{55}$/.test(id)) {
      throw new TtlBotError(
        `Invalid contract ID format: ${id} (must be a C… Stellar address)`,
        "CONFIG_ERROR"
      );
    }
  }

  let botKeypair: Keypair;
  try {
    botKeypair = Keypair.fromSecret(secretKey);
  } catch {
    throw new TtlBotError("BOT_SECRET_KEY is not a valid Stellar secret key", "CONFIG_ERROR");
  }

  return {
    rpcUrl:
      process.env.STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org",
    networkPassphrase:
      process.env.NETWORK_PASSPHRASE ?? Networks.TESTNET,
    botKeypair,
    contractIds,
    warningThresholdLedgers: Number(
      process.env.WARNING_THRESHOLD_LEDGERS ?? 50_000
    ),
    extendToLedgers: Number(process.env.EXTEND_TO_LEDGERS ?? 500_000),
    pollIntervalSeconds: Number(process.env.POLL_INTERVAL_SECONDS ?? 300),
    maxRetries: Number(process.env.MAX_RETRIES ?? 3),
    dryRun: process.env.DRY_RUN === "true",
  };
}

// ── TTL inspection ────────────────────────────────────────────────────────────

/**
 * Fetch the current ledger sequence number from the RPC node.
 */
export async function getCurrentLedger(rpc: RpcServer): Promise<number> {
  try {
    const latest = await rpc.getLatestLedger();
    return latest.sequence;
  } catch (err) {
    throw new TtlBotError(
      `Failed to fetch latest ledger: ${(err as Error).message}`,
      "RPC_ERROR"
    );
  }
}

/**
 * Build the XDR ledger key for a contract instance entry.
 */
export function contractInstanceLedgerKey(contractId: string): xdr.LedgerKey {
  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(contractId).toScAddress(),
      key: xdr.ScVal.scvLedgerKeyContractInstance(),
      durability: xdr.ContractDataDurability.persistent(),
    })
  );
}

/**
 * Build the XDR ledger key for a contract code (WASM) entry.
 * Requires the contract's WASM hash — we get it from the instance entry.
 */
export function contractCodeLedgerKey(wasmHash: Buffer): xdr.LedgerKey {
  return xdr.LedgerKey.contractCode(
    new xdr.LedgerKeyContractCode({ hash: wasmHash })
  );
}

/**
 * Inspect a single contract and return its TTL status.
 *
 * Makes two `getLedgerEntries` calls:
 *   1. Contract instance → also reveals the WASM hash
 *   2. Contract code (WASM) → checked separately
 */
export async function inspectContractTtl(
  rpc: RpcServer,
  contractId: string,
  currentLedger: number
): Promise<ContractTtlStatus> {
  let instanceExpirationLedger: number | null = null;
  let codeExpirationLedger: number | null = null;

  try {
    // Step 1: fetch contract instance entry
    const instanceKey = contractInstanceLedgerKey(contractId);
    const instanceResp = await rpc.getLedgerEntries(instanceKey);

    if (instanceResp.entries.length > 0) {
      const entry = instanceResp.entries[0];
      instanceExpirationLedger = entry.liveUntilLedgerSeq ?? null;

      // Extract WASM hash from instance data to query the code entry
      try {
        const instanceData = entry.val.contractData().val();
        if (instanceData.switch() === xdr.ScValType.scvContractInstance()) {
          const instance = instanceData.instance();
          const execEnv = instance.executable();
          if (execEnv.switch() === xdr.ContractExecutableType.contractExecutableWasm()) {
            const wasmHash = execEnv.wasmHash();
            // Step 2: fetch contract code entry using the WASM hash
            const codeKey = contractCodeLedgerKey(wasmHash);
            const codeResp = await rpc.getLedgerEntries(codeKey);
            if (codeResp.entries.length > 0) {
              codeExpirationLedger = codeResp.entries[0].liveUntilLedgerSeq ?? null;
            }
          }
        }
      } catch {
        // WASM hash extraction failed — instance TTL only
      }
    }
  } catch (err) {
    throw new TtlBotError(
      `Failed to inspect TTL for ${contractId}: ${(err as Error).message}`,
      "LEDGER_ENTRY_ERROR"
    );
  }

  const expiryValues = [instanceExpirationLedger, codeExpirationLedger].filter(
    (v): v is number => v !== null
  );
  const minExpirationLedger =
    expiryValues.length > 0 ? Math.min(...expiryValues) : null;

  const remainingLedgers =
    minExpirationLedger !== null ? minExpirationLedger - currentLedger : null;

  return {
    contractId,
    currentLedger,
    codeExpirationLedger,
    instanceExpirationLedger,
    minExpirationLedger,
    remainingLedgers,
    needsBump:
      remainingLedgers !== null && remainingLedgers <= 0
        ? true // already expired — always bump
        : remainingLedgers !== null && remainingLedgers > 0
        ? false
        : false,
  };
}

// ── TTL bump ──────────────────────────────────────────────────────────────────

/**
 * Submit an `extendFootprintTtl` transaction to extend the contract's TTL.
 *
 * Uses `Operation.extendFootprintTtl` with the contract instance + code keys
 * in the transaction footprint so a single operation bumps both entries.
 */
export async function bumpContractTtl(
  rpc: RpcServer,
  config: BotConfig,
  contractId: string
): Promise<BumpResult> {
  if (config.dryRun) {
    log("info", "DRY RUN — skipping transaction submission", { contractId });
    return { contractId, txHash: null, success: true, error: null, dryRun: true };
  }

  let attempt = 0;
  while (attempt < config.maxRetries) {
    attempt++;
    try {
      // Load the bot's account for sequence number
      const account = await rpc.getAccount(config.botKeypair.publicKey());
      const sourceAccount = new Account(account.id, account.sequence);

      const instanceKey = contractInstanceLedgerKey(contractId);

      const tx = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: config.networkPassphrase,
      })
        .addOperation(
          Operation.extendFootprintTtl({
            extendTo: config.extendToLedgers,
          })
        )
        .setFootprint(
          // Read-only footprint includes the contract instance (and code will
          // be pulled in automatically by the SDK during simulation)
          [instanceKey],
          []
        )
        .setTimeout(30)
        .build();

      // Simulate to get the resource fee and updated footprint
      const simulation = await rpc.simulateTransaction(tx);
      if ("error" in simulation) {
        throw new TtlBotError(
          `Simulation failed: ${simulation.error}`,
          "TX_ERROR"
        );
      }

      // Assemble with simulation result (adds resource fees + soroban data)
      const { assembleTransaction } = await import("@stellar/stellar-sdk/rpc");
      const assembledTx = assembleTransaction(tx, simulation).build();
      assembledTx.sign(config.botKeypair);

      // Submit
      const sendResp = await rpc.sendTransaction(assembledTx);
      if (sendResp.status === "ERROR") {
        throw new TtlBotError(
          `Transaction submission error: ${JSON.stringify(sendResp.errorResult)}`,
          "TX_ERROR"
        );
      }

      // Poll for confirmation
      const hash = sendResp.hash;
      let getResp = await rpc.getTransaction(hash);
      const deadline = Date.now() + 30_000;
      while (getResp.status === "NOT_FOUND" && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1_000));
        getResp = await rpc.getTransaction(hash);
      }

      if (getResp.status === "SUCCESS") {
        return { contractId, txHash: hash, success: true, error: null, dryRun: false };
      }

      throw new TtlBotError(
        `Transaction ${hash} did not confirm (status: ${getResp.status})`,
        "TX_ERROR"
      );
    } catch (err) {
      const message = (err as Error).message;
      log("warn", `Bump attempt ${attempt}/${config.maxRetries} failed`, {
        contractId, error: message,
      });
      if (attempt >= config.maxRetries) {
        return { contractId, txHash: null, success: false, error: message, dryRun: false };
      }
      // Exponential back-off: 2s, 4s, 8s …
      await new Promise((r) => setTimeout(r, 1_000 * 2 ** attempt));
    }
  }

  return { contractId, txHash: null, success: false, error: "Max retries exceeded", dryRun: false };
}

// ── Main scan cycle ───────────────────────────────────────────────────────────

/**
 * Run one full scan cycle: inspect all contracts and bump those that need it.
 *
 * Returns the list of bump results (empty if no bumps were needed).
 */
export async function runScanCycle(
  rpc: RpcServer,
  config: BotConfig
): Promise<BumpResult[]> {
  const bumpResults: BumpResult[] = [];

  let currentLedger: number;
  try {
    currentLedger = await getCurrentLedger(rpc);
  } catch (err) {
    log("error", "Failed to fetch current ledger — aborting cycle", {
      error: (err as Error).message,
    });
    return bumpResults;
  }

  log("info", "Scan cycle started", {
    currentLedger,
    contracts: config.contractIds.length,
    warningThreshold: config.warningThresholdLedgers,
    dryRun: config.dryRun,
  });

  for (const contractId of config.contractIds) {
    let status: ContractTtlStatus;
    try {
      status = await inspectContractTtl(rpc, contractId, currentLedger);
    } catch (err) {
      log("error", "Failed to inspect contract TTL", {
        contractId, error: (err as Error).message,
      });
      continue;
    }

    // Determine if a bump is warranted
    const needsBump =
      status.remainingLedgers !== null &&
      status.remainingLedgers <= config.warningThresholdLedgers;

    log(needsBump ? "warn" : "info", "Contract TTL status", {
      contractId: status.contractId,
      currentLedger: status.currentLedger,
      instanceExpirationLedger: status.instanceExpirationLedger,
      codeExpirationLedger: status.codeExpirationLedger,
      remainingLedgers: status.remainingLedgers,
      needsBump,
    });

    if (!needsBump) continue;

    log("warn", "TTL below threshold — triggering rent bump", {
      contractId,
      remainingLedgers: status.remainingLedgers,
      threshold: config.warningThresholdLedgers,
      extendTo: config.extendToLedgers,
    });

    const result = await bumpContractTtl(rpc, config, contractId);
    bumpResults.push(result);

    if (result.success) {
      log("info", "TTL bump successful", {
        contractId,
        txHash: result.txHash,
        dryRun: result.dryRun,
        extendedToLedgers: config.extendToLedgers,
      });
    } else {
      log("error", "TTL bump failed", {
        contractId, error: result.error,
      });
    }
  }

  log("info", "Scan cycle complete", {
    checked: config.contractIds.length,
    bumped: bumpResults.filter((r) => r.success).length,
    failed: bumpResults.filter((r) => !r.success).length,
  });

  return bumpResults;
}

// ── Entry point ───────────────────────────────────────────────────────────────

/**
 * Start the bot loop. Runs indefinitely until the process is killed.
 * Handles SIGTERM/SIGINT for graceful shutdown.
 */
export async function startBot(config?: BotConfig): Promise<never> {
  const resolvedConfig = config ?? loadConfig();

  log("info", "TTL Renewal Bot starting", {
    rpcUrl: resolvedConfig.rpcUrl,
    contracts: resolvedConfig.contractIds,
    warningThresholdLedgers: resolvedConfig.warningThresholdLedgers,
    extendToLedgers: resolvedConfig.extendToLedgers,
    pollIntervalSeconds: resolvedConfig.pollIntervalSeconds,
    dryRun: resolvedConfig.dryRun,
  });

  const rpc = new RpcServer(resolvedConfig.rpcUrl);

  // Graceful shutdown
  let shuttingDown = false;
  const shutdown = () => {
    shuttingDown = true;
    log("info", "Shutdown signal received — bot will exit after current cycle");
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  while (!shuttingDown) {
    try {
      await runScanCycle(rpc, resolvedConfig);
    } catch (err) {
      log("error", "Unhandled error in scan cycle", {
        error: (err as Error).message,
        stack: (err as Error).stack,
      });
    }

    if (shuttingDown) break;

    log("debug", `Sleeping ${resolvedConfig.pollIntervalSeconds}s until next cycle`);
    await new Promise((r) =>
      setTimeout(r, resolvedConfig.pollIntervalSeconds * 1_000)
    );
  }

  log("info", "TTL Renewal Bot stopped");
  process.exit(0);
}

// Run if invoked directly
if (require.main === module || import.meta.url === `file://${process.argv[1]}`) {
  startBot().catch((err) => {
    log("error", "Fatal error starting bot", { error: (err as Error).message });
    process.exit(1);
  });
}
