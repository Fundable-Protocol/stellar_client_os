import {
  Keypair,
  TransactionBuilder,
  Operation,
  Networks,
  xdr,
  hash,
  Address,
  Transaction,
} from '@stellar/stellar-sdk';
import { Server, Api } from '@stellar/stellar-sdk/rpc';
import type { 
  DeployerConfig, 
  WasmUploadResult, 
  ContractDeployResult, 
  FeeEstimate,
  Deployer,
  Signer,
  DeployerAccount,
} from './types';
import {
  DeployerError,
  InvalidWasmError,
  DeployerAccountError,
  WasmUploadError,
  ContractInstantiationError,
  FeeEstimationError,
  DeploymentTimeoutError,
} from './errors';

const DEFAULT_BASE_FEE = '100';
const DEFAULT_TIMEOUT = 60;
/** Safety multiplier applied on top of the simulated minimum resource fee. */
const FEE_BUFFER_MULTIPLIER = 1.2;
const POLL_INTERVAL_MS = 2_000;

/**
 * ContractDeployer handles the full lifecycle of deploying a Soroban smart
 * contract to the Stellar network:
 *
 *  1. `estimateUploadFee`  — simulate the WASM install to get resource costs
 *  2. `uploadWasm`         — install the WASM blob on-chain (returns wasmHash)
 *  3. `estimateDeployFee`  — simulate the contract instantiation
 *  4. `deployContract`     — instantiate the contract (returns contractId)
 *
 * Or use the convenience method `uploadAndDeploy` to do both in one call.
 *
 * ### Network passphrase
 * Providing `networkPassphrase` in the config is **optional**. When omitted, it
 * is fetched automatically from the RPC server the first time a transaction is
 * built (lazy resolution). The result is cached so only one RPC round-trip is
 * ever made. Use the async factory `ContractDeployer.create(config)` if you
 * prefer to resolve the passphrase eagerly during initialisation:
 *
 * ```ts
 * // Lazy (zero extra round-trip until first transaction)
 * const deployer = new ContractDeployer({ rpcUrl: '...' });
 *
 * // Eager (passphrase ready before any transaction call)
 * const deployer = await ContractDeployer.create({ rpcUrl: '...' });
 * ```
 */
export class ContractDeployer {
  private readonly rpc: Server;
  private readonly networkPassphrase: string | undefined;
  private readonly baseFee: string;
  private readonly timeoutSeconds: number;
  /** Cached promise so the RPC fetch happens at most once. */
  private passphrasePromise: Promise<string> | undefined;

  constructor(config: DeployerConfig) {
    this.rpc = new Server(config.rpcUrl, { allowHttp: true });
    this.networkPassphrase = config.networkPassphrase;
    this.baseFee = config.baseFee ?? DEFAULT_BASE_FEE;
    this.timeoutSeconds = config.timeoutSeconds ?? DEFAULT_TIMEOUT;
  }

  // ─── Async factory ─────────────────────────────────────────────────────────

  /**
   * Async factory that resolves the network passphrase from the RPC server
   * **before** returning the deployer instance. Use this when you want the
   * passphrase to be guaranteed available synchronously from the very first
   * method call.
   *
   * ```ts
   * const deployer = await ContractDeployer.create({ rpcUrl: 'https://...' });
   * ```
   */
  static async create(config: DeployerConfig): Promise<ContractDeployer> {
    const deployer = new ContractDeployer(config);
    // Eagerly resolve — result is cached in passphrasePromise
    await deployer.resolveNetworkPassphrase();
    return deployer;
  }

  // ─── Static factory helpers ────────────────────────────────────────────────

  static forTestnet(overrides?: Partial<DeployerConfig>): ContractDeployer {
    return new ContractDeployer({
      rpcUrl: 'https://soroban-testnet.stellar.org',
      networkPassphrase: Networks.TESTNET,
      ...overrides,
    });
  }

  static forMainnet(overrides?: Partial<DeployerConfig>): ContractDeployer {
    return new ContractDeployer({
      rpcUrl: 'https://soroban-mainnet.stellar.org',
      networkPassphrase: Networks.PUBLIC,
      ...overrides,
    });
  }

  // ─── Network passphrase resolution ─────────────────────────────────────────

  /**
   * Returns the network passphrase, fetching it lazily from the RPC server if
   * it was not supplied in the constructor config.
   *
   * The RPC request is made **at most once** — subsequent calls return the
   * cached value.
   *
   * @throws {DeployerError} When the RPC `getNetwork` call fails.
   */
  async getNetworkPassphrase(): Promise<string> {
    return this.resolveNetworkPassphrase();
  }

  // ─── Fee / resource estimation ─────────────────────────────────────────────

