/**
 * Typed error classes for the ContractDeployer module.
 */

export class DeployerError extends Error {
  public readonly code: string;
  public readonly originalError?: Error;

  constructor(message: string, code: string, originalError?: Error) {
    super(message);
    this.name = 'DeployerError';
    this.code = code;
    this.originalError = originalError;
    Object.setPrototypeOf(this, DeployerError.prototype);
  }
}

/** Thrown when the provided .wasm buffer is empty or malformed. */
export class InvalidWasmError extends DeployerError {
  constructor(message = 'Invalid or empty WASM buffer', originalError?: Error) {
    super(message, 'INVALID_WASM', originalError);
    this.name = 'InvalidWasmError';
    Object.setPrototypeOf(this, InvalidWasmError.prototype);
  }
}

/** Thrown when the deployer account cannot be loaded from the network. */
export class DeployerAccountError extends DeployerError {
  public readonly address: string;
  constructor(address: string, originalError?: Error) {
    super(`Deployer account not found or unfunded: ${address}`, 'DEPLOYER_ACCOUNT_ERROR', originalError);
    this.name = 'DeployerAccountError';
    this.address = address;
    Object.setPrototypeOf(this, DeployerAccountError.prototype);
  }
}

/** Thrown when the upload (install) transaction fails. */
export class WasmUploadError extends DeployerError {
  public readonly txHash?: string;
  constructor(message: string, txHash?: string, originalError?: Error) {
    super(message, 'WASM_UPLOAD_ERROR', originalError);
    this.name = 'WasmUploadError';
    this.txHash = txHash;
    Object.setPrototypeOf(this, WasmUploadError.prototype);
  }
}

/** Thrown when the contract instantiation transaction fails. */
export class ContractInstantiationError extends DeployerError {
  public readonly txHash?: string;
  constructor(message: string, txHash?: string, originalError?: Error) {
    super(message, 'CONTRACT_INSTANTIATION_ERROR', originalError);
    this.name = 'ContractInstantiationError';
    this.txHash = txHash;
    Object.setPrototypeOf(this, ContractInstantiationError.prototype);
  }
}

/** Thrown when fee/resource simulation fails. */
export class FeeEstimationError extends DeployerError {
  constructor(message: string, originalError?: Error) {
    super(message, 'FEE_ESTIMATION_ERROR', originalError);
    this.name = 'FeeEstimationError';
    Object.setPrototypeOf(this, FeeEstimationError.prototype);
  }
}

/**
 * Thrown when a deployment transaction is not confirmed within
 * the configured timeout period.
 *
 * @remarks
 * The deployer continuously polls the network for confirmation.
 * If the timeout is exceeded, this error is raised.
 *
 * @example
 * ```ts
 * try {
 *   await deployer.deployContract(...);
 * } catch (err) {
 *   if (err instanceof DeploymentTimeoutError) {
 *     console.error('Deployment took too long');
 *   }
 * }
 * ```
 */
/** Thrown when a transaction confirmation times out. */
export class DeploymentTimeoutError extends DeployerError {
  public readonly txHash: string;
  constructor(txHash: string) {
    super(
      `Deployment transaction timed out. It may still be processed. Hash: ${txHash}`,
      'DEPLOYMENT_TIMEOUT'
    );
    this.name = 'DeploymentTimeoutError';
    this.txHash = txHash;
    Object.setPrototypeOf(this, DeploymentTimeoutError.prototype);
  }
}
