#!/usr/bin/env node
/**
 * Regenerates SDK contract bindings from the current local contract WASM files.
 *
 * The script builds the contracts with the Stellar CLI, then runs
 * `stellar contract bindings typescript --wasm` for each SDK-generated client.
 *
 * Usage:
 *   node scripts/regenerate-types-from-wasm.js
 *   node scripts/regenerate-types-from-wasm.js --contract payment-stream
 *   node scripts/regenerate-types-from-wasm.js --skip-build
 *   node scripts/regenerate-types-from-wasm.js --no-optimize
 */

import { spawnSync } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../../");
const sdkRoot = resolve(__dirname, "..");
const contractsRoot = resolve(repoRoot, "contracts");
const wasmOutDir = resolve(sdkRoot, ".contract-wasm");

const args = process.argv.slice(2);
const selectedContract = readFlagValue("--contract");
const skipBuild = args.includes("--skip-build");
const optimize = !args.includes("--no-optimize");

const CONTRACTS = [
  {
    name: "payment-stream",
    packageName: "payment-stream",
    wasmFile: "payment_stream.wasm",
    outputDir: resolve(sdkRoot, "src/generated/payment-stream"),
  },
  {
    name: "distributor",
    packageName: "distributor",
    wasmFile: "distributor.wasm",
    outputDir: resolve(sdkRoot, "src/generated/distributor"),
  },
];

function readFlagValue(flag) {
  const equalsArg = args.find((arg) => arg.startsWith(`${flag}=`));
  if (equalsArg) {
    return equalsArg.slice(flag.length + 1);
  }

  const flagIndex = args.indexOf(flag);
  return flagIndex === -1 ? undefined : args[flagIndex + 1];
}

function quote(value) {
  return value.includes(" ") ? `"${value}"` : value;
}

function run(command, commandArgs, label) {
  console.log(`\n[regenerate-types:wasm] ${label}`);
  console.log(`  $ ${[command, ...commandArgs].map(quote).join(" ")}\n`);

  const result = spawnSync(command, commandArgs, {
    cwd: repoRoot,
    stdio: "inherit",
  });

  if (result.status === 0) {
    return;
  }

  if (result.error) {
    throw result.error;
  }

  throw new Error(`${command} exited with status ${result.status}`);
}

function checkStellarCli() {
  const result = spawnSync("stellar", ["--version"], { stdio: "pipe" });

  if (result.status !== 0) {
    console.error(
      "[regenerate-types:wasm] ERROR: `stellar` CLI not found.\n" +
        "  Install it via: cargo install stellar-cli --features opt\n" +
        "  Docs: https://developers.stellar.org/docs/tools/developer-tools/cli/stellar-cli"
    );
    process.exit(1);
  }
}

function selectedContracts() {
  if (!selectedContract) {
    return CONTRACTS;
  }

  const matches = CONTRACTS.filter(
    (contract) =>
      contract.name === selectedContract ||
      contract.packageName === selectedContract
  );

  if (matches.length === 0) {
    console.error(
      `[regenerate-types:wasm] Unknown contract "${selectedContract}". ` +
        `Expected one of: ${CONTRACTS.map((contract) => contract.name).join(", ")}.`
    );
    process.exit(1);
  }

  return matches;
}

checkStellarCli();
mkdirSync(wasmOutDir, { recursive: true });

const contracts = selectedContracts();

if (!skipBuild) {
  for (const contract of contracts) {
    const buildArgs = [
      "contract",
      "build",
      "--manifest-path",
      resolve(contractsRoot, "Cargo.toml"),
      "--package",
      contract.packageName,
      "--out-dir",
      wasmOutDir,
    ];

    if (optimize) {
      buildArgs.push("--optimize");
    }

    run(
      "stellar",
      buildArgs,
      `Building ${contract.name}${optimize ? " with optimization" : ""}`
    );
  }
}

let hasError = false;

for (const contract of contracts) {
  const wasmPath = resolve(wasmOutDir, contract.wasmFile);

  if (!existsSync(wasmPath)) {
    console.error(
      `[regenerate-types:wasm] Missing WASM for ${contract.name}: ${wasmPath}\n` +
        "  Run without --skip-build, or build the contracts before regenerating."
    );
    hasError = true;
    continue;
  }

  try {
    run(
      "stellar",
      [
        "contract",
        "bindings",
        "typescript",
        "--wasm",
        wasmPath,
        "--output-dir",
        contract.outputDir,
        "--overwrite",
      ],
      `Regenerating bindings for ${contract.name}`
    );
    console.log(
      `[regenerate-types:wasm] ${contract.name} bindings written to ${contract.outputDir}`
    );
  } catch (err) {
    console.error(
      `[regenerate-types:wasm] Failed to regenerate ${contract.name}: ${err.message}`
    );
    hasError = true;
  }
}

if (hasError) {
  console.error("\n[regenerate-types:wasm] Completed with errors.");
  process.exit(1);
}

console.log("\n[regenerate-types:wasm] All bindings regenerated successfully.");
