import { Keypair, Transaction } from '@stellar/stellar-sdk';

/**
 * Types for the ContractDeployer module.
 * 
 * This module provides comprehensive type definitions for deploying Soroban smart
 * contracts to the Stellar network, including configuration options, operation results,
 * and resource/fee estimates.
 */

/**
 * A callback function that signs a Stellar transaction.
 * 
 * This allows for custom signing logic, such as using a hardware wallet, 
 * a web-based wallet provider, or an external signing service.
 * 
 * @param tx - The transaction to be signed.
 * @returns A promise that resolves to the signed transaction.
 */
export type SigningCallback = (tx: Transaction) => Promise<Transaction> | Transaction;

/**
 * Represents a signer for a transaction.
 * 
 * Can be either a `Keypair` for direct signing or a `SigningCallback` for 
 * delegated/asynchronous signing.
 */
export type Signer = Keypair | SigningCallback;

/**
 * Configuration for the account that will deploy the contract.
 * 
 * In Stellar, the account that initiates the transaction (the source account)
 * may require multiple signatures to reach the required threshold for 
 * certain operations (multi-sig).
 */
export interface DeployerAccount {
  /**
   * The public address (G...) of the account that will pay for and initiate 
   * the deployment.
   */
  address: string;

  /**
   * A list of signers required to authorize the transaction.
   * 
   * For simple accounts, this is usually a single Keypair. 
   * For multi-sig accounts, this can be multiple Keypairs or signing callbacks.
   */
  signers: Signer[];
}

/**
 * A flexible type that can be either a single `Keypair` (for backward 
 * compatibility and simple cases) or a full `DeployerAccount` configuration.
 */
export type Deployer = Keypair | DeployerAccount;

/**
 * Supported Stellar networks.
 * 
 * @typedef {('testnet' | 'mainnet' | 'custom')} StellarNetwork
 * - `testnet`: Stellar Test Network Global Base Server
 * - `mainnet`: Stellar Public Network
 * - `custom`: Custom Stellar network (requires custom networkPassphrase)
 */
export type StellarNetwork = 'testnet' | 'mainnet' | 'custom';

/**
 * Configuration options for the ContractDeployer.
 * 
 * Provides all necessary parameters to connect to a Stellar network and configure
 * deployment transaction defaults.
 * 
 * @interface DeployerConfig
 * 
 * @example
 * ```ts
 * const config: DeployerConfig = {
 *   rpcUrl: 'https://soroban-testnet.stellar.org',
 *   networkPassphrase: Networks.TESTNET_NETWORK_PASSPHRASE,
 *   baseFee: '1000',
 *   timeoutSeconds: 120
 * };
 * ```
 */
export interface DeployerConfig {
  /**
   * Soroban RPC endpoint URL.
   * 
   * Examples:
   * - Testnet: `https://soroban-testnet.stellar.org`
   * - Mainnet: `https://soroban-mainnet.stellar.org`
   * - Local: `http://localhost:8000`
   */
  rpcUrl: string;
  /**
   * Network passphrase for transaction signing.
   *
   * When omitted, the passphrase is automatically fetched from the RPC server
   * via `getNetwork()` the first time a transaction is built. You can also call
   * `ContractDeployer.create(config)` (async factory) to resolve it eagerly at
   * construction time.
   */
  networkPassphrase?: string;

  /**
   * Network passphrase used to identify and sign transactions for the specific network.
   * 
   * Use constants from `@stellar/stellar-sdk`:
   * - `Networks.PUBLIC_NETWORK_PASSPHRASE` for mainnet
   * - `Networks.TESTNET_NETWORK_PASSPHRASE` for testnet
   * - Custom passphrase string for private networks
   */

  /**
   * Base fee in stroops (0.00001 XLM) for each transaction operation.
   * 
   * Defaults to 100 stroops (the Stellar base fee).
   * 
   * The deployer applies a fee buffer multiplier (1.2x) on top of simulated resource fees
   * to ensure transactions are not rejected due to insufficient fees.
   * 
   * @default '100'
   */
  baseFee?: string;

  /**
   * Maximum number of seconds to wait for transaction confirmation on-chain.
   * 
   * The deployer polls the ledger at 2-second intervals until confirmation or timeout.
   * If a transaction is not confirmed within this window, a DeploymentTimeoutError is raised.
   * 
   * Defaults to 60 seconds.
   * 
   * @default 60
   */
  timeoutSeconds?: number;
}

/**
 * Result of a successful WASM upload (install) operation.
 * 
 * When uploading a WASM binary, Soroban stores it on-chain and returns a wasmHash
 * that uniquely identifies the binary. This hash is used during contract instantiation
 * to reference which WASM code to execute.
 * 
 * @interface WasmUploadResult
 * 
 * @example
 * ```ts
 * const result = await deployer.uploadWasm(wasmBuffer, keypair);
 * console.log(`WASM Hash: ${result.wasmHash}`);
 * console.log(`Confirmed in ledger: ${result.ledger}`);
 * ```
 */
export interface WasmUploadResult {
  /**
   * SHA-256 hash of the uploaded WASM binary.
   * 
   * This is a 32-byte (64 character hex string) identifier used to reference the WASM
   * code during contract instantiation. This hash is deterministic - uploading the same
   * WASM binary twice will produce the same hash.
   * 
   * Format: 64 hex characters (e.g., `abcdef1234...`)
   */
  wasmHash: string;

  /**
   * Transaction hash of the WASM upload transaction.
   * 
   * Uniquely identifies the on-chain transaction that installed the WASM.
   * Can be used to track the upload on explorers and verify transaction details.
   * 
   * Format: 64 hex characters
   */
  txHash: string;