  /**
   * Simulate a WASM upload transaction and return the estimated fee and
   * resource consumption without submitting anything to the network.
   *
   * @param wasm  - Compiled contract WASM as a Buffer or Uint8Array.
   * @param deployer - Keypair or account address that will pay for the upload.
   */
  async estimateUploadFee(wasm: Buffer | Uint8Array, deployer: Deployer): Promise<FeeEstimate> {
    this.assertValidWasm(wasm);
    const deployerAddress = this.getDeployerAddress(deployer);
    const account = await this.loadAccount(deployerAddress);
    const tx = await this.buildUploadTx(wasm, account);
    return this.simulate(tx);
  }

  /**
   * Simulate a contract instantiation transaction and return the estimated
   * fee and resource consumption.
   *
   * @param wasmHash - Hex or base64 hash returned by `uploadWasm`.
   * @param deployer - Keypair or account address that will pay for the deploy.
   * @param salt     - Optional 32-byte salt for deterministic contract IDs.
   */
  async estimateDeployFee(
    wasmHash: string,
    deployer: Deployer,
    salt?: Buffer,
  ): Promise<FeeEstimate> {
    const deployerAddress = this.getDeployerAddress(deployer);
    const account = await this.loadAccount(deployerAddress);
    const tx = await this.buildDeployTx(wasmHash, deployerAddress, account, salt);
    return this.simulate(tx);
  }

  // ─── Upload (install) ──────────────────────────────────────────────────────

  /**
   * Upload (install) a compiled WASM blob to the Stellar network.
   * This makes the WASM available for instantiation but does not create a
   * contract address yet.
   *
   * @param wasm     - Compiled contract WASM as a Buffer or Uint8Array.
   * @param deployer - Keypair or multi-sig config that signs and pays for the transaction.
   * @returns `WasmUploadResult` containing the `wasmHash` needed for deployment.
   */
  async uploadWasm(wasm: Buffer | Uint8Array, deployer: Deployer): Promise<WasmUploadResult> {
    this.assertValidWasm(wasm);

    const deployerAddress = this.getDeployerAddress(deployer);
    const account = await this.loadAccount(deployerAddress);
    const tx = await this.buildUploadTx(wasm, account);

    // Simulate to get resource footprint, then rebuild with correct fee
    const estimate = await this.simulate(tx);
    const preparedTx = await this.buildUploadTx(wasm, account, estimate.fee);
    
    await this.signTransaction(preparedTx, deployer);

    try {
      const result = await this.submitAndWait(preparedTx.toEnvelope().toXDR('base64'));
      return {
        wasmHash: this.deriveWasmHash(wasm),
        txHash: result.txHash,
        ledger: result.ledger,
        feeCharged: result.feeCharged,
      };
    } catch (err) {
      if (err instanceof WasmUploadError || err instanceof DeploymentTimeoutError) throw err;
      throw new WasmUploadError(
        `WASM upload failed: ${(err as Error).message}`,
        (err as any).txHash,
        err as Error,
      );
    }
  }

  // ─── Deploy (instantiate) ──────────────────────────────────────────────────

  /**
   * Instantiate a previously uploaded WASM as a new contract.
   *
   * @param wasmHash - Hex hash returned by `uploadWasm`.
   * @param deployer - Keypair or multi-sig config that signs and pays for the transaction.
   * @param salt     - Optional 32-byte salt for deterministic contract IDs.
   * @returns `ContractDeployResult` containing the new `contractId`.
   */
  async deployContract(
    wasmHash: string,
    deployer: Deployer,
    salt?: Buffer,
  ): Promise<ContractDeployResult> {
    const deployerAddress = this.getDeployerAddress(deployer);
    const account = await this.loadAccount(deployerAddress);
    const estimate = await this.estimateDeployFee(wasmHash, deployer, salt);
    const tx = await this.buildDeployTx(wasmHash, deployerAddress, account, salt, estimate.fee);
    
    await this.signTransaction(tx, deployer);

    try {
      const result = await this.submitAndWait(tx.toEnvelope().toXDR('base64'));
      const contractId = this.deriveContractId(deployerAddress, salt ?? result.txHash);
      return {
        contractId,
        txHash: result.txHash,
        ledger: result.ledger,
        feeCharged: result.feeCharged,
      };
    } catch (err) {
      if (err instanceof ContractInstantiationError || err instanceof DeploymentTimeoutError) throw err;
      throw new ContractInstantiationError(
        `Contract instantiation failed: ${(err as Error).message}`,
        (err as any).txHash,
        err as Error,
      );
    }
  }

  // ─── Convenience: upload + deploy in one call ──────────────────────────────

