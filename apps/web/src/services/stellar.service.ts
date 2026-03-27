/**
 * StellarService - Service layer for interacting with Stellar network and contracts
 *
 * This service provides methods for:
 * - Fetching user's payment streams
 * - Creating payment streams
 * - Withdrawing from streams
 * - Distributing tokens to multiple recipients
 *
 * @see https://stellar.github.io/js-stellar-sdk/
 * @see https://developers.stellar.org/docs/build/guides/transactions/invoke-contract-tx-sdk
 */

import {
  Keypair,
  TransactionBuilder,
  Operation,
  Asset,
  Memo,
  Networks,
  xdr,
  Address,
  nativeToScVal,
  scValToNative,
  Account,
} from '@stellar/stellar-sdk';
import { Server as RpcServer, Api, assembleTransaction } from '@stellar/stellar-sdk/rpc';
import { Horizon } from '@stellar/stellar-sdk';
import type {
  Stream,
  CreateStreamParams,
  DistributeParams,
  DistributeEqualParams,
  TransactionResult,
  AccountInfo,
  AccountBalance,
  StellarServiceConfig,
  StreamStatus,
  DistributionHistory,
  HistoryRecord,
} from './types';
import {
  StellarError,
  NetworkError,
  TransactionError,
  TransactionTimeoutError,
  ContractError,
  SimulationError,
  AccountNotFoundError,
  StreamNotFoundError,
  InsufficientFundsError,
  ValidationError,
  parseError,
} from './errors';
import { isAbortError, withAbortSignal, withRetry } from '@/utils/retry';

// Default configuration values
const DEFAULT_TIMEOUT = 30; // seconds
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_FEE = '100'; // stroops

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * StellarService provides methods for interacting with Stellar network
 * and Fundable Protocol smart contracts.
 */
export class StellarService {
  private readonly rpcServer: RpcServer;
  private readonly horizonServer: Horizon.Server;
  private readonly networkPassphrase: string;
  private readonly paymentStreamContractId: string;
  private readonly distributorContractId: string;
  private readonly defaultTimeout: number;
  private readonly maxRetries: number;

  constructor(config: StellarServiceConfig) {
    this.rpcServer = new RpcServer(config.network.rpcUrl, { allowHttp: true });
    this.horizonServer = new Horizon.Server(config.network.horizonUrl, { allowHttp: true });
    this.networkPassphrase = config.network.networkPassphrase;
    this.paymentStreamContractId = config.contracts.paymentStream;
    this.distributorContractId = config.contracts.distributor;
    this.defaultTimeout = config.defaultTimeout ?? DEFAULT_TIMEOUT;
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
  }

  // ============================================
  // Account & Query Methods (Horizon API)
  // ============================================

  /**
   * Get account information from Horizon
   * @param address - Stellar account address
   * @returns Account information including balances
   */
  async getAccount(address: string, signal?: AbortSignal): Promise<AccountInfo> {
    return withRetry(async () => {
      try {
        const account = await withAbortSignal(this.horizonServer.loadAccount(address), signal);

        const balances: AccountBalance[] = account.balances.map((bal: any) => ({
          balance: bal.balance,
          assetType: bal.asset_type,
          assetCode: 'asset_code' in bal ? bal.asset_code : undefined,
          assetIssuer: 'asset_issuer' in bal ? bal.asset_issuer : undefined,
        }));

        return {
          accountId: account.accountId(),
          sequence: account.sequenceNumber(),
          balances,
        };
      } catch (error) {
        if (isAbortError(error)) {
          throw error;
        }
        const err = error as Error & { response?: { status?: number } };
        if (err?.response?.status === 404) {
          throw new AccountNotFoundError(address, err); // 404 — not retried
        }
        throw parseError(error);
      }
    }, { maxRetries: this.maxRetries, signal });
  }

  /**
   * Check if an account exists on the network
   * @param address - Stellar account address
   * @returns true if account exists
   */
  async accountExists(address: string): Promise<boolean> {
    try {
      await this.horizonServer.loadAccount(address);
      return true;
    } catch {
      return false;
    }
  }

  // ============================================
  // Payment Stream Methods (Soroban RPC)
  // ============================================