  /**
   * Stellar ledger sequence number where the upload transaction was confirmed.
   * 
   * Ledger numbers are strictly increasing integers that mark the progression
   * of the Stellar ledger. This number can be used to correlate with other
   * transactions and events on the network.
   */
  ledger: number;

  /**
   * Total fee actually charged for the upload transaction (in stroops).
   * 
   * This is the actual fee paid, which may differ from the estimated fee due to:
   * - Variations in resource consumption
   * - Network congestion and fee changes
   * - Optimization by the Soroban host
   * 
   * Formula: `feeCharged = baseFee × (1 + numOps) + simulatedResourceFee`
   */
  feeCharged: string;
}

/**
 * Result of a successful contract instantiation (deploy) operation.
 * 
 * After uploading WASM code, contracts are instantiated with specific initialization
 * parameters. The deployment process creates a contract account on-chain and returns
 * its address for future interactions.
 * 
 * @interface ContractDeployResult
 * 
 * @example
 * ```ts
 * const result = await deployer.deployContract(wasmHash, initParams, keypair);
 * console.log(`Contract deployed at: ${result.contractId}`);
 * console.log(`Gas cost: ${result.feeCharged} stroops`);
 * ```
 */
export interface ContractDeployResult {
  /**
   * The deployed contract's Stellar address.
   * 
   * Format: Starts with 'C' followed by 55 characters (base32-encoded).
   * Example: `CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4`
   * 
   * This address is used to interact with the contract and never changes for this
   * deployed instance. Store this address to interact with the contract later.
   */
  contractId: string;

  /**
   * Transaction hash of the contract instantiation transaction.
   * 
   * Uniquely identifies the on-chain transaction that deployed the contract.
   * Can be used to verify the deployment and track it on network explorers.
   * 
   * Format: 64 hex characters
   */
  txHash: string;

  /**
   * Stellar ledger sequence number where the deployment transaction was confirmed.
   * 
   * Ledger numbers are strictly increasing integers that mark the progression
   * of the Stellar ledger. This number can be used to correlate with other
   * transactions and events on the network.
   */
  ledger: number;

  /**
   * Total fee actually charged for the deployment transaction (in stroops).
   * 
   * This is the actual fee paid, which may differ from the estimated fee due to:
   * - Variations in resource consumption during instantiation
   * - Network congestion and fee changes
   * - Optimization by the Soroban host
   * 
   * Formula: `feeCharged = baseFee × (1 + numOps) + simulatedResourceFee`
   */
  feeCharged: string;
}

/**
 * Fee and resource estimate for a contract deployment transaction.
 * 
 * Before executing a deployment transaction, the ContractDeployer simulates it to
 * estimate the resource consumption and calculate the required fee. This allows
 * accurate fee estimation and helps prevent transaction failures.
 * 
 * @interface FeeEstimate
 * 
 * @example
 * ```ts
 * const estimate = await deployer.estimateUploadFee(wasmBuffer, keypair);
 * console.log(`Recommended fee: ${estimate.fee} stroops`);
 * console.log(`CPU instructions: ${estimate.resources.instructions}`);
 * ```
 */
export interface FeeEstimate {
  /**
   * Recommended fee in stroops (0.00001 XLM per stoop).
   * 
   * This is the simulated minimum resource fee multiplied by a safety buffer (1.2x)
   * to account for variations in resource consumption. This fee is recommended to use
   * to minimize the risk of transaction rejection due to insufficient fees.
   * 
   * Calculation: `recommendedFee = minResourceFee × 1.2 + (baseFee × numOps)`
   * 
   * Example: A fee of 50000 stroops = 0.005 XLM
   */
  fee: string;

  /**
   * Detailed Soroban resource usage breakdown for this transaction.
   * 
   * These metrics represent the estimated computational and storage resources
   * that will be consumed when executing the transaction on the Soroban host.
   * Higher resource consumption requires higher fees.
   */
  resources: {
    /**
     * Estimated number of CPU instructions to be executed.
     * 
     * Represents computational complexity. Typical values range from 10,000 to 1,000,000+
     * depending on contract complexity.
     */
    instructions: number;

    /**
     * Estimated number of bytes to be read from ledger storage.
     * 
     * Each byte read consumes resources proportional to storage I/O costs.
     * Typical values: 0 - 100,000 bytes
     */
    readBytes: number;

    /**
     * Estimated number of bytes to be written to ledger storage.
     * 
     * Write operations are more expensive than reads. Each byte written consumes
     * resources proportional to ledger storage costs.
     * Typical values: 0 - 50,000 bytes
     */
    writeBytes: number;

    /**
     * Estimated number of ledger entries to be read.
     * 
     * Each ledger entry read has a fixed cost plus the cost of the bytes read.
     * Typical values: 1 - 50 entries
     */
    readEntries: number;

    /**
     * Estimated number of ledger entries to be written.
     * 
     * Write operations are more expensive than reads. Each entry written has a fixed
     * cost plus the cost of the bytes written.
     * Typical values: 1 - 20 entries
     */
    writeEntries: number;
  };

  /**
   * Minimum resource fee in stroops from the Soroban simulation (before safety buffer).
   * 
   * This is the raw fee computed by the Soroban host based on actual resource consumption.
   * The deployer multiplies this by a 1.2x safety buffer to get the recommended fee.
   * 
   * Rarely needed for direct use; prefer the `fee` field instead.
   * 
   * @see fee
   */
  minResourceFee: string;
}