  /**
   * Upload the WASM and immediately deploy the contract in two sequential
   * transactions. Returns both results.
   *
   * @param wasm     - Compiled contract WASM.
   * @param deployer - Keypair or multi-sig config that signs both transactions.
   * @param salt     - Optional salt for deterministic contract ID.
   */
  async uploadAndDeploy(
    wasm: Buffer | Uint8Array,
    deployer: Deployer,
    salt?: Buffer,
  ): Promise<{ upload: WasmUploadResult; deploy: ContractDeployResult }> {
    const upload = await this.uploadWasm(wasm, deployer);
    const deploy = await this.deployContract(upload.wasmHash, deployer, salt);
    return { upload, deploy };
  }

  // ─── Private: transaction builders ────────────────────────────────────────

  private async buildUploadTx(
    wasm: Buffer | Uint8Array,
    account: { id: string; sequenceNumber: () => string },
    fee = this.baseFee,
  ) {
    const passphrase = await this.resolveNetworkPassphrase();
    const sourceAccount = {
      accountId: () => account.id,
      sequenceNumber: () => account.sequenceNumber(),
      incrementSequenceNumber: () => {},
    };

    return new TransactionBuilder(sourceAccount as Parameters<typeof TransactionBuilder>[0], {
      fee,
      networkPassphrase: passphrase,
    })
      .addOperation(
        Operation.uploadContractWasm({ wasm: Buffer.from(wasm) })
      )
      .setTimeout(this.timeoutSeconds)
      .build();
  }

  private async buildDeployTx(
    wasmHash: string,
    deployerAddress: string,
    account: { id: string; sequenceNumber: () => string },
    salt?: Buffer,
    fee = this.baseFee,
  ) {
    const passphrase = await this.resolveNetworkPassphrase();
    const saltBytes = salt ?? this.randomSalt();
    const sourceAccount = {
      accountId: () => account.id,
      sequenceNumber: () => account.sequenceNumber(),
      incrementSequenceNumber: () => {},
    };

    return new TransactionBuilder(sourceAccount as Parameters<typeof TransactionBuilder>[0], {
      fee,
      networkPassphrase: passphrase,
    })
      .addOperation(
        Operation.createCustomContract({
          address: new Address(deployerAddress),
          wasmHash: Buffer.from(wasmHash, 'hex'),
          salt: saltBytes,
        })
      )
      .setTimeout(this.timeoutSeconds)
      .build();
  }

  // ─── Private: simulation ───────────────────────────────────────────────────

  private async simulate(tx: ReturnType<TransactionBuilder['build']>): Promise<FeeEstimate> {
    let simulation: Awaited<ReturnType<Server['simulateTransaction']>>;
    try {
      simulation = await this.rpc.simulateTransaction(tx);
    } catch (err) {
      throw new FeeEstimationError(
        `Simulation request failed: ${(err as Error).message}`,
        err as Error,
      );
    }

    if (Api.isSimulationError(simulation)) {
      throw new FeeEstimationError(`Simulation returned error: ${simulation.error}`);
    }

    const sorobanData = (simulation as Api.SimulateTransactionSuccessResponse).transactionData;
    const minResourceFee = (simulation as Api.SimulateTransactionSuccessResponse).minResourceFee ?? '0';

    // Apply safety buffer so the transaction doesn't fail due to fee fluctuations
    const recommendedFee = String(
      Math.ceil(Number(minResourceFee) * FEE_BUFFER_MULTIPLIER + Number(this.baseFee))
    );

    // Extract resource footprint from the Soroban transaction data
    let resources = { instructions: 0, readBytes: 0, writeBytes: 0, readEntries: 0, writeEntries: 0 };
    try {
      if (sorobanData) {
        const data = xdr.SorobanTransactionData.fromXDR(sorobanData, 'base64');
        const footprint = data.resources();
        resources = {
          instructions: footprint.instructions(),
          readBytes: footprint.readBytes(),
          writeBytes: footprint.writeBytes(),
          readEntries: footprint.footprint().readOnly().length,
          writeEntries: footprint.footprint().readWrite().length,
        };
      }
    } catch {
      // Non-fatal — resource breakdown is informational
    }

    return { fee: recommendedFee, resources, minResourceFee };
  }

  // ─── Private: submission & polling ────────────────────────────────────────

  private async submitAndWait(txXdr: string): Promise<{
    txHash: string;
    ledger: number;
    feeCharged: string;
  }> {
    const sendResponse = await this.rpc.sendTransaction(
      xdr.TransactionEnvelope.fromXDR(txXdr, 'base64') as unknown as Parameters<Server['sendTransaction']>[0]
    );

    if (sendResponse.status === 'ERROR') {
      throw new DeployerError(
        `Transaction submission failed: ${sendResponse.errorResult?.toXDR('base64') ?? 'unknown error'}`,
        'SUBMISSION_ERROR',
      );
    }

    const txHash = sendResponse.hash;
    const deadline = Date.now() + this.timeoutSeconds * 1_000;

    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);
      const getResponse = await this.rpc.getTransaction(txHash);

