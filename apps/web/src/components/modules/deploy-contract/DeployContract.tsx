"use client";

import { useState } from "react";
import { useWallet } from "@/providers/StellarWalletProvider";
import { WalletNetwork } from "@creit.tech/stellar-wallets-kit";
import { ContractDeployer } from "@/services/contract.deployer";
import { CopyIcon, CheckCircle2, InfoIcon } from "lucide-react";

export default function DeployContract() {
  const { address, isConnected, signTransaction, network } = useWallet();
  const [sourceCode, setSourceCode] = useState<string>(
    `#![no_std]
use soroban_sdk::{contract, contractimpl, symbol_short, vec, Env, Symbol, Vec};

#[contract]
pub struct HelloContract;

#[contractimpl]
impl HelloContract {
    pub fn hello(env: Env, to: Symbol) -> Vec<Symbol> {
        vec![&env, symbol_short!("Hello"), to]
    }
}
`
  );
  const [status, setStatus] = useState<string>("");
  const [isDeploying, setIsDeploying] = useState<boolean>(false);
  const [contractId, setContractId] = useState<string | null>(null);
  /** Contract ID derived before the create-contract transaction is signed. */
  const [predictedContractId, setPredictedContractId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const networkPassphrase =
    network === WalletNetwork.TESTNET
      ? "Test SDF Network ; September 2015"
      : "Public Global Stellar Network ; September 2015";

  const handleDeploy = async () => {
    if (!isConnected || !address) {
      setError("Please connect your wallet to deploy a contract.");
      return;
    }

    try {
      setIsDeploying(true);
      setError(null);
      setContractId(null);
      setPredictedContractId(null);
      setStatus("Compiling Rust source to WASM (this may take a few seconds)...");

      const res = await fetch("/api/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceCode }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Compilation failed");
      }

      setStatus("Compilation successful! Uploading WASM...");

      const wasmBytes = Uint8Array.from(atob(data.wasmBase64), (c) =>
        c.charCodeAt(0)
      );

      // Configure the deployer based on selected network
      const isTestnet = network === WalletNetwork.TESTNET;
      const deployer = new ContractDeployer({
        rpcUrl: isTestnet
          ? "https://soroban-testnet.stellar.org"
          : "https://soroban.stellar.org",
        networkPassphrase,
      });

      // ── Step 1: Upload WASM ──────────────────────────────────────────────
      setStatus("Estimating upload cost...");
      const { transaction: uploadTx, simulation: uploadSim } =
        await deployer.buildUploadWasmTx(address, wasmBytes);

      const uploadFee = Number(uploadSim.minResourceFee) / 10_000_000;
      setStatus(
        `Upload estimated at ${uploadFee.toFixed(4)} XLM. Waiting for signature...`
      );

      const signedUploadXdr = await signTransaction(uploadTx.toXDR());
      setStatus("Submitting upload to network...");
      const uploadResult = await deployer.submitSignedTransaction(signedUploadXdr);
      const wasmHash = deployer.parseWasmHashFromUpload(uploadResult);

      setStatus("WASM uploaded successfully! Preparing contract creation...");

      // ── Step 2: Derive contract ID before signing ────────────────────────
      // buildCreateContractTx generates (or accepts) a salt and returns it so
      // we can compute the contract ID deterministically — before the user
      // signs or any transaction is submitted.
      const { transaction: createTx, simulation: createSim, salt } =
        await deployer.buildCreateContractTx(address, wasmHash);

      // Standard Stellar derivation:
      //   SHA-256( HashIdPreimage{ networkId: SHA-256(passphrase), preimage: ContractIdPreimageFromAddress } )
      // encoded as a Stellar contract strkey (C…).
      const predicted = ContractDeployer.deriveContractId(
        address,
        salt,
        networkPassphrase
      );
      setPredictedContractId(predicted);

      const createFee = Number(createSim.minResourceFee) / 10_000_000;
      setStatus(
        `Contract ID predicted. Create estimated at ${createFee.toFixed(4)} XLM. Waiting for signature...`
      );

      // ── Step 3: Sign & submit create-contract transaction ────────────────
      const signedCreateXdr = await signTransaction(createTx.toXDR());
      setStatus("Submitting contract creation to network...");
      const createResult = await deployer.submitSignedTransaction(signedCreateXdr);

      // Parse the on-chain result and sanity-check against our prediction.
      const deployedId = deployer.parseContractIdFromCreate(createResult);
      if (deployedId !== predicted) {
        // Should never happen — logged for debugging if it ever does.
        console.error(
          `Contract ID mismatch! Predicted: ${predicted}, Got: ${deployedId}`
        );
      }

      setContractId(deployedId);
      setStatus("Contract successfully deployed!");
    } catch (err: unknown) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : "An unknown error occurred during deployment."
      );
      setStatus("");
    } finally {
      setIsDeploying(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* ── Code editor ── */}
      <div className="w-full lg:w-2/3 bg-zinc-900/50 border border-zinc-800 rounded-lg p-6 flex flex-col h-[70vh]">
        <h2 className="text-xl font-semibold text-white mb-2">
          Smart Contract Code (Rust)
        </h2>
        <p className="text-sm text-zinc-400 mb-4">
          Write your Soroban smart contract here. It will be compiled on the
          server and deployed from your browser.
        </p>
        <textarea
          value={sourceCode}
          onChange={(e) => setSourceCode(e.target.value)}
          className="flex-1 w-full bg-zinc-950 border border-zinc-800 rounded-md p-4 font-mono text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-fundable-purple-2"
          spellCheck={false}
          disabled={isDeploying}
        />
      </div>

      {/* ── Status panel ── */}
      <div className="w-full lg:w-1/3 flex flex-col gap-4">
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-white mb-4">
            Deployment Status
          </h2>

          <button
            onClick={handleDeploy}
            disabled={isDeploying || !isConnected}
            className="w-full bg-white hover:bg-zinc-200 text-black font-semibold py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed mb-4"
          >
            {isDeploying ? "Deploying..." : "Compile & Deploy"}
          </button>

          {!isConnected && (
            <p className="text-sm text-yellow-500 mb-4">
              Please connect your wallet in the top right to deploy.
            </p>
          )}

          {status && (
            <div className="text-sm text-zinc-300 font-medium mb-4 rounded-md bg-zinc-800 p-3">
              {status}
            </div>
          )}

          {error && (
            <div className="text-sm text-red-400 font-medium mb-4 rounded-md bg-red-950/30 border border-red-900 p-3 break-words">
              {error}
            </div>
          )}

          {/* Predicted contract ID — shown as soon as the salt is known,
              before the user signs the create-contract transaction. */}
          {predictedContractId && !contractId && (
            <div className="bg-blue-950/30 border border-blue-800 rounded-md p-4 mb-4">
              <div className="flex items-center gap-2 mb-2 text-blue-400 font-medium">
                <InfoIcon className="w-4 h-4 shrink-0" />
                <span className="text-sm">Predicted Contract ID</span>
              </div>
              <p className="text-xs text-zinc-400 mb-2">
                Derived from your address and a random salt before deployment.
                This will be the contract&apos;s address once confirmed on-chain.
              </p>
              <div className="flex items-center gap-2 bg-zinc-950 p-2 rounded border border-zinc-800">
                <code className="text-xs text-zinc-200 break-all">
                  {predictedContractId}
                </code>
                <button
                  onClick={() => copyToClipboard(predictedContractId)}
                  className="text-zinc-500 hover:text-white transition-colors p-1 shrink-0"
                  title="Copy predicted ID"
                >
                  <CopyIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Confirmed contract ID — shown after successful deployment. */}
          {contractId && (
            <div className="bg-green-950/30 border border-green-900 rounded-md p-4 mt-2">
              <div className="flex items-center gap-2 mb-2 text-green-400 font-medium">
                <CheckCircle2 className="w-5 h-5" />
                <span>Deployed successfully!</span>
              </div>
              <p className="text-xs text-zinc-400 mb-1">Contract ID:</p>
              <div className="flex items-center gap-2 bg-zinc-950 p-2 rounded border border-zinc-800">
                <code className="text-xs text-zinc-200 break-all">
                  {contractId}
                </code>
                <button
                  onClick={() => copyToClipboard(contractId)}
                  className="text-zinc-500 hover:text-white transition-colors p-1 shrink-0"
                  title="Copy ID"
                >
                  <CopyIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