  /**
   * Get all streams for a given address (as sender or recipient)
   * @param address - User's Stellar address
   * @returns Array of streams where user is sender or recipient
   */
  async getStreams(address: string): Promise<Stream[]> {
    try {
      // Get stream count from contract
      const streamCount = await this.invokeContractReadOnly<bigint>(
        this.paymentStreamContractId,
        'get_stream_count',
        []
      );

      if (!streamCount || streamCount === 0n) {
        return [];
      }

      // Fetch all streams and filter by address
      const streams: Stream[] = [];
      for (let i = 1n; i <= streamCount; i++) {
        try {
          const stream = await this.getStream(i);
          if (stream && (stream.sender === address || stream.recipient === address)) {
            streams.push(stream);
          }
        } catch (error) {
          // Skip streams that can't be fetched (may have been deleted or archived)
          if (!(error instanceof StreamNotFoundError)) {
            throw error;
          }
        }
      }

      return streams;
    } catch (error) {
      // If get_stream_count doesn't exist, try alternative approach
      if (error instanceof ContractError && error.message.includes('not found')) {
        return this.getStreamsByEvents(address);
      }
      throw parseError(error);
    }
  }

  /**
   * Get streams by querying contract events (fallback method)
   * @param address - User's Stellar address
   * @returns Array of streams
   */
  private async getStreamsByEvents(address: string): Promise<Stream[]> {
    try {
      const events = await this.rpcServer.getEvents({
        startLedger: 0,
        filters: [
          {
            type: 'contract',
            contractIds: [this.paymentStreamContractId],
          },
        ],
        limit: 1000,
      });

      const streamIds = new Set<bigint>();
      for (const event of events.events || []) {
        // Look for stream creation events
        if (event.topic && event.topic.length > 0) {
          try {
            const value = scValToNative(event.value);
            if (typeof value === 'bigint') {
              streamIds.add(value);
            }
          } catch {
            // Skip invalid event values
          }
        }
      }

      const streams: Stream[] = [];
      for (const streamId of streamIds) {
        try {
          const stream = await this.getStream(streamId);
          if (stream && (stream.sender === address || stream.recipient === address)) {
            streams.push(stream);
          }
        } catch {
          // Skip streams that can't be fetched
        }
      }

      return streams;
    } catch (error) {
      throw parseError(error);
    }
  }

  /**
   * Get a single stream by ID
   * @param streamId - Stream ID
   * @returns Stream data or null if not found
   */
  async getStream(streamId: bigint): Promise<Stream | null> {
    try {
      const result = await this.invokeContractReadOnly<Stream | null>(
        this.paymentStreamContractId,
        'get_stream',
        [nativeToScVal(streamId, { type: 'u64' })]
      );

      return result ? this.parseStreamResult(result as unknown as Record<string, unknown>) : null;
    } catch (error) {
      if ((error as Error).message?.includes('not found')) {
        throw new StreamNotFoundError(streamId, error as Error);
      }
      throw parseError(error);
    }
  }

  /**
   * Get withdrawable amount for a stream
   * @param streamId - Stream ID
   * @returns Withdrawable amount in token's smallest unit
   */
  async getWithdrawableAmount(streamId: bigint): Promise<bigint> {
    try {
      const result = await this.invokeContractReadOnly<bigint>(
        this.paymentStreamContractId,
        'withdrawable_amount',
        [nativeToScVal(streamId, { type: 'u64' })]
      );

      return result ?? 0n;
    } catch (error) {
      throw parseError(error);
    }
  }

  /**
   * Create a new payment stream
   * @param params - Stream creation parameters
   * @param signerKeypair - Keypair for signing the transaction
   * @returns Transaction result with stream ID
   */
  async createStream(
    params: CreateStreamParams,
    signerKeypair: Keypair
  ): Promise<TransactionResult<bigint>> {
    // Validate parameters
    this.validateCreateStreamParams(params);

    const senderAddress = signerKeypair.publicKey();

    const args = [
      new Address(senderAddress).toScVal(),
      new Address(params.recipient).toScVal(),
      new Address(params.token).toScVal(),
      nativeToScVal(params.totalAmount, { type: 'i128' }),
      nativeToScVal(params.startTime, { type: 'u64' }),
      nativeToScVal(params.endTime, { type: 'u64' }),
    ];

    return this.invokeContract<bigint>(
      this.paymentStreamContractId,
      'create_stream',
      args,
      signerKeypair
    );
  }

