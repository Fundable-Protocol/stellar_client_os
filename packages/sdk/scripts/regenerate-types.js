#!/usr/bin/env node
/**
 * regenerate-types.js
 *
 * Regenerates src/generated/{payment-stream,distributor} TypeScript bindings
 * from live contract specs using the Stellar CLI (`stellar contract bindings ts`).
 *
 * Usage:
 *   node scripts/regenerate-types.js [--network testnet|mainnet]
 *
 * Environment variables (all optional — CLI flags take precedence):
 *   STELLAR_NETWORK          testnet | mainnet  (default: testnet)
 *   PAYMENT_STREAM_CONTRACT_ID
 *   DISTRIBUTOR_CONTRACT_ID
 *   SOROBAN_RPC_URL
 *
 * Contract IDs fall back to deployments/<network>.json when env vars are absent.
 */

import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../../");
const sdkRoot = resolve(__dirname, "..");

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const networkFlag = args.find((a) => a.startsWith("--network="))?.split("=")[1]
  ?? args[args.indexOf("--network") + 1];

const NETWORK = networkFlag ?? process.env.STELLAR_NETWORK ?? "testnet";

if (!["testnet", "mainnet"].includes(NETWORK)) {
  console.error(`[regenerate-types] Unknown network "${NETWORK}". Use testnet or mainnet.`);
  process.exit(1);
}

// ── Network config ────────────────────────────────────────────────────────────
const NETWORK_CONFIG = {
  testnet: {
    rpcUrl: "https://soroban-testnet.stellar.org",
    passphrase: "Test SDF Network ; September 2015",
  },
  mainnet: {
    rpcUrl: "https://horizon.stellar.org",
    passphrase: "Public Global Stellar Network ; September 2015",
  },
};

const { rpcUrl: defaultRpcUrl, passphrase } = NETWORK_CONFIG[NETWORK];
const rpcUrl = process.env.SOROBAN_RPC_URL ?? defaultRpcUrl;

// ── Contract IDs — env → deployments JSON fallback ───────────────────────────
const deploymentsPath = resolve(repoRoot, `deployments/${NETWORK}.json`);
let deployments = {};
if (existsSync(deploymentsPath)) {
  deployments = JSON.parse(readFileSync(deploymentsPath, "utf8"));
}

const CONTRACTS = [
  {
    name: "payment-stream",
    id: process.env.PAYMENT_STREAM_CONTRACT_ID ?? deployments.payment_stream,
    outputDir: resolve(sdkRoot, "src/generated/payment-stream"),
  },
  {
    name: "distributor",
    id: process.env.DISTRIBUTOR_CONTRACT_ID ?? deployments.distributor,
    outputDir: resolve(sdkRoot, "src/generated/distributor"),
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function run(cmd, label) {
  console.log(`\n[regenerate-types] ${label}`);
  console.log(`  $ ${cmd}\n`);
  execSync(cmd, { stdio: "inherit" });
}

function checkStellarCli() {
  try {
    execSync("stellar --version", { stdio: "pipe" });
  } catch {
    console.error(
      "[regenerate-types] ERROR: `stellar` CLI not found.\n" +
      "  Install it via: cargo install stellar-cli --features opt\n" +
      "  Docs: https://developers.stellar.org/docs/tools/developer-tools/cli/stellar-cli"
    );
    process.exit(1);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
checkStellarCli();

console.log(`[regenerate-types] Network : ${NETWORK}`);
console.log(`[regenerate-types] RPC URL : ${rpcUrl}`);
console.log(`[regenerate-types] Passphrase: ${passphrase}\n`);

let hasError = false;

for (const contract of CONTRACTS) {
  if (!contract.id) {
    console.warn(
      `[regenerate-types] SKIP ${contract.name}: no contract ID found.\n` +
      `  Set env var or add an entry to deployments/${NETWORK}.json`
    );
    hasError = true;
    continue;
  }

  try {
    run(
      [
        "stellar contract bindings typescript",
        `--rpc-url "${rpcUrl}"`,
        `--network-passphrase "${passphrase}"`,
        `--contract-id ${contract.id}`,
        `--output-dir "${contract.outputDir}"`,
        "--overwrite",
      ].join(" \\\n    "),
      `Regenerating bindings for ${contract.name} (${contract.id})`
    );
    console.log(`[regenerate-types] ✓ ${contract.name} bindings written to ${contract.outputDir}`);
  } catch (err) {
    console.error(`[regenerate-types] ✗ Failed to regenerate ${contract.name}: ${err.message}`);
    hasError = true;
  }
}

if (hasError) {
  console.error("\n[regenerate-types] Completed with errors.");
  process.exit(1);
} else {
  console.log("\n[regenerate-types] All bindings regenerated successfully.");
}