      if (getResponse.status === Api.GetTransactionStatus.SUCCESS) {
        return {
          txHash,
          ledger: getResponse.ledger ?? 0,
          feeCharged: String((getResponse as unknown as { feeCharged?: string }).feeCharged ?? this.baseFee),
        };
      }

      if (getResponse.status === Api.GetTransactionStatus.FAILED) {
        throw new DeployerError(
          `Transaction failed on-chain. Hash: ${txHash}`,
          'TRANSACTION_FAILED',
        );
      }
      // NOT_FOUND — still pending, keep polling
    }

    throw new DeploymentTimeoutError(txHash);
  }

  // ─── Private: helpers ──────────────────────────────────────────────────────

  /**
   * Helper to sign a transaction using the provided deployer configuration.
   * Handles both single Keypair and multi-sig/callback configurations.
   */
  private async signTransaction(tx: Transaction, deployer: Deployer): Promise<void> {
    if ('signers' in deployer) {
      const { signers } = deployer;
      for (const signer of signers) {
        if (signer instanceof Keypair || (typeof signer === 'object' && 'sign' in signer && typeof signer.sign === 'function')) {
          tx.sign(signer as Keypair);
        } else if (typeof signer === 'function') {
          const signed = await signer(tx);
          if (signed !== tx) {
            tx.signatures.push(...signed.signatures);
          }
        }
      }
    } else {
      tx.sign(deployer);
    }
  }

  private getDeployerAddress(deployer: Deployer): string {
    if (deployer instanceof Keypair || (typeof deployer === 'object' && 'publicKey' in deployer && typeof deployer.publicKey === 'function')) {
      return (deployer as Keypair).publicKey();
    }
    return (deployer as DeployerAccount).address;
  }

  /**
   * Resolves the network passphrase, fetching it from the RPC server exactly
   * once if it was not provided in the config. Result is cached.
   */
  private resolveNetworkPassphrase(): Promise<string> {
    if (this.networkPassphrase) {
      return Promise.resolve(this.networkPassphrase);
    }
    if (!this.passphrasePromise) {
      this.passphrasePromise = this.rpc.getNetwork().then(
        (r) => r.passphrase,
        (err: Error) => {
          // Clear cache so a retry is possible after a transient failure
          this.passphrasePromise = undefined;
          throw new DeployerError(
            `Failed to auto-detect network passphrase from RPC: ${err.message}`,
            'PASSPHRASE_DETECTION_FAILED',
          );
        },
      );
    }
    return this.passphrasePromise;
  }

  private async loadAccount(address: string) {
    try {
      return await this.rpc.getAccount(address);
    } catch (err) {
      throw new DeployerAccountError(address, err as Error);
    }
  }

  private assertValidWasm(wasm: Buffer | Uint8Array): void {
    if (!wasm || wasm.length === 0) {
      throw new InvalidWasmError('WASM buffer is empty');
    }
    // Wasm magic number: 0x00 0x61 0x73 0x6D
    if (wasm[0] !== 0x00 || wasm[1] !== 0x61 || wasm[2] !== 0x73 || wasm[3] !== 0x6D) {
      throw new InvalidWasmError('Buffer does not start with the WebAssembly magic number (\\0asm)');
    }
  }

  private deriveWasmHash(wasm: Buffer | Uint8Array): string {
    return hash(Buffer.from(wasm)).toString('hex');
  }

  /**
   * Derives the contract ID deterministically from the deployer address, salt,
   * and network passphrase — **before** any transaction is submitted.
   *
   * Implements the standard Stellar contract ID derivation:
   *   SHA-256( HashIdPreimage{ networkId: SHA-256(passphrase), preimage: ContractIdPreimageFromAddress } )
   * encoded as a Stellar contract strkey (C…).
   *
   * @param deployerAddress   - G… Stellar account address of the deployer.
   * @param salt              - 32-byte salt used in the create-contract transaction.
   * @param networkPassphrase - Network passphrase (e.g. "Test SDF Network ; September 2015").
   * @returns The contract address (C…) that will be assigned on deployment.
   */
  private deriveContractId(
    deployerAddress: string,
    salt: Buffer,
    networkPassphrase: string,
  ): string {
    const preimage = xdr.HashIdPreimage.envelopeTypeContractId(
      new xdr.HashIdPreimageContractId({
        networkId: hash(Buffer.from(networkPassphrase)),
        contractIdPreimage: xdr.ContractIdPreimage.contractIdPreimageFromAddress(
          new xdr.ContractIdPreimageFromAddress({
            address: new Address(deployerAddress).toScAddress(),
            salt,
          })
        ),
      })
    );
    return StrKey.encodeContract(hash(preimage.toXDR()));
  }

  private randomSalt(): Buffer {
    const buf = Buffer.alloc(32);
    for (let i = 0; i < 32; i++) buf[i] = Math.floor(Math.random() * 256);
    return buf;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