  /**
   * Withdraw from a payment stream
   * @param streamId - Stream ID to withdraw from
   * @param amount - Amount to withdraw
   * @param signerKeypair - Keypair for signing (must be stream recipient)
   * @returns Transaction result
   */
  async withdraw(
    streamId: bigint,
    amount: bigint,
    signerKeypair: Keypair
  ): Promise<TransactionResult<void>> {
    // Validate
    if (amount <= 0n) {
      throw new ValidationError('Amount must be positive', 'amount');
    }

    // Check withdrawable amount
    const withdrawable = await this.getWithdrawableAmount(streamId);
    if (amount > withdrawable) {
      throw new InsufficientFundsError(
        `Requested amount (${amount}) exceeds withdrawable amount (${withdrawable})`,
        { required: amount, available: withdrawable }
      );
    }

    const args = [
      nativeToScVal(streamId, { type: 'u64' }),
      nativeToScVal(amount, { type: 'i128' }),
    ];

    return this.invokeContract<void>(
      this.paymentStreamContractId,
      'withdraw',
      args,
      signerKeypair
    );
  }

  /**
   * Pause a payment stream (sender only)
   * @param streamId - Stream ID to pause
   * @param signerKeypair - Keypair for signing (must be stream sender)
   * @returns Transaction result
   */
  async pauseStream(
    streamId: bigint,
    signerKeypair: Keypair
  ): Promise<TransactionResult<void>> {
    const args = [nativeToScVal(streamId, { type: 'u64' })];

    return this.invokeContract<void>(
      this.paymentStreamContractId,
      'pause_stream',
      args,
      signerKeypair
    );
  }

  /**
   * Resume a paused stream (sender only)
   * @param streamId - Stream ID to resume
   * @param signerKeypair - Keypair for signing (must be stream sender)
   * @returns Transaction result
   */
  async resumeStream(
    streamId: bigint,
    signerKeypair: Keypair
  ): Promise<TransactionResult<void>> {
    const args = [nativeToScVal(streamId, { type: 'u64' })];

    return this.invokeContract<void>(
      this.paymentStreamContractId,
      'resume_stream',
      args,
      signerKeypair
    );
  }

  /**
   * Cancel a payment stream (sender only)
   * @param streamId - Stream ID to cancel
   * @param signerKeypair - Keypair for signing (must be stream sender)
   * @returns Transaction result
   */
  async cancelStream(
    streamId: bigint,
    signerKeypair: Keypair
  ): Promise<TransactionResult<void>> {
    const args = [nativeToScVal(streamId, { type: 'u64' })];

    return this.invokeContract<void>(
      this.paymentStreamContractId,
      'cancel_stream',
      args,
      signerKeypair
    );
  }

  // ============================================
  // Distribution Methods (Soroban RPC)
  // ============================================

  /**
   * Distribute tokens to multiple recipients with custom amounts
   * @param params - Distribution parameters
   * @param signerKeypair - Keypair for signing the transaction
   * @returns Transaction result
   */
  async distribute(
    params: DistributeParams,
    signerKeypair: Keypair
  ): Promise<TransactionResult<void>> {
    this.validateDistributeParams(params);

    const senderAddress = signerKeypair.publicKey();

    const recipientScVals = params.recipients.map((r) => new Address(r).toScVal());
    const amountScVals = params.amounts.map((a) => nativeToScVal(a, { type: 'i128' }));

    const args = [
      new Address(senderAddress).toScVal(),
      new Address(params.token).toScVal(),
      xdr.ScVal.scvVec(recipientScVals),
      xdr.ScVal.scvVec(amountScVals),
    ];

    return this.invokeContract<void>(
      this.distributorContractId,
      'distribute_weighted',
      args,
      signerKeypair
    );
  }

