import {
  TransactionBuilder,
  Operation,
  xdr,
  Address,
  Account,
  hash,
  StrKey,
} from '@stellar/stellar-sdk';
import { Server as RpcServer, Api, assembleTransaction } from '@stellar/stellar-sdk/rpc';

interface DeployConfig {
  rpcUrl: string;
  networkPassphrase: string;
}

export class ContractDeployer {
  private rpcServer: RpcServer;
  private networkPassphrase: string;

  constructor(config: DeployConfig) {
    this.rpcServer = new RpcServer(config.rpcUrl, { allowHttp: true });
    this.networkPassphrase = config.networkPassphrase;
  }

  /**
   * Builds the transaction to upload a WASM file to the network.
   */
  async buildUploadWasmTx(
    address: string,
    wasmBytes: Uint8Array,
    fee: string = '1000' // Increased default fee for Wasm upload
  ): Promise<{ transaction: any; simulation: any }> {
    const account = await this.getAccount(address);
    
    // Convert Uint8Array to Buffer for the SDK
    const wasmBuffer = Buffer.from(wasmBytes);

    const tx = new TransactionBuilder(account, {
      fee,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        Operation.invokeHostFunction({
          func: xdr.HostFunction.hostFunctionTypeUploadContractWasm(wasmBuffer),
          auth: [],
        })
      )
      .setTimeout(60) // Generous timeout for uploads
      .build();

    const simulation = await this.rpcServer.simulateTransaction(tx);
    
    if (Api.isSimulationError(simulation)) {
      throw new Error(`Wait! Wasm upload simulation failed: ${simulation.error}`);
    }

    const assembledTx = assembleTransaction(tx, simulation).build();
    return { transaction: assembledTx, simulation };
  }

  /**
   * Submit transaction and wait for confirmation, returning the result.
   */
  async submitSignedTransaction(signedTxXdr: string): Promise<any> {
    const tx = TransactionBuilder.fromXDR(signedTxXdr, this.networkPassphrase);
    const sendResponse = await this.rpcServer.sendTransaction(tx);

    if (sendResponse.status === 'ERROR') {
      throw new Error('Transaction submission failed: ' + JSON.stringify(sendResponse.errorResult));
    }

    // Poll for status
    let getResponse = await this.rpcServer.getTransaction(sendResponse.hash);
    const maxRetries = 30; // 30 seconds wait
    let retries = 0;

    while (getResponse.status === 'NOT_FOUND' && retries < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      getResponse = await this.rpcServer.getTransaction(sendResponse.hash);
      retries++;
    }

    if (getResponse.status !== 'SUCCESS') {
      let errorMessage = `Wait! Transaction failed with status: ${getResponse.status}`;
      if (getResponse.status === 'FAILED') {
         errorMessage += ` — ${JSON.stringify(getResponse.resultMetaXdr)}`;
      }
      throw new Error(errorMessage);
    }
    
    return getResponse;
  }

  /**
   * Helper to parse WASM hash from a successful upload getTransaction response
   */
  parseWasmHashFromUpload(getResponse: any): Buffer {
    let wasmHash: Buffer | undefined;
    
    if (getResponse.resultMetaXdr) {
      const meta = getResponse.resultMetaXdr;
      if (meta.v3()?.sorobanMeta()?.returnValue()) {
          const retVal = meta.v3().sorobanMeta().returnValue();
          if (retVal.switch() === xdr.ScValType.scvBytes()) {
             wasmHash = retVal.bytes();
          }
      }
    }
    
    if (!wasmHash) {
      throw new Error('Wait! Could not parse WASM hash from the upload transaction result. Maybe the simulation was out of sync?');
    }
    return wasmHash;
  }

  /**
   * Derives the contract ID deterministically from the deployer address, salt,
   * and network passphrase — **before** any transaction is submitted.
   *
   * This mirrors the on-chain logic exactly:
   *   SHA-256( HashIdPreimage{ networkId: SHA-256(passphrase), preimage: ContractIdPreimageFromAddress } )
   * encoded as a Stellar contract strkey (C…).
   *
   * @param deployerAddress  - G… Stellar account address of the deployer.
   * @param salt             - 32-byte salt used in the create-contract transaction.
   * @param networkPassphrase - Network passphrase (e.g. "Test SDF Network ; September 2015").
   * @returns The contract address (C…) that will be assigned on deployment.
   */
  static deriveContractId(
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

  /**
   * Builds the transaction to create a contract instance from an uploaded WASM hash.
   *
   * The salt can be supplied by the caller so the contract ID can be derived
   * ahead of time via `ContractDeployer.deriveContractId()`. If omitted, a
   * cryptographically random 32-byte salt is generated and returned alongside
   * the transaction so the caller can still derive the expected contract ID.
   *
   * @param address  - Deployer's Stellar account address.
   * @param wasmHash - 32-byte WASM hash returned by the upload step.
   * @param salt     - Optional 32-byte salt. A random one is generated when omitted.
   * @param fee      - Base fee in stroops.
   * @returns The assembled transaction, the simulation result, and the salt used.
   */
  async buildCreateContractTx(
    address: string,
    wasmHash: Buffer,
    salt?: Buffer,
    fee: string = '1000',
  ): Promise<{ transaction: any; simulation: any; salt: Buffer }> {
    const account = await this.getAccount(address);

    // Use the provided salt or generate a cryptographically random one.
    const saltBuffer: Buffer = salt ?? (() => {
      const buf = new Uint8Array(32);
      crypto.getRandomValues(buf);
      return Buffer.from(buf);
    })();

    const func = xdr.HostFunction.hostFunctionTypeCreateContract(
      new xdr.CreateContractArgs({
        contractIdPreimage: xdr.ContractIdPreimage.contractIdPreimageFromAddress(
          new xdr.ContractIdPreimageFromAddress({
            address: new Address(address).toScAddress(),
            salt: saltBuffer,
          })
        ),
        executable: xdr.ContractExecutable.contractExecutableWasm(wasmHash),
      })
    );

    const tx = new TransactionBuilder(account, {
      fee,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        Operation.invokeHostFunction({
          func,
          auth: [],
        })
      )
      .setTimeout(60)
      .build();

    const simulation = await this.rpcServer.simulateTransaction(tx);

    if (Api.isSimulationError(simulation)) {
      throw new Error(`Wait! Create contract simulation failed: ${simulation.error}`);
    }

    const assembledTx = assembleTransaction(tx, simulation).build();
    return { transaction: assembledTx, simulation, salt: saltBuffer };
  }
  
  /**
   * Helper to parse Contract ID from a successful create getTransaction response
   */
  parseContractIdFromCreate(getResponse: any): string {
    let contractAddress: string | undefined;
    
    if (getResponse.resultMetaXdr) {
      const meta = getResponse.resultMetaXdr;
      if (meta.v3()?.sorobanMeta()?.returnValue()) {
          const retVal = meta.v3().sorobanMeta().returnValue();
          if (retVal.switch() === xdr.ScValType.scvAddress()) {
             contractAddress = Address.fromScAddress(retVal.address()).toString();
          }
      }
    }
    
    if (!contractAddress) {
       throw new Error('Wait! Could not parse Contract ID from the creation transaction result.');
    }
    
    return contractAddress;
  }

  private async getAccount(address: string): Promise<Account> {
    try {
      const account = await this.rpcServer.getAccount(address);
      return account;
    } catch {
       throw new Error("Wait! Account not found on the network. Is it funded with XLM?");
    }
  }
}