  /**
   * Distribute tokens equally to multiple recipients
   * @param params - Equal distribution parameters
   * @param signerKeypair - Keypair for signing the transaction
   * @returns Transaction result
   */
  async distributeEqual(
    params: DistributeEqualParams,
    signerKeypair: Keypair
  ): Promise<TransactionResult<void>> {
    this.validateDistributeEqualParams(params);

    const senderAddress = signerKeypair.publicKey();

    const recipientScVals = params.recipients.map((r) => new Address(r).toScVal());

    const args = [
      new Address(senderAddress).toScVal(),
      new Address(params.token).toScVal(),
      nativeToScVal(params.totalAmount, { type: 'i128' }),
      xdr.ScVal.scvVec(recipientScVals),
    ];

    return this.invokeContract<void>(
      this.distributorContractId,
      'distribute_equal',
      args,
      signerKeypair
    );
  }

  /**
   * Get distribution history from the distributor contract
   * @param startId - Starting history index
   * @param limit - Number of records to fetch
   * @returns Array of distribution history records
   */
  async getDistributionHistory(startId: bigint, limit: bigint): Promise<(DistributionHistory & { id: string })[]> {
    try {
      const result = await this.invokeContractReadOnly<any[]>(
        this.distributorContractId,
        'get_distribution_history',
        [
          nativeToScVal(startId, { type: 'u64' }),
          nativeToScVal(limit, { type: 'u64' }),
        ]
      );

      return (result || []).map((r: any, index: number) => ({
        id: (startId + BigInt(index)).toString(),
        sender: r.sender,
        token: r.token,
        amount: BigInt(r.amount),
        recipients_count: Number(r.recipients_count),
        timestamp: BigInt(r.timestamp),
      }));
    } catch (error) {
      throw parseError(error);
    }
  }

  /**
   * Get total number of distributions
   */
  async getTotalDistributions(): Promise<bigint> {
    try {
      const result = await this.invokeContractReadOnly<bigint>(
        this.distributorContractId,
        'get_total_distributions',
        []
      );
      return result || 0n;
    } catch (error) {
      throw parseError(error);
    }
  }

  /**
   * Get unified transaction history for a user
   * @param address - User's Stellar address
   * @returns Array of history records
   */
  async getTransactionHistory(address: string): Promise<HistoryRecord[]> {
    try {
      // 1. Get streams
      const streams = await this.getStreams(address);
      const streamRecords: HistoryRecord[] = streams.map(s => ({
        id: `stream-${s.id}`,
        type: 'Stream',
        date: new Date(Number(s.startTime) * 1000).toISOString(),
        amount: s.totalAmount,
        token: s.token,
        recipients: 1, // Streams are 1-to-1 in current contract
        status: s.status,
      }));

      // 2. Get distributions
      const totalDist = await this.getTotalDistributions();
      const distributions: DistributionHistory[] = [];

      // Filter distributions by sender (heavy operation if many distributions)
      // For now, fetch ALL and filter (MVP)
      // In production, use Horizon events or a specialized indexer
      if (totalDist > 0n) {
        const history = await this.getDistributionHistory(0n, totalDist);
        distributions.push(...history.filter(h => h.sender === address));
      }

      const distributionRecords: HistoryRecord[] = distributions.map((d, index) => ({
        id: `dist-${index}`,
        type: 'Distribution',
        date: new Date(Number(d.timestamp) * 1000).toISOString(),
        amount: d.amount,
        token: d.token,
        recipients: d.recipients_count,
        status: 'Completed',
      }));

      // Combine and sort by date descending
      return [...streamRecords, ...distributionRecords].sort((a, b) =>
        new Date(b.date).getTime() - new Date(a.date).getTime()
      );
    } catch (error) {
      throw parseError(error);
    }
  }

  // ============================================
  // Private Methods: Contract Invocation
  // ============================================

  /**
   * Invoke a contract method (read-only, no transaction)
   */
  private async invokeContractReadOnly<T>(
    contractId: string,
    method: string,
    args: xdr.ScVal[]
  ): Promise<T | null> {
    try {
      // Create a simulation request
      const accountResponse = await this.rpcServer.getAccount(contractId) as any;
      const sourceAccount = new Account(accountResponse.id || accountResponse.accountId, accountResponse.sequence);

      const tx = new TransactionBuilder(sourceAccount, {
        fee: DEFAULT_BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(
          Operation.invokeHostFunction({
            func: xdr.HostFunction.hostFunctionTypeInvokeContract(
              new xdr.InvokeContractArgs({
                contractAddress: new Address(contractId).toScAddress(),
                functionName: method,
                args,
              })
            ),
            auth: [],
          })
        )
        .setTimeout(this.defaultTimeout)
        .build();

      const simulation = await this.rpcServer.simulateTransaction(tx);

      if (Api.isSimulationError(simulation)) {
        throw new SimulationError(
          `Simulation failed: ${simulation.error}`,
          simulation
        );
      }

      if (Api.isSimulationSuccess(simulation) && simulation.result) {
        return scValToNative(simulation.result.retval) as T;
      }

      return null;
    } catch (error) {
      if (error instanceof StellarError) {
        throw error;
      }
      throw new ContractError(`Failed to read from contract: ${(error as Error).message}`, {
        contractId,
        method,
        originalError: error as Error,
      });
    }
  }

  /**
   * Invoke a contract method with a transaction
   */
  private async invokeContract<T>(
    contractId: string,
    method: string,
    args: xdr.ScVal[],
    signerKeypair: Keypair
  ): Promise<TransactionResult<T>> {
    const senderAddress = signerKeypair.publicKey();

    return withRetry(async () => {
      try {
        // Load account from RPC
        const account = await this.rpcServer.getAccount(senderAddress);

        // Build the transaction
        const tx = new TransactionBuilder(account, {
          fee: DEFAULT_BASE_FEE,
          networkPassphrase: this.networkPassphrase,
        })
          .addOperation(
            Operation.invokeHostFunction({
              func: xdr.HostFunction.hostFunctionTypeInvokeContract(
                new xdr.InvokeContractArgs({
                  contractAddress: new Address(contractId).toScAddress(),
                  functionName: method,
                  args,
                })
              ),
              auth: [],
            })
          )
          .setTimeout(this.defaultTimeout)
          .build();

        // Simulate transaction
        const simulation = await this.rpcServer.simulateTransaction(tx);

        if (Api.isSimulationError(simulation)) {
          throw new SimulationError(
            `Transaction simulation failed: ${simulation.error}`,
            simulation
          );
        }

        // Prepare transaction with simulation result
        const preparedTx = assembleTransaction(tx, simulation).build();

        // Sign the transaction
        preparedTx.sign(signerKeypair);

        // Submit and wait for result
        const result = await this.submitAndWait(preparedTx);

        return result as TransactionResult<T>;
      } catch (error) {
        if (error instanceof StellarError) {
          throw error;
        }
        throw new ContractError(`Contract invocation failed: ${(error as Error).message}`, {
          contractId,
          method,
          originalError: error as Error,
        });
      }
    });
  }

  /**
   * Submit transaction and wait for confirmation
   */
  private async submitAndWait(tx: any): Promise<TransactionResult<unknown>> {
    const sendResponse = await withRetry(() => this.rpcServer.sendTransaction(tx), { maxRetries: this.maxRetries }) as Awaited<ReturnType<typeof this.rpcServer.sendTransaction>>;
    const hash = sendResponse.hash;

    if (sendResponse.status === 'ERROR') {
      throw new TransactionError('Transaction submission failed', {
        txHash: hash,
        resultCodes: sendResponse.errorResult
          ? [sendResponse.errorResult.result().switch().name]
          : undefined,
      });
    }

    // Poll for transaction result
    let getResponse = await this.rpcServer.getTransaction(hash);
    const maxWaitTime = this.defaultTimeout * 1000;
    const startTime = Date.now();

    while (getResponse.status === Api.GetTransactionStatus.NOT_FOUND) {
      if (Date.now() - startTime > maxWaitTime) {
        throw new TransactionTimeoutError(hash);
      }

      await sleep(1000);
      getResponse = await this.rpcServer.getTransaction(hash);
    }

    if (getResponse.status === Api.GetTransactionStatus.SUCCESS) {
      let result: unknown = undefined;
      if (getResponse.returnValue) {
        result = scValToNative(getResponse.returnValue);
      }

      return {
        hash,
        success: true,
        result,
        ledger: getResponse.ledger,
      };
    }

    throw new TransactionError('Transaction failed', {
      txHash: hash,
      resultCodes: getResponse.resultXdr
        ? [getResponse.resultXdr.result().switch().name]
        : undefined,
    });
  }

  // ============================================
  // Private Methods: Validation
  // ============================================

  private validateCreateStreamParams(params: CreateStreamParams): void {
    if (!params.recipient || !this.isValidAddress(params.recipient)) {
      throw new ValidationError('Invalid recipient address', 'recipient');
    }
    if (!params.token || !this.isValidAddress(params.token)) {
      throw new ValidationError('Invalid token address', 'token');
    }
    if (params.totalAmount <= 0n) {
      throw new ValidationError('Amount must be positive', 'totalAmount');
    }
    if (params.endTime <= params.startTime) {
      throw new ValidationError('End time must be after start time', 'endTime');
    }
  }

  private validateDistributeParams(params: DistributeParams): void {
    if (!params.recipients || params.recipients.length === 0) {
      throw new ValidationError('At least one recipient is required', 'recipients');
    }
    if (params.recipients.length !== params.amounts.length) {
      throw new ValidationError(
        'Recipients and amounts arrays must have the same length',
        'amounts'
      );
    }
    for (const recipient of params.recipients) {
      if (!this.isValidAddress(recipient)) {
        throw new ValidationError(`Invalid recipient address: ${recipient}`, 'recipients');
      }
    }
    for (const amount of params.amounts) {
      if (amount <= 0n) {
        throw new ValidationError('All amounts must be positive', 'amounts');
      }
    }
    if (!params.token || !this.isValidAddress(params.token)) {
      throw new ValidationError('Invalid token address', 'token');
    }
  }

  private validateDistributeEqualParams(params: DistributeEqualParams): void {
    if (!params.recipients || params.recipients.length === 0) {
      throw new ValidationError('At least one recipient is required', 'recipients');
    }
    for (const recipient of params.recipients) {
      if (!this.isValidAddress(recipient)) {
        throw new ValidationError(`Invalid recipient address: ${recipient}`, 'recipients');
      }
    }
    if (params.totalAmount <= 0n) {
      throw new ValidationError('Total amount must be positive', 'totalAmount');
    }
    if (!params.token || !this.isValidAddress(params.token)) {
      throw new ValidationError('Invalid token address', 'token');
    }
  }

  private isValidAddress(address: string): boolean {
    // Stellar addresses are 56 characters starting with G (for public keys)
    // or C (for contract addresses)
    return /^[GC][A-Z2-7]{55}$/.test(address);
  }

  // ============================================
  // Private Methods: Response Parsing
  // ============================================

  private parseStreamResult(result: Record<string, unknown>): Stream {
    const statusMap: Record<string, StreamStatus> = {
      Active: 'Active',
      Paused: 'Paused',
      Canceled: 'Canceled',
      Completed: 'Completed',
    };

    // Handle both snake_case (from contract) and camelCase (from SDK)
    return {
      id: BigInt(result.id as number | bigint),
      sender: String(result.sender),
      recipient: String(result.recipient),
      token: String(result.token),
      totalAmount: BigInt((result.total_amount ?? result.totalAmount ?? 0) as any),
      withdrawnAmount: BigInt((result.withdrawn_amount ?? result.withdrawnAmount ?? 0) as any),
      startTime: BigInt((result.start_time ?? result.startTime ?? 0) as any),
      endTime: BigInt((result.end_time ?? result.endTime ?? 0) as any),
      status: statusMap[String(result.status)] || 'Active',
    };
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a StellarService configured for testnet
 */
export function createTestnetService(contracts: {
  paymentStream: string;
  distributor: string;
}): StellarService {
  return new StellarService({
    network: {
      networkPassphrase: Networks.TESTNET,
      rpcUrl: 'https://soroban-testnet.stellar.org',
      horizonUrl: 'https://horizon-testnet.stellar.org',
    },
    contracts,
  });
}

/**
 * Create a StellarService configured for mainnet
 */
export function createMainnetService(contracts: {
  paymentStream: string;
  distributor: string;
}): StellarService {
  return new StellarService({
    network: {
      networkPassphrase: Networks.PUBLIC,
      rpcUrl: 'https://soroban.stellar.org',
      horizonUrl: 'https://horizon.stellar.org',
    },
    contracts,
  });
}

// Re-export types and errors
export * from './types';
export * from './errors';
